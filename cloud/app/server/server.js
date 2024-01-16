const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const http = require('http');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const fetch = require('node-fetch');
const bcrypt = require('bcrypt');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const HttpProxy = require('http-proxy');
const { CronJob } = require('cron');
const _ = require('lodash');

const Mongo = require('@transitive-sdk/utils/mongo');
const { parseMQTTTopic, decodeJWT, loglevel, getLogger, versionCompare, MqttSync,
mergeVersions, forMatchIterator, Capability, tryJSONParse, clone } =
  require('@transitive-sdk/utils');

const { COOKIE_NAME, TOKEN_COOKIE } = require('../common.js');
const docker = require('./docker');
const installRouter = require('./install');
const {createAccount, sendVerificationEmail, verifyCode} =
  require('./accounts');

const HEARTBEAT_TOPIC = '$SYS/broker/uptime';
const PORT = 9000;
const BILLING_SERVICE = process.env.TR_BILLING_SERVICE ||
  'https://billing.transitiverobotics.com';

/** Threshold in ms for API JWTs to be valid */
const JWT_THRESHOLD = 5 * 60 * 1000;

const log = getLogger('server');
// log.setLevel('info');
log.setLevel('debug');

const cwd = process.cwd();

const addSessions = (router, collectionName, secret, options = {}) => {
  const obj = {
    secret,
    name: collectionName,
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({
      clientPromise: new Promise((resolve) => resolve(Mongo.client)),
      dbName: Mongo.db.databaseName,
      collectionName
    }),
    cookie: {domain: `.${process.env.TR_HOST}`}
  };
  options.genid && (obj.genid = options.genid);
  router.use(session(obj));
};

/* -- Some express middlewares for authentication */

/** simple middleware to check whether the user is logged in */
const requireLogin = (req, res, next) => {
  // log.debug(req.session);
  if (!req.session || !req.session.user) {
    res.status(401).json({error: 'Not authorized. You need to be logged in.'});
  } else {
    next();
  }
};

/** simple middleware to check whether the user is logged in as an admin */
const requireAdmin = (req, res, next) => {
  if (!req.session?.user?.admin) {
    res.status(401).json({error: 'Not authorized. You need to be admin.'});
  } else {
    next();
  }
};

/** simple middleware to check whether the client provided a JWT */
const requireJWT = async (req, res, next) => {
  if (!req.headers.authorization) {
    res.status(401).json({error: 'No JWT provided in Authorization header.'});
    return;
  }

  let payload;
  const token = req.headers.authorization.replace(/^Bearer /,'');
  try {
    payload = decodeJWT(token);
  } catch (e) {
    res.status(401).json({error: 'Invalid JWT.'});
    return;
  }
  if (!payload?.api) {
    res.status(401).json({error: 'Not an API JWT.'});
    return;
  }
  if (!payload?.userId) {
    res.status(401).json({error: 'No userId provided in JWT.'});
    return;
  }
  if (!payload.iat || (Date.now() - (payload.iat * 1000) > JWT_THRESHOLD)) {
    res.status(401).json({error: 'JWT is expired.'});
    return;
  }

  const accounts = Mongo.db.collection('accounts');
  const user = await accounts.findOne({_id: payload.userId});
  jwt.verify(token, user.jwtSecret, (err, decoded) => {
    if (err) {
      res.status(401).json({error: 'Invalid JWT.'});
      return;
    }
    log.debug('requireJWT: jwt verified', decoded);
    req.jwtSession = {...req.jwtSession, ...decoded};
    next();
  });
};

/* ------- */

/** lookup which version of the named capability is running on the named device
*/
const getVersion = (userId, deviceId, scope, capName) => {
  if (!robotAgent) {
    log.warn('robotAgent not yet running, cannot look up running version yet');
    return;
  }

  if (deviceId == "_fleet") {
    // Serve the latest version run by any device
    return robotAgent.getLatestRunningVersion(userId, scope, capName);
    // TODO: if no device is running this capability, serve the latest version.
    // This is required to allow capabilities that are cloud+UI only.
  } else {
    const runningPkgs = robotAgent.getDevicePackages(userId, deviceId);
    const running = runningPkgs?.[scope][capName];
    log.debug({running});
    return running && _.findKey(running, (isTrue) => isTrue);
  }
};

/** Given a JWT, verify that it is valid, i.e., was signed by the secret
* belonging to the user id named in the token */
const verifyJWT = async (token) => {
  const payload = decodeJWT(token);

  const accounts = Mongo.db.collection('accounts');
  const account = await accounts.findOne({_id: payload.id});

  if (!account) {
    return {
      valid: false,
      error: 'no such account, please verify the id provided to the web component'
    };
  }
  if (!account.jwtSecret) {
    return {
      valid: false,
      error: 'account has no jwt secret! please recreate using the cli tool'
    };
  }

  await jwt.verify(token, account.jwtSecret);
  log.debug('verified token');

  if (!payload.validity || (payload.iat + payload.validity) * 1e3 < Date.now()) {
    // The token is expired
    log.info(`JWT is expired ${JSON.stringify(payload)}`);
    return {
      valid: false,
      error: `JWT is expired ${JSON.stringify(payload)}`
    };
  }

  return {
    valid: true,
    payload
  }
}

