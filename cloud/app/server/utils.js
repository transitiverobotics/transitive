const semver = require('semver');

const { createClient } = require('@clickhouse/client');

const { parseMQTTTopic } = require('@transitive-sdk/utils');
const Mongo = require('@transitive-sdk/mongo');

const { getLogger } = require('@transitive-sdk/utils');
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
 * @param {Object} params - parameters object
 * @param {string} params.dbName - name of the database to create/use
 * @param {string} [params.user] - optional username for the capability to use (will be created if not exists)
 * @param {string} [params.password] - optional password for the capability user (will be generated if not provided)
 * @param {Collection} mongoCredentialsCollection - MongoDB collection to store/retrieve credentials
 * @returns {Object} - object containing `user` and `password`
 */
const setupCapabilityDB = async ({dbName, user, password}) => {
  const url = process.env.CLICKHOUSE_URL;
  log.debug(`Setting up ClickHouse database: ${dbName} at ${url}`);

  const adminUser = process.env.CLICKHOUSE_USER;
  const adminPassword = process.env.CLICKHOUSE_PASSWORD;

  const clickhouseClient = createClient({
    url: url,
    username: adminUser,
    password: adminPassword,
    // TODO: pass admin user and password
    clickhouse_settings: {
      // https://clickhouse.com/docs/en/operations/settings/settings#async-insert
      async_insert: 1,
      // https://clickhouse.com/docs/en/operations/settings/settings#wait-for-async-insert
      wait_for_async_insert: 1,
    },
  });

  log.debug('Ensuring clickhouse database exists', dbName);
  await clickhouseClient.exec({
    query: `CREATE DATABASE IF NOT EXISTS ${dbName}`
  });

  const _user = user || `${dbName}_user`;
  log.debug(`ensuring clickhouse user ${_user} for database ${dbName}`);
  // Check if user exists
  const userExists = await clickhouseClient.query({
    query: `SELECT name FROM system.users WHERE name = '${_user}'`,
    format: 'JSONEachRow'
  });

  const users = await userExists.json();
  const mongoCredentialsCollection = Mongo.db.collection('clickhouse_users')
  if (users.length > 0) {
    // retrieve password from mongo
    const userDoc = await mongoCredentialsCollection.findOne({ user: _user, db: dbName });
    if (userDoc) {
      log.debug(`ClickHouse user ${_user} for database ${dbName} already exists`);
      return {
        user: _user,
        password: userDoc.password
      }
    }
  }

  // Generate new password if user doesn't exist
  const _password = password || Math.random().toString(36).slice(-12);

  // store user and password in mongo
  // const usersCollection = Mongo.db.collection('clickhouse_users');
  await mongoCredentialsCollection.updateOne(
    { user: _user, db: dbName },
    { $set: { password: _password } },
    { upsert: true }
  );

  // create database user if needed
  await clickhouseClient.exec({
    query: `CREATE USER IF NOT EXISTS ${_user} IDENTIFIED WITH plaintext_password BY '${_password}'`
  });

  // grant all privileges on the cap database to the user
  await clickhouseClient.exec({
    query: `GRANT ALL ON ${dbName}.* TO ${_user}`
  });

  log.debug(`ClickHouse user ${_user} for database ${dbName} created`);

  return {
    user: _user,
    password: _password
  };
}

const waitForClickHouse = async () => {
  const start = Date.now();
  const url = process.env.CLICKHOUSE_URL;
  const adminUser = process.env.CLICKHOUSE_USER;
  const adminPassword = process.env.CLICKHOUSE_PASSWORD;
  const timeout = 2 * 60 * 1000; // 2 minutes

  const client = createClient({
    url: url,
    username: adminUser,
    password: adminPassword,
  });
  while (Date.now() - start < timeout) {
    try {
      await client.query({ query: 'SELECT 1' });
      log.debug('ClickHouse is ready');
      return;
    } catch (err) {
      log.debug('Waiting for ClickHouse to be ready...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  throw new Error('Timeout waiting for ClickHouse to be healthy');
};


module.exports = { getNextInRange, getVersionRange, setupCapabilityDB, waitForClickHouse };
