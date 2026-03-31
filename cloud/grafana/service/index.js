const fs = require('node:fs');
const net = require('node:net');
const { execSync } = require('node:child_process');
const mqtt = require('mqtt');
const _ = require('lodash');

const { MqttSync, getLogger, registerCatchAll, getRandomId, versionCompare }
  = require('@transitive-sdk/utils');
const Mongo = require('@transitive-sdk/mongo');
const ClickHouse = require('@transitive-sdk/clickhouse');

const log = getLogger('index.js');
log.setLevel('debug');

registerCatchAll();

GRAFANA_API_HOST = `http://localhost:3000`;
GRAFANA_API_HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Basic ${btoa(`admin:${process.env.GRAFANA_ADMIN_PASSWORD}`)}`
};

/* Cache of already provisioned orgs and their assets */
const provisioned = {};

/* Cache of assets from packages to provision. Avoids repeated fetching from
registry.*/
const assets = {};

/** Ensure the given org exists, retun it's Grafana org id (Number) */
const ensureOrg = async (org) => {
  const result = await fetch(`${GRAFANA_API_HOST}/api/orgs/name/${org}`, {
    headers: GRAFANA_API_HEADERS
  });

  if (result.ok) {
    const json = await result.json();
    return json.id;
  }

  // does not yet exist, create it
  const postResult = await fetch(`${GRAFANA_API_HOST}/api/orgs`, {
    method: 'POST',
    headers: GRAFANA_API_HEADERS,
    body: JSON.stringify({name: org})
  });

  if (!postResult.ok) {
    log.warn(`Failed to provision Grafana org ${org}`);
    return;
  }

  const json = await postResult.json();
  return json.orgId;
};

/** Ensure the main user for the org exists (same name as org itself). */
const ensureUser = async (grafanaOrgId, orgId) => {
  const result = await fetch(`${GRAFANA_API_HOST}/api/orgs/${grafanaOrgId}/users`, {
    headers: GRAFANA_API_HEADERS
  });

  if (result.ok) {
    const users = await result.json();
    const user = users.find(user => user.login == orgId);
    if (user) {
      log.debug('user exists', orgId);
      return user.userId;
    }
  }

  // does not yet exist, create it
  const password = getRandomId(12);
  const postResult = await fetch(`${GRAFANA_API_HOST}/api/admin/users`, {
    method: 'POST',
    headers: GRAFANA_API_HEADERS,
    body: JSON.stringify({
      name: orgId,
      email: orgId,
      login: orgId,
      password,
      OrgId: grafanaOrgId
    })
  });

  if (!postResult.ok) {
    log.warn(`Failed to add user ${orgId}`, postResult.status);
    return;
  }

  // save password in mongo
  const accounts = Mongo.db.collection('accounts');
  const updateResult = await accounts.updateOne(
    {_id: orgId}, {$set: {grafanaPassword: password}});

  const user = await postResult.json();
  log.debug('created', user);

  return user.id;
}


/** Sets the users role in the given org to "Editor". */
const ensureUserIsEditor = async (grafanaOrgId, userId) => {

  const result = await fetch(
    `${GRAFANA_API_HOST}/api/orgs/${grafanaOrgId}/users/${userId}`,
    {
      method: 'PATCH',
      headers: GRAFANA_API_HEADERS,
      body: JSON.stringify({ role: 'Editor' })
    });

  if (!result.ok) {
    log.warn(`Failed to make user ${userId} Editor on Grafana org ${grafanaOrgId}`, result.status);
    return false;
  }

  return true;
}

/** Add the ClickHouse data source to the org's provisioning. orgId is the
* Transitive orgId */
const ensureDatasource = async (grafanaOrgId, orgId) => {
  const accounts = Mongo.db.collection('accounts');
  const {user, password} = await ClickHouse.ensureClickHouseOrgUser(orgId, accounts);

  const env = [
      'env',
      `ORGID=${grafanaOrgId}`,
      `USER=${user}`,
      `PASSWORD=${password}`
    ].join(' ');
  const template = './templates/datasources/clickhouse-org.template.yaml';
  const destination = `/etc/grafana/provisioning/datasources/clickhouse-org.${orgId}.yaml`;
  execSync(`${env} envsubst < ${template} > ${destination}`);
};

/** Ensures that the Grafana org fore the given Transitive user (orgId) exists. */
const provisionOrg = async (orgId) => {
  provisioned[orgId] ||= {};

  if (provisioned[orgId].org) {
    return;
  }

  provisioned[orgId].org = true;

  // first ensure the org exists
  const grafanaOrgId = await ensureOrg(orgId);
  if (!grafanaOrgId) return;
  provisioned[orgId].grafanaOrgId = grafanaOrgId;

  // next ensure the org's main user exists
  const userId = await ensureUser(grafanaOrgId, orgId);
  if (!userId) return;

  const madeEditor = await ensureUserIsEditor(grafanaOrgId, userId);
  if (!madeEditor) return;

  // provision data source
  await ensureDatasource(grafanaOrgId, orgId);
};

/** get alerts provided by `capability`, either from cache of from registry */
const getAlerts = async (scope, capName, version) => {
  const capability = `${scope}/${capName}`;
  const capWithVersion = `${capability}/${version}`;

  assets[capability] ||= {};

  if (!assets[capability].alerts) {
    const host = (scope == '@transitive-robotics' && !process.env.TR_REGISTRY_IS_LOCAL
      ? 'https://registry.transitiverobotics.com' : `http://registry`);
    const capRegistryUrl = `${host}/-/custom/files/${capWithVersion}`;

    const alerts = await fetch(`${capRegistryUrl}/grafana/alerting/template.json`,
      {headers: { 'Content-Type': 'application/json' }});

    if (alerts.ok) {
      log.debug(`${capability} provides alerts`);
      const alertsJson = await alerts.json();
      assets[capability].alerts = alertsJson;
    } else {
      assets[capability].alerts = {}; // none provided, but remember we looked!
    }
  }

  return assets[capability].alerts;
}