/** Verify the session cookie set by setSessionJWT */
const parseJWTCookie = async (cookie) => {
  if (!cookie) return {};

  const parsed = JSON.parse(cookie);
  if (!parsed.token) {
    return {};
  }

  const {valid, error, payload} = await verifyJWT(parsed.token);
  if (valid) {
    return payload;
  }
  log.debug('parseJWTCookie: invalid token, ', error);
  return {};
};

/** Get package info for the named package (e.g., @transitive-robotics/terminal)
 * from registry.
 */
const getPackageInfo = async (package) => {
  const localRegistry = `http://${process.env.TR_REGISTRY || 'registry:6000'}`;
  const host = process.env.TR_REGISTRY_IS_LOCAL ? localRegistry
    : 'https://registry.transitiverobotics.com';
  const response = await fetch(`${host}/${encodeURIComponent(package)}`);
  const json = await response.json();
  return json;
};

// ----------------------------------------------------------------------

const app = express();

/* log all requests when debugging */
// app.use((req, res, next) => {
//   log.debug(req.method, req.originalUrl);
//   next();
// });

app.use(express.static(path.join(cwd, 'public')));
app.use(cors(), express.static(path.join(cwd, 'dist')));
app.use(express.json());

// router for standalone-component pages
const capsRouter = express.Router();
app.use('/caps', capsRouter);

const addCapsRoutes = () => {
  log.debug('adding caps router');
  capsRouter.use(cookieParser());

  addSessions(capsRouter, 'tokenSessions', process.env.TR_CAPSESSION_SECRET);

  const requireToken = (req, res, next) => {
    log.debug('tokenSession', req.session);
    if (!req.session || !req.session.token) {
      res.status(401).end('Not authorized. You need to be logged in by token.');
    } else {
      next();
    }
  };

  /** Trades our token for a JWT with the permissions that were granted to
  this token when it was created. */
  capsRouter.post('/getJWTFromToken', async (req, res) => {
    log.debug('tokenSession', req.session);

    log.debug('get JWT from simple access token', req.body);
    const {token, org, password} = req.body;
    if (!token || !org || !password) {
      res.status(400).end('missing parameters');
      return;
    }

    const accounts = Mongo.db.collection('accounts');
    const account = await accounts.findOne({_id: org});

    // check token
    if (!account.capTokens[token]) {
      log.info('invalid token');
      res.status(401).end('not authorized or invalid token');
      return;
    }

    const permissions = account.capTokens[token];
    if (password != permissions.password) {
      log.info('wrong password');
      res.status(401).end('not authorized or invalid token');
      return;
    }
    delete permissions.password;

    const config = account.capTokens[token].config;
    delete account.capTokens[token].config;

    const payload = Object.assign({}, permissions, {
      id: org,
      userId: token,
      validity: 3600 * 24,
    });

    const json = {
      token: jwt.sign(payload, account.jwtSecret),
      config,
      tokenName: token
    };
    log.debug('responding with', json, 'and setting cookie', TOKEN_COOKIE);
    req.session.token = json.token;
    res.cookie(TOKEN_COOKIE, JSON.stringify(json)).json(json);
  });

  /** If the client already has a JWT, it can set it for the session here.
  * This will authenticate him for capability routes who can just check the
  * cookie. */
  capsRouter.post('/setSessionJWT', async (req, res) => {
    log.debug('setting session JWT', req.body);
    const {token} = req.body;
    res.cookie(TOKEN_COOKIE, JSON.stringify({token}))
      .json({msg: 'JWT set for session'});
  });

  /** Serve dist/ folders of capabilities, copied into run folder during
  startup of the container (see docker.js). */
  capsRouter.use('/', express.static(docker.RUN_DIR));

  /** for DEV: ignore version number and serve (latest) from relative path, see
  docker-compose 'cloud_dev' */
  !tryJSONParse(process.env.PRODUCTION) && process.env.COMPOSE_PROFILES == 'dev'
    && capsRouter.use('/:scope/:capabilityName/:version/', (req, res, next) => {
      const filePath = path.resolve('caps',
        req.params.scope,
        req.params.capabilityName,
        req.path.slice(1) // drop initial slash from filename
      );
      log.debug('checking for dev bundle', filePath);
      fs.access(filePath, (err) => {
        if (err) {
          next();
        } else {
          // This also triggers if filePath is a parent directory of a
          // non-existing file; it does the right thing and falls back to the
          // /caps route
          log.info('trying to send capability bundle from dev:', filePath);
          res.sendFile(filePath);
        }
      });
    });

  /** http proxy for reverse proxying to web servers run by caps */
  const capsProxy = HttpProxy.createProxyServer({ xfwd: true });
  capsRouter.use('/:scope/:capName/:version', async (req, res, next) => {
    // construct docker container name from named cap and version
    // e.g., transitive-robotics.configuration-management.0.1.5-0.cloud_caps
    // (cloud_caps is the name of the docker network)
    const host =
      `${req.params.scope}.${req.params.capName}.${req.params.version}.cloud_caps`;
    log.debug('proxying to', host);
    // log.debug('cookies', req.cookies, req.cookies[TOKEN_COOKIE]);
    const payload = await parseJWTCookie(req.cookies[TOKEN_COOKIE]);
    log.debug({payload});
    capsProxy.web(req, res, {target: `http://${host}:8085`,
      headers: {'jwt-payload': JSON.stringify(payload)}});
  });
};


