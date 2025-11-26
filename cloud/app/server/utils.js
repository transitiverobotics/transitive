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

  await ClickHouse.client.command({query: `CREATE DATABASE IF NOT EXISTS ${dbName}`});

  const user = `${dbName}_user`;
  log.debug(`ensuring clickhouse user ${user} for database ${dbName}`);
  // Check if user exists
  const userExists = await ClickHouse.client.query({
    query: `SELECT name FROM system.users WHERE name = '${user}'`,
    format: 'JSONEachRow'
  });

  const users = await userExists.json();
  const capabilitiesCollection = Mongo.db.collection('capabilities');
  if (users.length > 0) {
    // retrieve password from mongo
    const capabilityDoc = await capabilitiesCollection.findOne({_id: capName});
    if (capabilityDoc?.clickhouseCredentials) {
      log.debug(`ClickHouse user ${user} for database ${dbName
        } exists, retrieved credentials from mongo`);
      return capabilityDoc.clickhouseCredentials;
    }
  }

  // Generate new password if user doesn't exist
  const password = getRandomId(15);

  // store user and password in mongo
  await capabilitiesCollection.updateOne({_id: capName},
    {$set: {clickhouseCredentials: {dbName, user, password}}},
    {upsert: true});

  for (let query of [
    // create database user if needed
    `CREATE USER IF NOT EXISTS ${user} IDENTIFIED WITH plaintext_password BY '${password}'`,
    // grant all privileges on the cap database to the user
    `GRANT ALL ON ${dbName}.* TO ${user}`,
    // create row level security policy to allow access to all rows
    `CREATE ROW POLICY IF NOT EXISTS ${user}_policy ON ${dbName}.* USING 1 TO ${user}`,
    `CREATE ROW POLICY IF NOT EXISTS ${dbName}_customers ON ${dbName}.* USING concat('org_', OrgId, '_user') = currentUser() TO ALL`,
    `CREATE ROW POLICY IF NOT EXISTS ${dbName}_admin ON ${dbName}.* USING 1 TO ${process.env.CLICKHOUSE_USER || 'default'}`,
  ]) await ClickHouse.client.command({ query });

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
  const cmd = 'CREATE ROW POLICY IF NOT EXISTS';
  for (let query of [
    `${cmd} default_customers ON default.* USING concat('org_', OrgId, '_user') = currentUser() TO ALL`,
    `${cmd} default_admin ON default.* USING 1 TO ${process.env.CLICKHOUSE_USER || 'default'}`
  ]) await ClickHouse.client.command({ query });
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

  for (let query of [
    // Create user:
    `CREATE USER IF NOT EXISTS ${orgUser} IDENTIFIED WITH plaintext_password BY '${orgPassword}'`,
    // Grant read only access to all databases and tables - row level security
    // will limit access to own org data:
    `GRANT SELECT ON *.* TO ${orgUser}`,
    // Immediately revoke select access to system tables again (see
    // https://clickhouse.com/docs/sql-reference/statements/revoke#examples):
    `REVOKE SELECT ON system.* FROM ${orgUser}`,
  ]) await ClickHouse.client.command({ query });

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


/** Helper: Create complete HyperDX setup (team, user, connection, sources)
 * @param {Object} config - Configuration object
 * @param {string} config.teamName - Name of the team
 * @param {string} config.userEmail - Email for the user
 * @param {string} config.userPassword - Password for the user
 * @param {string} config.connectionName - Name of the connection
 * @param {string} config.clickhouseUser - ClickHouse username
 * @param {string} config.clickhousePassword - ClickHouse password
 * @param {string} config.logContext - Context string for logging
 Return true if changes were made, false if already existed.
 */
const ensureHyperDXSetup = async (config) => {
  const hyperDXDb = Mongo.client.db('hyperdx');
  const teamsCollection = hyperDXDb.collection('teams');
  const usersCollection = hyperDXDb.collection('users');
  const connectionsCollection = hyperDXDb.collection('connections');
  const sourcesCollection = hyperDXDb.collection('sources');

  // Check if team already exists
  const existingTeam = await teamsCollection.findOne({ name: config.teamName });
  if (existingTeam) {
    log.debug(`HyperDX team ${config.teamName} already exists`);
    return false;
  }

  const teamId = new ObjectId();
  const userId = new ObjectId();
  const connectionId = new ObjectId();
  const logSourceId = new ObjectId();
  const metricSourceId = new ObjectId();
  const now = new Date();

  // Create team
  await teamsCollection.insertOne({
    _id: teamId,
    name: config.teamName,
    allowedAuthMethods: [],
    collectorAuthenticationEnforced: true,
    hookId: getRandomId(36),
    apiKey: getRandomId(36),
    createdAt: now,
    updatedAt: now,
    __v: 0
  });
  log.debug(`Created HyperDX team ${config.logContext}: ${teamId}`);

  // Create user
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.pbkdf2Sync(config.userPassword, salt, 25000, 512, 'sha256').toString('hex');
  await usersCollection.insertOne({
    _id: userId,
    email: config.userEmail,
    name: config.userEmail,
    accessKey: getRandomId(36),
    salt,
    hash,
    team: teamId,
    createdAt: now,
    updatedAt: now,
    __v: 0
  });
  log.debug(`Created HyperDX user ${config.logContext}: ${config.userEmail}`);

  // Create ClickHouse connection
  await connectionsCollection.insertOne({
    _id: connectionId,
    team: teamId,
    name: config.connectionName,
    host: process.env.CLICKHOUSE_URL || 'http://clickhouse:8123',
    username: config.clickhouseUser,
    password: config.clickhousePassword,
    createdAt: now,
    updatedAt: now,
    __v: 0
  });
  log.debug(`Created HyperDX connection ${config.logContext}: ${connectionId}`);

  // Create log source
  await sourcesCollection.insertOne({
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
  });
  log.debug(`Created HyperDX log source ${config.logContext}: ${logSourceId}`);

  // Create metric source
  await sourcesCollection.insertOne({
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
  });
  log.debug(`Created HyperDX metric source ${config.logContext}: ${metricSourceId}`);

  return true; // indicates new setup was created
};


