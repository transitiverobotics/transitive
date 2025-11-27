const semver = require('semver');
const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const Mongo = require('@transitive-sdk/mongo');
const ClickHouse = require('@transitive-sdk/clickhouse');
const { getLogger, getRandomId, wait } = require('@transitive-sdk/utils');

const log = getLogger('utils');

log.setLevel('debug');

/** given a list of used numbers, find the next contiguous range of ports in the
* given range that is not yet used */
const getNextInRange = (allUsed, range, count = 1) => {

  if (!allUsed?.length) {
    return {min: range[0], max: range[0] + count - 1}
  }

  const used = allUsed.sort((a, b) => a - b);
  const rtv = {min: range[0], max: null};
  for (let i = 0; i < used.length; i++) {
    const port = used[i];
    if (port >= rtv.min + count) {
      // There is enough space before this used port
      rtv.max = rtv.min + (count - 1);
      if (rtv.max > range[1]) return null;
      return rtv;
    } else {
      rtv.min = Math.max(port + 1, rtv.min);
    }
  }

  // no allocation found before or between existing used ports, try behind:
  const next = Math.max(used.at(-1) + 1, range[0]);
  if (next + count - 1 <= range[1]) {
    return {min: next, max: next + count - 1};
  }

  // no allocation possible
  return null;
};

/** Given a semver and a release type (version namespace), generate the version
*  range for it. Example: getVersionRange('1.2.3', 'minor') => 1.2.x
*/
const getVersionRange = (version, type) => {
  const range = semver.parse(version);
  const releaseTypes = ['major', 'minor', 'patch'];
  for (let i = releaseTypes.length - 1; releaseTypes[i] != type; i-- ) {
    const releaseType = releaseTypes[i];
    range[releaseType] &&= 'x';
  }
  return range.format();
};


/** Ensure ClickHouse database and user exist for a capability
 * Only used with admin ClickHouse user credentials.
 * @param {string} capName - capability name
 * @returns {Object} - {dbName, user, password}
 */
const ensureCapabilityDB = async (capName) => {
  const dbName = `cap_${capName.replace(/@/g, '').replace('/', '_').replace(/-/g, '')}`;
  log.debug(`Setting up ClickHouse database: ${dbName}`);

  await ClickHouse.client.exec({
    query: `CREATE DATABASE IF NOT EXISTS ${dbName}`
  });

  const user = `${dbName}_user`;
  log.debug(`ensuring clickhouse user ${user} for database ${dbName}`);
  // Check if user exists
  const userExists = await ClickHouse.client.query({
    query: `SELECT name FROM system.users WHERE name = '${user}'`,
    format: 'JSONEachRow'
  });

  const users = await userExists.json();
  const capabilitiesCollection = Mongo.db.collection('capabilities')
  if (users.length > 0) {
    // retrieve password from mongo
    const capabilityDoc = await capabilitiesCollection.findOne({ name: capName });
    if (capabilityDoc?.clickhouseCredentials) {
      log.debug(`ClickHouse user ${user} for database ${dbName} exists, retrieved credentials from mongo`);
      return capabilityDoc.clickhouseCredentials;
    }
  }

  // Generate new password if user doesn't exist
  const password = getRandomId(15);

  // store user and password in mongo
  await capabilitiesCollection.updateOne(
    { name: capName },
    { $set: { clickhouseCredentials: { dbName, user, password } } },
    { upsert: true }
  );

  // create database user if needed
  await ClickHouse.client.exec({
    query: `CREATE USER IF NOT EXISTS ${user} IDENTIFIED WITH plaintext_password BY '${password}'`
  });

  // grant all privileges on the cap database to the user
  await ClickHouse.client.exec({
    query: `GRANT ALL ON ${dbName}.* TO ${user}`
  });

  // create row level security policy to allow access to all rows
  await ClickHouse.client.exec({
    query: `CREATE ROW POLICY IF NOT EXISTS ${user}_policy ON ${dbName}.* USING 1 TO ${user}`
  });
  
  await ClickHouse.client.exec({
    query: `CREATE ROW POLICY IF NOT EXISTS ${dbName}_customers ON ${dbName}.* USING concat('org_', OrgId, '_user') = currentUser() TO ALL`
  });

  await ClickHouse.client.exec({
    query: `CREATE ROW POLICY IF NOT EXISTS ${dbName}_admin ON ${dbName}.* USING 1 TO ${process.env.CLICKHOUSE_USER}`
  });

  log.debug(`ClickHouse user ${user} for database ${dbName} created`);

  return { dbName, user, password };
}

/** Waits for ClickHouse to be ready */
const waitForClickHouse = async () => {
  log.debug('Waiting for ClickHouse to be ready...');
  const start = Date.now();
  const timeout = 2 * 60 * 1000; // 2 minutes before giving up
  while (Date.now() - start < timeout) {
    try {
      await ClickHouse.client.query({ query: 'SELECT 1' });
      log.debug('ClickHouse is ready');
      return;
    } catch (err) {
      log.debug('ClickHouse not ready yet:', err.message);
    }
    await wait(2000);
  }
  throw new Error('Timeout waiting for ClickHouse to be ready');
};