/** Serve the js bundles of capabilities */
app.use('/running/@transitive-robotics/_robot-agent',
  express.static(cwd));

app.get('/running/:scope/:capName/*', (req, res) => {
  log.debug(`getting ${req.path}`, req.query, req.params);
  const {scope, capName} = req.params;
  const capability = `${scope}/${capName}`;
  const filePath = req.params[0]; // the part that matched the *
  const version = getVersion(req.query.userId, req.query.deviceId, scope, capName);
  log.debug('running', {version});

  if (version) {
    // redirect to the folder in dist (symlinked to the place where the named
    // package exposes its distribution files bundles: in production from docker,
    // in dev symlinked in folder).
    res.redirect(`/caps/${capability}/${version}/${filePath}`);
  } else {
    res.status(404).end('package not running on this device');
  }
});
// test with:
// curl "data.homedesk:8000/bundle/health-monitoring/dist/health-monitoring-device.js?userId=qEmYn5tibovKgGvSm&deviceId=GbGa2ygqqz"


/** ---------------------------------------------------------------------------
  Authentication for MQTT Websockets (called from mosquitto go-auth)
*/

/** authenticate the username based on the JWT given as password
  body: {
    clientid: '....',
    password: '...',
    username: '{id, payload: {device, capability, userId, validity}}'
  }
*/
app.post('/auth/user', async (req, res) => {

  const accounts = Mongo.db.collection('accounts');

  const token = req.body.password;
  if (!token) {
    log.warn('no token provided');
    res.status(401).send('please provide a valid JWT');
    return;
  }

  try {
    const {valid, error, payload} = await verifyJWT(token);

    if (error) {
      res.status(401).send(error);
    } else {
      const parsedUsername = JSON.parse(req.body.username);
      // Verify that the user's signed JWT has the same payload as username.
      // This is needed because downstream decision, e.g., in ACL, will be based
      // on this verified username.
      assert.deepEqual(payload, parsedUsername.payload);

      res.send('ok');
    }

  } catch (e) {
    log.info(`user authentication failed for token ${token}:`, e);
    res.status(401).send(e);
  }
});


app.post('/auth/acl', (req, res) => {
  if (req.body.topic == HEARTBEAT_TOPIC) {
    res.send('ok');
    return;
  }

  /* {
    acc: 1,
    clientid: 'mqttjs_c799fa50',
    topic: '/qEmYn5tibovKgGvSm/ZXyqpabPL7/health-monitoring/diagnostics/disk partition: root/values/percent',
    username: '{"id":"qEmYn5tibovKgGvSm","payload":{"device":"GbGa2ygqqz","capability":"health-monitoring","userId":"portalUser-qEmYn5tibovKgGvSm","validity":43200,"iat":1637107056}}'
  }*/
  try {
    const {id, payload: permitted} = JSON.parse(req.body.username);
    // payload describes the permissions of the user
    const requested = parseMQTTTopic(req.body.topic);
    // whether or not the request is just for reading
    const readAccess = (req.body.acc == 1 || req.body.acc == 4);
    const allowed =
      // check that browser-user isn't trying to write to different org:
      id == permitted.id &&
      // check that JWT-permitted org matches topic org
      id == requested.organization &&
      permitted.validity &&
      (permitted.iat + permitted.validity) * 1e3 > Date.now() &&
      (
        (permitted.device == requested.device &&
            (((permitted.capability == requested.capability ||
                // _robot-agent permissions grant full device access
                permitted.capability == '@transitive-robotics/_robot-agent')
              &&
                (!permitted.topics || permitted.topics?.includes(requested.sub[0]))
              // if payload.topics exists it is a limitation of topics to allow
            ) ||
              // all valid JWTs for a device also grant read access to _robot-agent
              (readAccess &&
                requested.capability == '@transitive-robotics/_robot-agent'))
        ) ||
          // _fleet permissions give read access also to all devices' robot-agents
          ( permitted.device == '_fleet' && readAccess &&
            requested.capability == '@transitive-robotics/_robot-agent' &&
            !permitted.topics)
          ||
          // _fleet permissions give access to all devices' data for the
          // cap (in the permitted org only of course); _robot-agent permissions
          // grant access to all devices in the fleet
          ( permitted.device == '_fleet' &&
              (requested.capability == permitted.capability ||
                permitted.capability == '@transitive-robotics/_robot-agent') &&
              !permitted.topics )
      );

    if (allowed) {
      res.send('ok');
    } else {
      log.debug('permission denied', {permitted, requested, readAccess});
      res.status(401).end('not authorized for topic or token expired')
    }
  } catch (e) {
    log.warn('/auth/acl exception', e, req.body);
    res.status(400).end('unable to parse authentication request')
  }
});