/** Create HyperDX team, user, connection and data sources for an organization
 * @param {string} orgId - organization ID
 * @param {string} orgClickhouseUser - ClickHouse username for the organization
 * @param {string} orgClickhousePassword - ClickHouse password for the organization
 */
const ensureHyperDXOrgSetup = async (orgId, clickhouseUser, clickhousePassword) => {
  const userEmail = `org_${orgId}@hyperdx.local`;
  const userPassword = getRandomId(12);

  if (await ensureHyperDXSetup({
    teamName: `org_${orgId}_team`,
    userEmail,
    userPassword,
    connectionName: `org_${orgId}_clickhouse`,
    clickhouseUser,
    clickhousePassword,
    logContext: `for organization ${orgId}`
  })) {
    // save HDX credentials in account document in transitive.accounts
    await Mongo.db.collection('accounts').updateOne({_id: orgId},
      {$set: {hyperdxCredentials: {email: userEmail, password: userPassword}}});
    log.debug(`Completed HyperDX setup for organization ${orgId}`);
  } else {
    log.debug(`HyperDX setup for organization ${orgId} already exists, no changes made`);
  }
};


/** Create HyperDX admin team, user, connection and data sources with full access
 */
const ensureHyperDXAdminSetup = async () => {
  await ensureHyperDXSetup({
    teamName: 'admin_team',
    userEmail: 'admin@hyperdx.local',
    userPassword: process.env.CLICKHOUSE_PASSWORD || '',
    connectionName: 'admin_clickhouse',
    clickhouseUser: process.env.CLICKHOUSE_USER || 'default',
    clickhousePassword: process.env.CLICKHOUSE_PASSWORD || '',
    logContext: 'for admin'
  });
};


/** Change ClickHouse password for an organization
 * @param {string} orgId - organization ID
 * @param {string} newPassword - new password
 * @returns {Object} - {user, password}
 */
const changeClickHousePassword = async (orgId, newPassword) => {
  const orgUser = `org_${orgId}_user`;
  const hyperDXDb = Mongo.client.db('hyperdx');
  const connectionsCollection = hyperDXDb.collection('connections');
  const teamsCollection = hyperDXDb.collection('teams');

  log.debug(`Changing ClickHouse password for organization ${orgId}`);

  // Update password in ClickHouse
  await ClickHouse.client.command({ query:
    `ALTER USER ${orgUser} IDENTIFIED WITH plaintext_password BY '${newPassword}'`
  });

  // Update password in MongoDB transitive.accounts
  await Mongo.db.collection('accounts').updateOne({ id: orgId},
    {$set: {'clickhouseCredentials.password': newPassword}});

  // Update HyperDX connection password
  const team = await teamsCollection.findOne({name: `org_${orgId}_team`});
  if (team) {
    await connectionsCollection.updateOne({team: team._id},
      {$set: {password: newPassword, updatedAt: new Date()}});
    log.debug(`Updated HyperDX connection password for organization ${orgId}`);
  }

  log.debug(`Changed ClickHouse password for organization ${orgId}`);
};


/** Change HyperDX password for an organization
 * @param {string} orgId - organization ID
 * @param {string} newPassword - new password
 */
const changeHyperDXPassword = async (orgId, newPassword) => {
  const hyperDXDb = Mongo.client.db('hyperdx');
  const usersCollection = hyperDXDb.collection('users');

  log.debug(`Changing HyperDX password for organization ${orgId}`);

  // Find the user
  const userEmail = `org_${orgId}@hyperdx.local`;
  const user = await usersCollection.findOne({ email: userEmail });
  if (!user) {
    throw new Error(`HyperDX user for organization ${orgId} not found`);
  }

  // Hash the new password
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.pbkdf2Sync(newPassword, salt, 25000, 512, 'sha256').toString('hex');

  // Update user in HyperDX
  await usersCollection.updateOne({_id: user._id},
    {$set: {salt, hash, updatedAt: new Date()}});

  // Update stored credentials in transitive.accounts collection
  await Mongo.db.collection('accounts').updateOne({_id: orgId},
    {$set: { 'hyperdxCredentials.password': newPassword}});

  log.debug(`Changed HyperDX password for organization ${orgId}`);
};


/** lookup for functions to call for changing service passwords */
const changeServicePassword = {
  clickhouse: changeClickHousePassword,
  hyperdx: changeHyperDXPassword
};


module.exports = {
  getNextInRange,
  getVersionRange,
  ensureCapabilityDB,
  waitForClickHouse,
  ensureClickouseDefaultPermissions,
  ensureClickHouseOrgUser,
  ensureHyperDXOrgSetup,
  ensureHyperDXAdminSetup,
  changeServicePassword
};
