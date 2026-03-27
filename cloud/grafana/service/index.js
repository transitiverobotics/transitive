
const fs = require('node:fs');
const net = require('node:net');
const { execSync } = require('node:child_process');
const mqtt = require('mqtt');
const _ = require('lodash');

const { MqttSync, getLogger, registerCatchAll, getRandomId }
  = require('@transitive-sdk/utils');
const Mongo = require('@transitive-sdk/mongo');

const log = getLogger('index.js');
log.setLevel('debug');

registerCatchAll();

GRAFANA_API_HOST = `http://localhost:3000`;
GRAFANA_API_HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Basic ${btoa(`admin:${process.env.GRAFANA_ADMIN_PASSWORD}`)}`
};

/** Cache of already provisioned orgs and their assets */
const provisioned = {
};

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
  const orgAccount = await accounts.findOne({_id: orgId});
  if (!orgAccount?.clickhouseCredentials) {
    log.warn(`No ClickHouse credentials for ${orgId}`);
    return;
  }

  const env = [
      'env',
      `ORGID=${grafanaOrgId}`,
      `USER=${orgAccount?.clickhouseCredentials.user}`,
      `PASSWORD=${orgAccount?.clickhouseCredentials.password}`
    ].join(' ');
  const template = './templates/datasources/clickhouse-org.template.yaml';
  const destination = `/etc/grafana/provisioning/datasources/clickhouse-org.${orgId}.yaml`;
  execSync(`${env} envsubst < ${template} > ${destination}`);

  // trigger a reload
  const result = await fetch(
    `${GRAFANA_API_HOST}/api/admin/provisioning/datasources/reload`,
    {
      method: 'POST',
      headers: GRAFANA_API_HEADERS,
    });
};

// ---------------------------------------------------------------------------

/** This is the main function */
const init = async (mqttSync) => {
  mqttSync.subscribe('/+/+/+/_robot-agent/+/status/runningPackages/#');
  mqttSync.data.subscribePath(
    '/+orgId/+/+/_robot-agent/+/status/runningPackages/+scope/+capName/+',
    async (running, topic, {orgId, scope, capName}) => {
      if (!running) return;

      if (provisioned[orgId]) {
        return;
      }
      provisioned[orgId] = true;

      // first ensure the org exists
      const grafanaOrgId = await ensureOrg(orgId);

      // next ensure the org's main user exists
      const userId = await ensureUser(grafanaOrgId, orgId);
      await ensureUserIsEditor(grafanaOrgId, userId);

      // provision data source
      await ensureDatasource(grafanaOrgId, orgId);
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