/* -------------------------------------------------------------------------
  Cloud Agent
*/

// After 1h of a robot not reporting a heartbeat we'll pause reporting its use to
// billing
const RUNNING_THRESHOLD = 1 * 60 * 60 * 1000;

/** given an account (object from DB), create the cookie payload string */
const createCookie = (account, impersonating = false) => JSON.stringify({
  user: account._id,
  robot_token: account.robotToken,
  verified: account.verified,
  has_payment_method: Boolean(
    account?.stripeCustomer?.invoice_settings?.default_payment_method),
  free: account.free,
  balance: account?.stripeCustomer?.balance,
  balanceExpires: account?.balanceExpires,
  admin: account.admin || false,
  impersonating
});

/** dummy capability just to forward general info about devices */
class _robotAgent extends Capability {

  runningPackages = {};
  // store for each device which versions of which packages it is running (speaking)
  devicePackageVersions = {};
  router = express.Router();

  constructor() {
    super(() => {
      // Subscribe to all messages and make sure that the named capabilities are
      // running.
      this.mqttSync.subscribe(
        '/+/+/@transitive-robotics/_robot-agent/+/status/runningPackages');
      this.mqttSync.subscribe(
        '/+/+/@transitive-robotics/_robot-agent/+/status/heartbeat');
      this.mqttSync.subscribe(
        '/+/+/@transitive-robotics/_robot-agent/+/desiredPackages');
      this.mqttSync.subscribe(
        '/+/+/@transitive-robotics/_robot-agent/+/disabledPackages');
      this.mqttSync.subscribe(
        '/+/+/@transitive-robotics/_robot-agent/+/info');

      this.mqttSync.publish('/+/+/+/+/+/billing/token');
      this.mqttSync.publish(
        '/+/+/@transitive-robotics/_robot-agent/+/desiredPackages',
        {atomic: true});
      this.mqttSync.publish(
        '/+/+/@transitive-robotics/_robot-agent/+/disabledPackages',
        {atomic: true});

      this.data.subscribePathFlat(
        '/+orgId/+deviceId/@transitive-robotics/_robot-agent/+/status/runningPackages/+scope/+capName/+version',
        async (value, topic, matched, tags) => {

          if (!value) return;

          // Make sure the docker container for this cap is running
          const {orgId, deviceId, scope, capName, version} = matched;

          if (!this.isRunning(orgId, deviceId)) {
            log.debug('Device is not live', orgId, deviceId);
            return;
          }

          if (!matched.capName.startsWith('_')) {
            const name = `${scope}/${capName}`;
            const key = `${name}:${version}`;
            if (process.env.NODOCKER) {
              log.info('NODOCKER: not starting docker container for', key);
            } else {
              log.info('ensureRunning docker container for', key);
              docker.ensureRunning({name, version});
            }
          }

          // Report usage and get JWT right away since the capability on the
          // device may be waiting on it.
          const {billingUser, billingSecret} = await this.getBillingCreds(orgId);

          if (!billingSecret) {
            log.warn('Unable to record usage for', orgId, '(no billing secret)');
          } else {
            this.recordUsage({orgId, deviceId, scope, capName, version},
              {billingUser, billingSecret});
          }
        });

      this.mqttSync.waitForHeartbeatOnce(() => {
        this.updateAllSubscriptions();
        // report usage every hour
        new CronJob('0 0 * * * *', this.updateAllSubscriptions.bind(this),
          null, true);
      });
    });
  }

  /** check whether the given device is running, i.e., had a recent heartbeat */
  isRunning(orgId, deviceId) {
    const agent = this.data.get(
      [orgId, deviceId, '@transitive-robotics', '_robot-agent']);
    const mergedAgent = mergeVersions(agent, 'status');
    const heartbeat = new Date(mergedAgent.status?.heartbeat || 0).getTime();
    return (heartbeat > Date.now() - RUNNING_THRESHOLD);
  }

  /** get latest version status for all devices in org */
  getLatest(orgId, field = 'status') {
    const org = this.data.get([orgId]);
    // for each device, mergeVersions of _robot-agent
    const devices = {};
    _.each(org, (device, deviceId) => {
      if (deviceId.startsWith('_')) return; // not a device
      const versions = device['@transitive-robotics']['_robot-agent'];
      const merged = mergeVersions(versions, field);
      if (!merged[field]) {
        log.warn(`No ${field} for device ${orgId}/${deviceId}:`, merged);
        return;
      }
      devices[deviceId] = merged[field];
    });
    return devices;
  }