/** Fetch and provision to orgId any assets provided by the capability */
const provisionCapabilityAssets = async (orgId, scope, capName, version) => {

  provisioned[orgId].caps ||= {};
  const capability = `${scope}/${capName}`;

  if (provisioned[orgId].caps[capability] &&
    versionCompare(provisioned[orgId].caps[capability], version) >= 0) {
    return;
  }

  // version is higher than what has been provisioned so far
  provisioned[orgId].caps[capability] = version;

  const alerts = getAlerts(scope, capName, version);

  if (alerts?.groups) {
    // Ground the template, i.e., subsitute specific fields for this user and
    // capability
    alerts.groups.forEach(group => {
      group.orgId = provisioned[orgId].grafanaOrgId;
      group.folder = `Templates/${capability}`;
      group.rules.forEach(rule => {
        rule.uid = `${capName}-${rule.uid}`
        rule.isPaused = true;
      });
    });

    fs.writeFileSync(`/etc/grafana/provisioning/alerting/org-${orgId}.json`,
      JSON.stringify(alerts));
  }
};

/** Trigger reload of Grafana's file-based provisioning */
const reloadProvisioning = async () => {
  for (let asset of ['datasources', 'alerting']) {
    const result = await fetch(
      `${GRAFANA_API_HOST}/api/admin/provisioning/${asset}/reload`,
      {
        method: 'POST',
        headers: GRAFANA_API_HEADERS,
      });
    log.debug(await result.text());
  }
};


// ---------------------------------------------------------------------------

// backlog of orgs and capabilities to provision, to be processed in an orderly
// fashion, to avoid too many concurrent threads (calls to API), which can lead
// to Grafana errors about the database being locked.
const backlog = {};
const processed = {}; // hashes already processed, to avoid repetition

let processing = false;
const processBacklog = async () => {
  if (processing) return;

  processing = true;
  const nextKey = Object.keys(backlog)[0];

  if (!nextKey) {
    // backlog is empty, trigger provisioning reload and end processing
    await reloadProvisioning();
    processing = false;
    return;
  }

  log.debug('provisioning', nextKey);
  const {orgId, scope, capName, version} = backlog[nextKey];
  delete backlog[nextKey];
  processed[nextKey] = true;

  await provisionOrg(orgId);
  await provisionCapabilityAssets(orgId, scope, capName, version);

  processing = false;
  processBacklog();
}

/** This is the main function */
const init = async (mqttSync) => {
  await ClickHouse.init();

  mqttSync.subscribe('/+/+/+/_robot-agent/+/status/runningPackages/#');
  mqttSync.data.subscribePath(
    '/+orgId/+/+/_robot-agent/+/status/runningPackages/+scope/+capName/+version',
    async (running, topic, {orgId, scope, capName, version}) => {
      if (!running) return;
      const hash = [orgId, scope, capName, version].join('-');
      if (processed[hash]) return;
      backlog[hash] = {orgId, scope, capName, version};
      processBacklog();
    });
};


// --------------------------------------------------------------------------
// MQTT

const MQTT_URL = process.env.MQTT_URL || 'mqtts://mosquitto';

const mqttClient = mqtt.connect(MQTT_URL, {
  key: fs.readFileSync(`certs/client.key`),
  cert: fs.readFileSync(`certs/client.crt`),
  rejectUnauthorized: false,
  protocolVersion: 5 // needed for the `rap` option, i.e., to get retain flags
});

log.info('connecting');

mqttClient.on('connect', () => log.info('(re-)connected'));
mqttClient.on('error', log.error.bind(log));
mqttClient.on('disconnect', log.warn.bind(log));

mqttClient.once('connect', () => {
  log.info('connected');
  const mqttSync = new MqttSync({mqttClient});

  Mongo.init(() => {
    init(mqttSync);
  });
});

