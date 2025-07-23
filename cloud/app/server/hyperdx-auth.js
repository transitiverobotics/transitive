const jwt = require('jsonwebtoken');
const { getLogger, decodeJWT } = require('@transitive-sdk/utils');
const Mongo = require('@transitive-sdk/mongo');
const { TOKEN_COOKIE, COOKIE_NAME } = require('../common.js');

const log = getLogger('hyperdx-auth');
log.setLevel('debug');

// Helper function to verify JWT directly without circular dependency
const verifyJWTLocal = async (token) => {
  try {
    const payload = decodeJWT(token);
    const accounts = Mongo.db.collection('accounts');
    const account = await accounts.findOne({_id: payload.id});

    if (!account || !account.jwtSecret) {
      return { valid: false, error: 'Invalid account or missing JWT secret' };
    }

    await jwt.verify(token, account.jwtSecret);
    
    if (!payload.validity || (payload.iat + payload.validity) * 1e3 < Date.now()) {
      return { valid: false, error: 'JWT is expired' };
    }

    return { valid: true, payload };
  } catch (error) {
    return { valid: false, error: error.message };
  }
};

// Helper function to parse JWT cookie without circular dependency
const parseJWTCookieLocal = async (cookie) => {
  if (!cookie) return {};

  try {
    const parsed = JSON.parse(cookie);
    if (!parsed.token) return {};

    const {valid, payload} = await verifyJWTLocal(parsed.token);
    return valid ? payload : {};
  } catch (error) {
    log.debug('parseJWTCookieLocal error:', error);
    return {};
  }
};

/**
 * Middleware to extract organization ID from user session/token
 * and add it to HyperDX requests for tenant isolation
 */
const addOrgFilter = async (req, res, next) => {
  let orgId = null;

  try {
    log.debug('addOrgFilter: Processing request', {
      url: req.url,
      hasSession: !!req.session,
      sessionUser: req.session?.user?._id,
      hasCookies: !!req.cookies,
      cookies: Object.keys(req.cookies || {}),
      hasAuth: !!req.headers.authorization
    });

    // Try to get org from JWT token
    if (req.headers.authorization?.startsWith('Bearer ')) {
      const token = req.headers.authorization.slice('Bearer '.length);
      log.debug('addOrgFilter: Trying Bearer token');
      const {valid, payload} = await verifyJWTLocal(token);
      if (valid) {
        orgId = payload.id || payload.userId;
        log.debug('addOrgFilter: Got orgId from Bearer token:', orgId);
      }
    }

    // Try to get org from main login cookie (for web UI)
    if (!orgId && req.cookies && req.cookies[COOKIE_NAME]) {
      log.debug('addOrgFilter: Trying main login cookie (transitive)');
      log.debug('addOrgFilter: Raw transitive cookie value:', req.cookies[COOKIE_NAME]);
      try {
        const loginSession = JSON.parse(req.cookies[COOKIE_NAME]);
        log.debug('addOrgFilter: Parsed login session:', loginSession);
        orgId = loginSession.user;
        log.debug('addOrgFilter: Got orgId from main login cookie:', orgId);
      } catch (error) {
        log.debug('addOrgFilter: Error parsing main login cookie:', error);
      }
    }

    // Try to get org from token cookie (for web UI)
    if (!orgId && req.cookies && req.cookies[TOKEN_COOKIE]) {
      log.debug('addOrgFilter: Trying TOKEN_COOKIE');
      const payload = await parseJWTCookieLocal(req.cookies[TOKEN_COOKIE]);
      orgId = payload.id || payload.userId;
      log.debug('addOrgFilter: Got orgId from token cookie:', orgId);
    }

    // Try to get org from session (for logged-in web users)
    if (!orgId && req.session?.user?._id) {
      log.debug('addOrgFilter: Trying session');
      orgId = req.session.user._id;
      log.debug('addOrgFilter: Got orgId from session:', orgId);
    }

    // Try to get org from query parameter (for testing)
    if (!orgId && req.query.orgId) {
      log.debug('addOrgFilter: Trying query param');
      orgId = req.query.orgId;
      log.debug('addOrgFilter: Got orgId from query:', orgId);
    }

    if (!orgId) {
      log.warn('No organization context found for HyperDX request', {
        url: req.url,
        sessionExists: !!req.session,
        sessionUser: req.session?.user,
        cookieKeys: Object.keys(req.cookies || {}),
        transitivecookie: req.cookies?.[COOKIE_NAME] ? 'present' : 'missing'
      });
      return res.status(401).json({error: 'No organization context found'});
    }

    // Add org filter to request headers for downstream processing
    req.headers['x-org-id'] = orgId;
    
    log.debug('HyperDX request authenticated for org:', orgId);
    next();
  } catch (error) {
    log.error('Error in HyperDX authentication:', error);
    return res.status(500).json({error: 'Authentication error'});
  }
};

/**
 * More permissive middleware for HyperDX UI that allows access when logged in
 * but doesn't block if org context is missing (for static assets, etc.)
 */