  /** get latest version status for all devices in org */
  getStatus(orgId) {
    return this.getLatest(orgId, 'status');
  }


  /** Given an org id, get the billing user and secret */
  async getBillingCreds(orgId) {

    // for self-hosting: username and JWT secret from transitiverobotics.com
    // (not the local org's secret).
    const {TR_BILLING_USER, TR_BILLING_SECRET} = process.env;
    if (TR_BILLING_USER && TR_BILLING_SECRET) {
      return {billingUser: TR_BILLING_USER, billingSecret : TR_BILLING_SECRET};
    }

    // Get secret to use to sign usage record. We allow overriding this for
    // self-hosting, where this needs to be set to a secret from
    // transitiverobotics.com (not the local org's secret).
    const account =
      await Mongo.db.collection('accounts').findOne({_id: orgId});
    const billingSecret = account?.jwtSecret;

    return {billingUser: orgId, billingSecret};
  }


  /** Report usage to the billing portal, and retrieve back a JWT that the cap
  * on this device can use to start. Publish it in mqtt. */
  async recordUsage({orgId, deviceId, scope, capName, version},
    {billingUser, billingSecret}) {

    const capability = `${scope}/${capName}`;
    const ns = [orgId, deviceId, scope, capName, version];

    // log.debug(`updateSubscriptions: cap ${capability} is running`);
    const params = new URLSearchParams({
      jwt: jwt.sign({orgId, deviceId, capability}, billingSecret),
      host: process.env.TR_HOST  // for bookkeeping
    });

    try {
      const response = await fetch(
        `${BILLING_SERVICE}/v1/record/${billingUser}?${params}`
      );

      const json = await response.json();
      if (json.ok) {
        // got token, share with device
        log.debug(`got token for /${ns.join('/')}`);
        this.data.update([...ns, 'billing', 'token'], json.token);

      } else {
        log.warn(`failed to get token for`, ns, json.error);

        // Move cap from desiredPackages to disabledPackages if it cost money
        const pkg = await getPackageInfo(`${scope}/${capName}`);
        if (pkg.transitiverobotics.price) {
          // figure out which version the device is running, make the change there
          let agentVersion = '0.0.0';
          this.data.forPathMatch([orgId, deviceId, '@transitive-robotics',
              '_robot-agent', '+version', 'status', 'heartbeat'],
            (value, topic, {version}) => {
              value && (versionCompare(version, agentVersion) > 0) &&
                (agentVersion = version);
            });
          const agentNS = [orgId, deviceId, '@transitive-robotics',
            '_robot-agent', agentVersion];

          const desired = clone(
            this.data.get([...agentNS, 'desiredPackages']) || {});
          delete desired?.[scope]?.[capName];

          const disabled = clone(
            this.data.get([...agentNS, 'disabledPackages']) || {});
          disabled[scope] ||= {};
          disabled[scope][capName] = true;

          log.debug('updating', {desired, disabled, ns});
          this.data.update([...agentNS, 'desiredPackages'], desired);
          this.data.update([...agentNS, 'disabledPackages'], disabled);
        }
      }
    } catch (e) {
      log.warn(`failed to record usage for`, ns, e);
    }
  }

  async createBillingUser({orgId}) {
    const {billingUser, billingSecret} = await this.getBillingCreds(orgId);
    log.debug({billingUser, billingSecret});

    const params = new URLSearchParams({
      jwt: jwt.sign({orgId}, billingSecret),
      host: process.env.TR_HOST  // for bookkeeping
    });

    try {
      const response = await fetch(
        `${BILLING_SERVICE}/v1/create/${billingUser}?${params}`);

      const json = await response.json();
      if (!json.ok) {
        log.warn(`failed to create billing user for ${orgId}`, json.error);
      }
    } catch (e) {
      log.warn(`failed to create billing user for ${orgId}`, e);
    }
  }


  /** Ensure the usage of all active devices' capabilities is recorded with the
  * billing service. */
  async updateAllSubscriptions() {

    const running = this.data.filter(['+', '+', '@transitive-robotics',
      '_robot-agent', '+', 'status', 'runningPackages']);
    // log.debug('updateSubscriptions, running', JSON.stringify(running, true, 2));

    _.forEach(running, async (orgRunning, orgId) => {

      const {billingUser, billingSecret} = await this.getBillingCreds(orgId);
      if (!billingSecret) {
        log.warn('Unable to record usage for', orgId, '(no billing secret)');
        return;
      }

      _.forEach(orgRunning, (deviceRunning, deviceId) => {

        // Remove any by robots that have been offline for more than
        // a threshold
        if (!this.isRunning(orgId, deviceId)) return;

        const allVersions = deviceRunning['@transitive-robotics']['_robot-agent'];
        const merged = mergeVersions(allVersions, 'status/runningPackages');
        const pkgRunning = merged.status.runningPackages;

        log.debug(`running packages, ${orgId}/${deviceId}:`,
          JSON.stringify(pkgRunning, null, 2));

        _.forEach(pkgRunning, (scopeRunning, scope) => {
          _.forEach(scopeRunning, async (capRunning, capName) => {
            const version = _.findKey(capRunning, Boolean);
            if (version) {
              // version is running
              await this.recordUsage({orgId, deviceId, scope, capName, version},
                {billingUser, billingSecret});
            }
          });
        });
      });;
    });
  }