/* sets up default row level security policies in ClickHouse */
const ensureClickouseDefaultPermissions = async () => {
  await ClickHouse.client.exec({
    query: `CREATE ROW POLICY IF NOT EXISTS default_customers ON default.* USING concat('org_', OrgId, '_user') = currentUser() TO ALL`
  });

  await ClickHouse.client.exec({
    query: `CREATE ROW POLICY IF NOT EXISTS default_admin ON default.* USING 1 TO ${process.env.CLICKHOUSE_USER || 'default'}`
  });
};

/* creates ClickHouse user for an organization with SELECT access for all dbs and tables */
const ensureClickHouseOrgUser = async (orgId) => {
  const orgUser = `org_${orgId}_user`;
  // Check if user exists
  const userExists = await ClickHouse.client.query({
    query: `SELECT name FROM system.users WHERE name = '${orgUser}'`,
    format: 'JSONEachRow'
  });
  const accountsCollection = Mongo.db.collection('accounts');
  const users = await userExists.json();
  if (users.length > 0) {
    log.debug(`ClickHouse user for organization ${orgId} already exists`);
    const orgDoc = await accountsCollection.findOne({ _id: orgId });
    const { user: orgUser, password } = orgDoc.clickhouseCredentials;
    if (!password) {
      throw new Error(`ClickHouse user for organization ${orgId} exists but no password found in mongo`);
    } else {
      log.debug(`retrieved ClickHouse credentials for organization ${orgId} from mongo: ${orgUser} / ${password}`);
      return { 
        user: orgUser,
        password: password
      };
    }
  }

  const orgPassword = getRandomId(15);

  log.debug(`creating ClickHouse user for organization ${orgId} : ${orgUser} / ${orgPassword}`);

  // create user
  await ClickHouse.client.exec({
    query: `CREATE USER IF NOT EXISTS ${orgUser} IDENTIFIED WITH plaintext_password BY '${orgPassword}'`
  });

  // grant read only access to all databases and tables - row level security will limit access to own org data
  await ClickHouse.client.exec({
    query: `GRANT SELECT ON *.* TO ${orgUser}`
  });

  // store user and password in mongo
  await accountsCollection.updateOne(
    { _id: orgId },
    { $set: { clickhouseCredentials: { user: orgUser, password: orgPassword } } }
  );

  return {
    user: orgUser,
    password: orgPassword
  };
}

/** Create HyperDX team document */
const createHyperDXTeam = (teamId, teamName) => {
  const now = new Date();
  return {
    _id: teamId,
    name: teamName,
    allowedAuthMethods: [],
    collectorAuthenticationEnforced: true,
    hookId: getRandomId(36),
    apiKey: getRandomId(36),
    createdAt: now,
    updatedAt: now,
    __v: 0
  };
};

/** Create HyperDX user document */
const createHyperDXUser = (userId, email, password, teamId) => {
  const now = new Date();
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 25000, 512, 'sha256').toString('hex');
  
  return {
    _id: userId,
    email,
    name: email,
    accessKey: getRandomId(36),
    salt,
    hash,
    team: teamId,
    createdAt: now,
    updatedAt: now,
    __v: 0
  };
};

/** Create HyperDX connection document */
const createHyperDXConnection = (connectionId, teamId, name, username, password) => {
  const now = new Date();
  return {
    _id: connectionId,
    team: teamId,
    name,
    host: process.env.CLICKHOUSE_URL || 'http://clickhouse:8123',
    username,
    password,
    createdAt: now,
    updatedAt: now,
    __v: 0
  };
};

/** Create HyperDX log source document */
const createHyperDXLogSource = (logSourceId, teamId, connectionId, metricSourceId) => {
  const now = new Date();
  return {
    _id: logSourceId,
    kind: 'log',
    team: teamId,
    from: {
      databaseName: 'default',
      tableName: 'logs'
    },
    timestampValueExpression: 'TimestampTime',
    connection: connectionId,
    name: 'Logs',
    displayedTimestampValueExpression: 'Timestamp',
    implicitColumnExpression: 'Body',
    serviceNameExpression: 'ServiceName',
    bodyExpression: 'Body',
    eventAttributesExpression: 'LogAttributes',
    resourceAttributesExpression: 'ResourceAttributes',
    defaultTableSelectExpression: 'Timestamp,ServiceName,SeverityText,Body',
    severityTextExpression: 'SeverityText',
    traceIdExpression: 'TraceId',
    spanIdExpression: 'SpanId',
    metricSourceId: metricSourceId.toString(),
    createdAt: now,
    updatedAt: now,
    __v: 0
  };
};

