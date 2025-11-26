const semver = require('semver');
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
const setupClickousePermissions = async () => {
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
    const password = await accountsCollection.findOne({ _id: orgId })?.clickhouseCredentials?.password;
    log.debug(`retrieved ClickHouse credentials for organization ${orgId} from mongo: ${orgUser} / ${password}`);
    return { 
      user: orgUser,
      password: password
    };
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

module.exports = { getNextInRange, getVersionRange, ensureCapabilityDB, waitForClickHouse, setupClickousePermissions, ensureClickHouseOrgUser };