  /** get list of all packages running on a device, incl. their versions */
  getDevicePackages(organization, device) {
    // return this.devicePackageVersions[organization][device] || {};
    const agentObj = this.data.get([
      organization, device, '@transitive-robotics', '_robot-agent']);
    const status = mergeVersions(agentObj, 'status').status;
    return status?.runningPackages;
  }

  /** get the latest version of the named capability running on any device
  by the given organziation */
  getLatestRunningVersion(organization, scope, capName) {
    const latestRunning = this.getLatestRunningVersions(organization);
    return latestRunning[scope][capName];
  }

  /** get the latest running version of each package run by this org */
  getLatestRunningVersions(organization) {
    const runningPackages = {};
    const org = this.data.get([organization]);

    // for each device, mergeVersions of _robot-agent, then get running
    _.each(org, (device, deviceId) => {
      const versions = device['@transitive-robotics']['_robot-agent'];
      const merged = mergeVersions(versions, 'status');
      if (!merged.status) {
        log.warn(`no status for device ${organization}/${deviceId}:`, merged);
        return;
      }
      const running = merged.status.runningPackages;

      forMatchIterator(running, ['+scope', '+capName', '+version'],
        (value, topic, {scope, capName, version}) => {
          // if (!value) return;
          // only set version if greater than last one found
          const current = _.get(runningPackages, [scope, capName]);
          (!current || versionCompare(current, version) <= 0) &&
            _.set(runningPackages, [scope, capName], version);
        });
    });

    // this.data.forPathMatch([organization, '+device',
    //     '@transitive-robotics', '_robot-agent', '+', 'status',
    //     'runningPackages', '+scope', '+capName', '+version'],
    //   (value, topic, {agentVersion, scope, capName, version}) => {
    //     value && _.set(runningPackages, [scope, capName], version);
    //   });
    return runningPackages;
  }