const addOrgFilterPermissive = async (req, res, next) => {
  let orgId = null;

  try {
    log.debug('addOrgFilterPermissive: Processing request', {
      url: req.url,
      hasSession: !!req.session,
      sessionUser: req.session?.user?._id,
      hasCookies: !!req.cookies,
      cookies: Object.keys(req.cookies || {}),
      hasAuth: !!req.headers.authorization
    });

    // Try to get org from JWT token
    if (req.headers.authorization?.startsWith('Bearer ')) {
      const token = req.headers.authorization.slice('Bearer '.length);
      log.debug('addOrgFilterPermissive: Trying Bearer token');
      const {valid, payload} = await verifyJWTLocal(token);
      if (valid) {
        orgId = payload.id || payload.userId;
        log.debug('addOrgFilterPermissive: Got orgId from Bearer token:', orgId);
      }
    }

    // Try to get org from main login cookie (for web UI)
    if (!orgId && req.cookies && req.cookies[COOKIE_NAME]) {
      log.debug('addOrgFilterPermissive: Trying main login cookie (transitive)');
      try {
        const loginSession = JSON.parse(req.cookies[COOKIE_NAME]);
        log.debug('addOrgFilterPermissive: Parsed login session:', loginSession);
        orgId = loginSession.user;
        log.debug('addOrgFilterPermissive: Got orgId from main login cookie:', orgId);
      } catch (error) {
        log.debug('addOrgFilterPermissive: Error parsing main login cookie:', error);
      }
    }

    // Try to get org from token cookie (for web UI)
    if (!orgId && req.cookies && req.cookies[TOKEN_COOKIE]) {
      log.debug('addOrgFilterPermissive: Trying TOKEN_COOKIE');
      const payload = await parseJWTCookieLocal(req.cookies[TOKEN_COOKIE]);
      orgId = payload.id || payload.userId;
      log.debug('addOrgFilterPermissive: Got orgId from token cookie:', orgId);
    }

    // Try to get org from session (for logged-in web users)
    if (!orgId && req.session?.user?._id) {
      log.debug('addOrgFilterPermissive: Trying session');
      orgId = req.session.user._id;
      log.debug('addOrgFilterPermissive: Got orgId from session:', orgId);
    }

    // Try to get org from query parameter (for testing)
    if (!orgId && req.query.orgId) {
      log.debug('addOrgFilterPermissive: Trying query param');
      orgId = req.query.orgId;
      log.debug('addOrgFilterPermissive: Got orgId from query:', orgId);
    }

    if (orgId) {
      // Add org filter to request headers for downstream processing
      req.headers['x-org-id'] = orgId;
      log.debug('HyperDX UI request authenticated for org:', orgId);
    } else {
      log.debug('No organization context found for HyperDX UI request, proceeding without org filter', {
        url: req.url
      });
      // Don't block - let HyperDX handle it
    }
    
    next();
  } catch (error) {
    log.error('Error in HyperDX UI authentication:', error);
    // Don't block on error - let HyperDX handle it
    next();
  }
};

/**
 * Middleware to modify ClickHouse queries to include organization filtering
 */
const addClickHouseOrgFilter = (req, res, next) => {
  const orgId = req.headers['x-org-id'];
  
  if (!orgId) {
    return res.status(401).json({error: 'No organization context'});
  }

  // For POST requests with query body, add WHERE clause to filter by org
  if (req.method === 'POST' && req.body) {
    if (typeof req.body === 'string' && req.body.toLowerCase().includes('from otel_logs')) {
      // Add org filter to raw SQL queries
      if (!req.body.toLowerCase().includes('where')) {
        req.body += ` WHERE ResourceAttributes['org.id'] = '${orgId}'`;
      } else {
        req.body += ` AND ResourceAttributes['org.id'] = '${orgId}'`;
      }
      log.debug('Modified ClickHouse query with org filter for:', orgId);
    } else if (req.body.query && typeof req.body.query === 'string') {
      // Handle structured query objects
      if (req.body.query.toLowerCase().includes('from otel_logs')) {
        if (!req.body.query.toLowerCase().includes('where')) {
          req.body.query += ` WHERE ResourceAttributes['org.id'] = '${orgId}'`;
        } else {
          req.body.query += ` AND ResourceAttributes['org.id'] = '${orgId}'`;
        }
        log.debug('Modified structured ClickHouse query with org filter for:', orgId);
      }
    }
  }

  // For GET requests with query parameter, modify the query
  if (req.method === 'GET' && req.query.query) {
    if (req.query.query.toLowerCase().includes('from otel_logs')) {
      if (!req.query.query.toLowerCase().includes('where')) {
        req.query.query += ` WHERE ResourceAttributes['org.id'] = '${orgId}'`;
      } else {
        req.query.query += ` AND ResourceAttributes['org.id'] = '${orgId}'`;
      }
      log.debug('Modified GET ClickHouse query with org filter for:', orgId);
    }
  }

  next();
};

module.exports = { addOrgFilter, addOrgFilterPermissive, addClickHouseOrgFilter };