/** Create HyperDX metric source document */
const createHyperDXMetricSource = (metricSourceId, teamId, connectionId, logSourceId) => {
  const now = new Date();
  return {
    _id: metricSourceId,
    kind: 'metric',
    team: teamId,
    from: {
      databaseName: 'default',
      tableName: ''
    },
    timestampValueExpression: 'TimeUnix',
    connection: connectionId,
    name: 'Metrics',
    resourceAttributesExpression: 'ResourceAttributes',
    metricTables: {
      gauge: 'metrics',
      _id: new ObjectId()
    },
    logSourceId: logSourceId.toString(),
    createdAt: now,
    updatedAt: now,
    __v: 0
  };
};

/** Helper: Create complete HyperDX setup (team, user, connection, sources)
 * @param {Object} config - Configuration object
 * @param {string} config.teamName - Name of the team
 * @param {string} config.userEmail - Email for the user
 * @param {string} config.userPassword - Password for the user
 * @param {string} config.connectionName - Name of the connection
 * @param {string} config.clickhouseUser - ClickHouse username
 * @param {string} config.clickhousePassword - ClickHouse password
 * @param {string} config.logContext - Context string for logging
 */
const createHyperDXSetup = async (config) => {
  const hyperDXDb = Mongo.client.db('hyperdx');
  const teamsCollection = hyperDXDb.collection('teams');
  const usersCollection = hyperDXDb.collection('users');
  const connectionsCollection = hyperDXDb.collection('connections');
  const sourcesCollection = hyperDXDb.collection('sources');

  // Check if team already exists
  const existingTeam = await teamsCollection.findOne({ name: config.teamName });
  if (existingTeam) {
    log.debug(`HyperDX team ${config.teamName} already exists`);
    return;
  }

  const teamId = new ObjectId();
  const userId = new ObjectId();
  const connectionId = new ObjectId();
  const logSourceId = new ObjectId();
  const metricSourceId = new ObjectId();
  
  // Create team
  await teamsCollection.insertOne(createHyperDXTeam(teamId, config.teamName));
  log.debug(`Created HyperDX team ${config.logContext}: ${teamId}`);

  // Create user
  await usersCollection.insertOne(
    createHyperDXUser(userId, config.userEmail, config.userPassword, teamId)
  );
  log.debug(`Created HyperDX user ${config.logContext}: ${config.userEmail}`);

  // Create ClickHouse connection
  await connectionsCollection.insertOne(
    createHyperDXConnection(connectionId, teamId, config.connectionName, 
      config.clickhouseUser, config.clickhousePassword)
  );
  log.debug(`Created HyperDX connection ${config.logContext}: ${connectionId}`);

  // Create log source
  await sourcesCollection.insertOne(
    createHyperDXLogSource(logSourceId, teamId, connectionId, metricSourceId)
  );
  log.debug(`Created HyperDX log source ${config.logContext}: ${logSourceId}`);

  // Create metric source
  await sourcesCollection.insertOne(
    createHyperDXMetricSource(metricSourceId, teamId, connectionId, logSourceId)
  );
  log.debug(`Created HyperDX metric source ${config.logContext}: ${metricSourceId}`);
};

/** Create HyperDX team, user, connection and data sources for an organization
 * @param {string} orgId - organization ID
 * @param {string} orgClickhouseUser - ClickHouse username for the organization
 * @param {string} orgClickhousePassword - ClickHouse password for the organization
 */
const ensureHyperDXOrgSetup = async (orgId, orgClickhouseUser, orgClickhousePassword) => {
  const userEmail = `org_${orgId}@hyperdx.local`;
  const userPassword = getRandomId(12);

  // save HDX credentials in account document
  const accountsCollection = Mongo.db.collection('accounts');
  await accountsCollection.updateOne(
    { _id: orgId },
    { $set: { hyperdxCredentials: { email: userEmail, password: userPassword } } }
  );

  await createHyperDXSetup({
    teamName: `org_${orgId}_team`,
    userEmail: userEmail,
    userPassword: userPassword,
    connectionName: `org_${orgId}_clickhouse`,
    clickhouseUser: orgClickhouseUser,
    clickhousePassword: orgClickhousePassword,
    logContext: `for organization ${orgId}`
  });
};

/** Create HyperDX admin team, user, connection and data sources with full access
 */
const ensureHyperDXAdminSetup = async () => {
  await createHyperDXSetup({
    teamName: 'admin_team',
    userEmail: 'admin@hyperdx.local',
    userPassword: process.env.CLICKHOUSE_PASSWORD || '',
    connectionName: 'admin_clickhouse',
    clickhouseUser: process.env.CLICKHOUSE_USER || 'default',
    clickhousePassword: process.env.CLICKHOUSE_PASSWORD || '',
    logContext: 'for admin'
  });
};

module.exports = { 
  getNextInRange, 
  getVersionRange, 
  ensureCapabilityDB, 
  waitForClickHouse, 
  ensureClickouseDefaultPermissions, 
  ensureClickHouseOrgUser,
  ensureHyperDXOrgSetup,
  ensureHyperDXAdminSetup
};