  /** define routes for this app */
  addRoutes() {
    this.router.use(express.json());
    this.router.get('/availablePackages', async (req, res) => {
      // TODO: add authentication headers (once #84), npm token as Bearer
      const selector = JSON.stringify({'versions.transitiverobotics': {$exists: 1}});

      const localRegistry = process.env.TR_REGISTRY || 'registry:6000';
      const response = await fetch(`http://${localRegistry}/-/custom/all?q=${selector}`);
      const data = await response.json();

      if (!tryJSONParse(process.env.TR_REGISTRY_IS_LOCAL) &&
        process.env.TR_BILLING_USER && process.env.TR_BILLING_SECRET) {
        // also fetch available packages from Transitive Robotics's public repo
        const publicResponse = await fetch(
          `https://registry.transitiverobotics.com/-/custom/all?q=${selector}`);
        const publicData = await publicResponse.json();
        Object.assign(data, publicData);
      }

      // log.debug('availablePackages', data);

      res.set({'Access-Control-Allow-Origin': '*'});
      res.json(data);
    });

    addSessions(this.router, 'sessions', process.env.TR_SESSION_SECRET);

    this.router.get('/test', requireLogin, async (req, res) => {
      req.session.count = (req.session.count || 0) + 1;
      console.log(req.session);
      res.json({msg: 'ok', session: req.session,
        mongo: Mongo.db.databaseName});
    });


    this.router.post('/login', async (req, res) => {
      log.debug('login', req.body);

      const fail = (error) =>
        res.clearCookie(COOKIE_NAME).status(401).json({error, ok: false});

      if (!req.body.name || !req.body.password) {
        log.debug('missing credentials', req.body);
        return fail('no account name or password given');
        // on purpose not disclosing that the account doesn't exist
      }

      const accounts = Mongo.db.collection('accounts');
      const account = await accounts.findOne({_id: req.body.name});
      if (!account) {
        log.info('no such account', req.body.name);
        return fail('invalid credentials');
        // on purpose not disclosing that the account doesn't exist
      }

      const valid = await bcrypt.compare(req.body.password, account.bcryptPassword);
      if (!valid) {
        log.info('wrong password for account', req.body.name);
        return fail('invalid credentials');
      }

      // Write the verified username to the session to indicate logged in status
      req.session.user = account;
      res.cookie(COOKIE_NAME, createCookie(account)).json({status: 'ok'});
    });

    /** Called by client to refresh the session cookie */
    this.router.get('/refresh', requireLogin, async (req, res) => {
      log.debug('refresh');

      const fail = (error) =>
        res.clearCookie(COOKIE_NAME).status(401).json({error, ok: false});

      const accounts = Mongo.db.collection('accounts');
      const account = await accounts.findOne({_id: req.session.user._id});
      if (!account) {
        log.info('no account for user', req.session.user._id);
        return fail('invalid session');
      }

      req.session.user = account;
      res.cookie(COOKIE_NAME,
        createCookie(account, Boolean(req.session.originalUser)))
        .json({status: 'ok'});
    });


    this.router.post('/logout', async (req, res, next) => {
      log.debug('logout', req.session.user);
      req.session.user = null
      req.session.save((err) => {
        if (err) next(err);
        req.session.regenerate((err) => {
          if (err) next(err);
          res.clearCookie(COOKIE_NAME).json({status: 'ok'});
        });
      })
    });


    this.router.post('/register', async (req, res) => {
      log.debug('register', req.body);

      const fail = (error) =>
        res.clearCookie(COOKIE_NAME).status(401).json({error, ok: false});

      if (!req.body.name || !req.body.password || !req.body.email) {
        log.debug('missing credentials', req.body);
        return fail('missing username, password, or email');
        // on purpose not disclosing that the account doesn't exist
      }

      const accounts = Mongo.db.collection('accounts');
      const account = await accounts.findOne({_id: req.body.name});
      if (account) {
        log.warn('account already exists', req.body.name);
        return fail('account already exists');
      }

      createAccount(req.body, (err, account) => {
        if (err) {
          return fail('account already exists');
        } else {
          sendVerificationEmail(req.body.name);

          // Write the verified username to the session to indicate logged in status
          req.session.user = account;
          res.cookie(COOKIE_NAME, createCookie(account)).json({status: 'ok'});
        }
      });
    });

    this.router.get('/verify', async (req, res) => {
      log.debug('verify', req.query);

      const {id, code} = req.query;

      const fail = (error) => {
        log.debug(error);
        return res.status(400).send(error);
      }

      if (!id || !code) {
        return fail('missing id or code');
      }

      const {error, account} = await verifyCode(id, code);
      if (error) return fail(error);

      // already create billing account
      await this.createBillingUser({orgId: id});

      req.session.user = account; // also log in, in case logged out
      res.cookie(COOKIE_NAME, JSON.stringify({
          user: id,
          verified: account.email,
          robot_token: account.robotToken
        })).redirect(`/#msg=verificationSuccessful`);
    });


    this.router.post('/getJWT', requireLogin, async (req, res) => {
      log.debug('get JWT token', req.body);

      const accounts = Mongo.db.collection('accounts');
      const account = await accounts.findOne({_id: req.session.user._id});

      if (!account.jwtSecret) {
        res.status(400).end(JSON.stringify({
          error: 'No JWT secret. Has the account not been activated yet?'}));
        return;
      }

      const token = jwt.sign(req.body, account.jwtSecret);
      log.debug('responding with', {token});
      res.json({token});
    });


    this.router.post('/createCapsToken', requireLogin, async (req, res) => {
      log.debug('createCapsToken', req.body);
      if (!req.body.jwt) {
        res.status(400).end('missing jwt');
        return;
      }

      if (!req.body.tokenName) {
        res.status(400).end('missing tokenName');
        return;
      }

      if (!req.body.password) {
        res.status(400).end('missing password');
        return;
      }

      const accounts = Mongo.db.collection('accounts');
      const account = await accounts.findOne({_id: req.session.user._id});
      let payload;
      try {
        payload = await jwt.verify(req.body.jwt, account.jwtSecret);
      } catch (e) {
        res.status(401).json({});
        return;
      }

      // add to account
      log.debug(payload);
      delete payload.id;
      delete payload.validity;
      delete payload.iat;
      payload.password = req.body.password;
      payload.config = req.body.config;
      const modifier = {[`capTokens.${req.body.tokenName}`]: payload};
      const updateResult = await accounts.updateOne(
        {_id: req.session.user._id}, {$set: modifier});
      log.debug({updateResult});

      res.json({});
    });

    /** revoke the caps token */
    this.router.delete('/capsToken/:tokenName', requireLogin, async (req, res) => {
      log.debug('delete capsToken');
      if (!req.params.tokenName) {
        res.status(400).end('missing tokenName');
        return;
      }

      const unset = {};
      unset[`capTokens.${req.params.tokenName}`] = 1;
      const accounts = Mongo.db.collection('accounts');
      const updateResult = await accounts.updateOne(
        {_id: req.session.user._id}, {$unset: unset});
      log.debug({updateResult});

      // TODO: also terminate all active token sessions with this token.
      // This is not easy, since users store the JWT in their cookie and use
      // that without first checking the session. Also, the session store only
      // contains the token name in the JSON.stringified `session` field (as
      // userId).

      res.json({});
    });


    this.router.get('/runningPackages', requireLogin, async (req, res) => {
      res.json(this.getLatestRunningVersions(req.session.user._id));
    });

    this.router.get('/security', requireLogin, async (req, res) => {
      log.debug('get JWT secret for', req.session.user);
      const accounts = Mongo.db.collection('accounts');
      const account = await accounts.findOne({_id: req.session.user._id});

      for (let token in account.capTokens) {
        delete account.capTokens[token].password;
      }

      res.json({
        jwtSecret: account.jwtSecret,
        capTokens: account.capTokens || {}
      });
    });

    // Admin tools

    this.router.post('/admin/impersonate', requireAdmin, async (req, res) => {
      log.debug('impersonate', req.body);

      const fail = (error) => {
        log.debug('/impersonate, fail:', error);
        return res.clearCookie(COOKIE_NAME).status(401).json({error, ok: false});
      }

      if (!req.body.name) {
        return fail('no account name given');
      }

      const accounts = Mongo.db.collection('accounts');
      const account = await accounts.findOne({_id: req.body.name});
      if (!account) {
        return fail('no such account', req.body.name);
      }

      // Write the verified username to the session to indicate logged in status
      req.session.originalUser = req.session.user;
      req.session.user = account;
      res.cookie(COOKIE_NAME, createCookie(account, true)).json({status: 'ok'});
    });

    this.router.get('/admin/deimpersonate', requireLogin, async (req, res) => {
      log.debug('deimpersonate');

      const fail = (error) => {
        log.debug('/deimpersonate, fail:', error);
        return res.clearCookie(COOKIE_NAME).status(401).json({error, ok: false});
      }

      if (!req.session.originalUser) {
        return fail('not impersonating');
      }

      req.session.user = req.session.originalUser;
      delete req.session.originalUser;
      res.cookie(COOKIE_NAME, createCookie(req.session.user)).json({status: 'ok'});
    });

    /** get list of users */
    this.router.get('/admin/getUsers', requireAdmin, async (req, res) => {
      const accounts = Mongo.db.collection('accounts');
      const users = await accounts.find({_id: {$ne: 'bot'}}).toArray();
      res.json({users});
    });

    this.router.get('/admin/startCloudCap/:name/:version', requireAdmin,
      (req, res) => {
        docker.ensureRunning(req.params);
        log.debug('manually starting cloud cap for', req.params);
        res.json({});
      });

    this.router.get('/admin/createBillingUser/:orgId', requireAdmin,
      async (req, res) => {
        await this.createBillingUser({orgId: req.params.orgId});
        res.json({});
      });


    /* JWT-secured API, intended for back-end use by power users */

    /** list capabilities running on the given device */
    this.router.get('/api/v1/running/:deviceId', requireJWT, (req, res) => {
      const {deviceId} = req.params;
      res.json(this.getDevicePackages(req.jwtSession.userId, deviceId));
    });

    /** list devices and the capabilities they are running */
    this.router.get('/api/v1/running/', requireJWT, (req, res) => {
      const statuses = this.getStatus(req.jwtSession.userId);
      res.json(_.mapValues(statuses, s => s.runningPackages));
    });

    /** get heartbeats of all devices */
    this.router.get('/api/v1/heartbeats/', requireJWT, (req, res) => {
      const statuses = this.getStatus(req.jwtSession.userId);
      res.json(_.mapValues(statuses, s => s.heartbeat));
    });

    /** get status of all devices */
    this.router.get('/api/v1/status/', requireJWT, (req, res) => {
      res.json(this.getStatus(req.jwtSession.userId));
    });

    this.router.get('/api/v1/info/', requireJWT, (req, res) => {
      res.json(this.getLatest(req.jwtSession.userId, 'info'));
    });
  }
};


