const crypto = require('crypto');
const { getLogger } = require('@transitive-sdk/utils');
const Mongo = require('@transitive-sdk/mongo');

const log = getLogger('clickhouse-auth');

log.setLevel('debug');

/**
 * Get account from MongoDB with validation
 * @param {string} userId - The user ID
 * @param {boolean} requireJwtSecret - Whether JWT secret is required
 * @returns {Object} - Account object
 */
const getValidatedAccount = async (userId, requireJwtSecret = false) => {
  const accounts = Mongo.db.collection('accounts');
  const account = await accounts.findOne({_id: userId});
  
  if (!account) {
    throw new Error('Invalid account');
  }
  
  if (requireJwtSecret && !account.jwtSecret) {
    throw new Error('Missing JWT secret');
  }
  
  return account;
};

/**
 * Create credentials object
 * @param {string} userId - The user ID
 * @param {string} password - The password
 * @returns {Object} - Credentials object
 */
const createCredentialsObject = (userId, password) => ({
  user: `${userId}User`,
  password
});

/**
 * Save credentials to MongoDB
 * @param {string} userId - The user ID
 * @param {Object} credentials - The credentials to save
 */
const saveCredentialsToMongo = async (userId, credentials) => {
  const accounts = Mongo.db.collection('accounts');
  await accounts.updateOne(
    {_id: userId}, 
    {$set: {clickhouseCredentials: credentials}}
  );
};

/**
 * Generate a secure, user-specific password based on JWT secret
 * @param {string} userId - The user ID  
 * @param {string} jwtSecret - The user's JWT secret
 * @returns {string} - A secure password hash
 */
const generateSecurePassword = (userId, jwtSecret) => {
  // Create a deterministic but secure password using HMAC
  const hmac = crypto.createHmac('sha256', jwtSecret);
  hmac.update(userId + ':clickhouse-auth');
  return hmac.digest('hex');
};

/**
 * Create or update ClickHouse user with SHA256 password authentication
 * @param {string} userId - The user ID
 * @returns {Object} - Authentication credentials
 */
const setupClickHouseUser = async (userId) => {
  const account = await getValidatedAccount(userId, true);
   
  // Generate secure password and create credentials object
  const securePassword = generateSecurePassword(userId, account.jwtSecret);
  const credentials = createCredentialsObject(userId, securePassword);
  
  // Create or update user with SHA256 password
  const createUserQuery = `
    CREATE USER IF NOT EXISTS '${userId}User' 
    IDENTIFIED WITH sha256_password 
    BY '${securePassword}';
  `;
  
  try {
    // Execute the user creation query
    const response = await fetch('http://clickhouse:8123/', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: createUserQuery
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create ClickHouse user: ${response.status}`);
    }
    
    // Save credentials to MongoDB for future use
    await saveCredentialsToMongo(userId, credentials);
    
    log.info(`ClickHouse user created/updated for ${userId} with SHA256 authentication and credentials saved`);
    
    return credentials;
  } catch (error) {
    log.error('Failed to create ClickHouse user:', error);
    throw error;
  }
};

/**
 * Setup row-level security policy for user
 * @param {string} userId - The user ID
 */
const setupUserPolicy = async (userId) => {
  const createPolicyQuery = `
    CREATE ROW POLICY IF NOT EXISTS ${userId}Data 
    ON default.otel_logs 
    USING ResourceAttributes['organization.id'] = '${userId}' 
    TO '${userId}User';
  `;
  
  const response = await fetch('http://clickhouse:8123', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: createPolicyQuery
  });
  
  if (!response.ok) {
    throw new Error(`ClickHouse policy creation failed: ${response.statusText}`);
  }
};

/**
 * Grant necessary permissions to user
 * @param {string} userId - The user ID
 */
const grantUserPermissions = async (userId) => {
  const grantQuery = `
    GRANT SELECT ON default.otel_logs TO '${userId}User';
  `;
  
  const response = await fetch('http://clickhouse:8123', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: grantQuery
  });
  
  if (!response.ok) {
    throw new Error(`ClickHouse grant failed: ${response.statusText}`);
  }
};

/**
 * Check if user exists in ClickHouse
 * @param {string} userId - The user ID
 * @returns {boolean} - Whether user exists
 */
const userExists = async (userId) => {
  const query = `SELECT name FROM system.users WHERE name = '${userId}User'`;
  
  const response = await fetch('http://clickhouse:8123', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: query
  });
  
  if (!response.ok) {
    throw new Error(`ClickHouse query failed: ${response.statusText}`);
  }
  
  const result = await response.text();
  return result.trim() !== '';
};

/**
 * Get ClickHouse credentials for existing user from MongoDB
 * @param {string} userId - The user ID
 * @returns {Object} - Authentication credentials
 */
const getClickHouseCredentials = async (userId) => {
  const account = await getValidatedAccount(userId);
  
  // Return stored credentials if they exist
  if (account.clickhouseCredentials) {
    return account.clickhouseCredentials;
  }
  
  // Auto-migrate existing users by generating and storing credentials
  log.info(`Auto-migrating ClickHouse credentials for existing user ${userId}`);
  return await migrateUserCredentials(userId);
};

/**
 * Migrate existing user to have stored ClickHouse credentials
 * @param {string} userId - The user ID
 * @returns {Object} - Authentication credentials
 */
const migrateUserCredentials = async (userId) => {
  const account = await getValidatedAccount(userId, true);
  
  if (account.clickhouseCredentials) {
    return account.clickhouseCredentials;
  }
  
  // Generate credentials using the deterministic method
  const securePassword = generateSecurePassword(userId, account.jwtSecret);
  const credentials = createCredentialsObject(userId, securePassword);
  
  // Save credentials to MongoDB
  await saveCredentialsToMongo(userId, credentials);
  
  log.info(`Migrated ClickHouse credentials for existing user ${userId}`);
  return credentials;
};

module.exports = {
  generateSecurePassword,
  setupClickHouseUser,
  setupUserPolicy,
  grantUserPermissions,
  userExists,
  getClickHouseCredentials,
  migrateUserCredentials,
  // Export utility functions for testing if needed
  getValidatedAccount,
  createCredentialsObject,
  saveCredentialsToMongo
};