const robotAgent = new _robotAgent();
// let robot agent capability handle it's own sub-path; enable the same for all
// other, regular, capabilities as well?
app.use('/@transitive-robotics/_robot-agent', robotAgent.router);

// routes used during the installation process of a new robot
app.use('/install', installRouter);

app.get('/admin/setLogLevel', (req, res) => {
  if (!req.query.level) {
    res.status(400).end('missing level');
  } else {
    log.setLevel(req.query.level);
    const msg = `Set log level to ${req.query.level}`;
    console.log(msg);
    res.end(msg);
  }
});

// to allow client-side routing:
app.use('/*', (req, res) =>
  res.sendFile(path.join(cwd, 'public', 'index.html')));

const server = http.createServer(app);

/** catch-all to be safe */
process.on('uncaughtException', (err) => {
  console.error(`**** Caught exception: ${err}:`, err.stack);
});

/** ---------------------------------------------------------------------------
  MAIN
*/
log.info('Starting cloud app');
Mongo.init(() => {
  // if username and password are provided as env vars, create account if it
  // doesn't yet exists. This is used for initial bringup.
  process.env.TR_USER && process.env.TR_PASS &&
    createAccount({
      name: process.env.TR_USER,
      password: process.env.TR_PASS,
      email: process.env.TR_EMAIL,
      admin: true
    });

  addCapsRoutes();
  robotAgent.addRoutes();

  server.listen(PORT, () => {
    log.info(`Server started on port ${server.address().port}`);
  });
});
