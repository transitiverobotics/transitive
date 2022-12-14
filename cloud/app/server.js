const express = require('express');
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
mergeVersions, forMatchIterator, Capability } = require('@transitive-sdk/utils');

const {createAccount} = require('./accounts');
const { COOKIE_NAME, TOKEN_COOKIE } = require('./common.js');

// const WebRTCVideo = require('./caps/webrtc_video');
// const RemoteTeleop = require('./caps/remote_teleop');
// const RemoteAccess = require('./caps/remote_access');

const docker = require('./docker');
const installRouter = require('./install');
const stripeUtils = require('./stripeUtils');

const HEARTBEAT_TOPIC = '$SYS/broker/uptime';

const REGISTRY = process.env.TR_REGISTRY || 'localhost:6000';

const PORT = process.env.TR_CLOUD_PORT || 9000;

const log = getLogger('server');
// log.setLevel('info');
log.setLevel('debug');

const addSessions = (router, collectionName, secret) => {
  router.use(session({
    secret,
    name: collectionName,
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({
      clientPromise: new Promise((resolve) => resolve(Mongo.client)),
      dbName: Mongo.db.databaseName,
      collectionName
    })
  }));
};

/** simple middleware to check whether the user is logged in */
const requireLogin = (req, res, next) => {
  // log.debug(req.session);
  if (!req.session || !req.session.user) {
    res.status(401).end('Not authorized. You need to be logged in.');
  } else {
    next();
  }
};

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

// ----------------------------------------------------------------------

const app = express();

/* log all requests when debugging */
// app.use((req, res, next) => {
//   log.debug(req.method, req.originalUrl);
//   next();
// });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.json());

// router for standalone-component pages
const capsRouter = express.Router();
app.use('/caps', capsRouter);

const addCapsRoutes = () => {
  log.debug('adding caps router');

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

    const payload = Object.assign({}, permissions, {
      id: org,
      userId: token,
      validity: 3600 * 24,
    });

    const json = {token: jwt.sign(payload, account.jwtSecret)};
    log.debug('responding with', json, 'and setting cookie', TOKEN_COOKIE);
    req.session.token = json.token;
    res.cookie(TOKEN_COOKIE, JSON.stringify(json)).json(json);
  });

  /** if the client already has a JWT, it can set it for the session here */
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
  docker-compose or create symlink `ln -s ../../transitive-caps .` */
  capsRouter.use('/:scope/:capabilityName/:version/', (req, res, next) => {
    const filePath = path.resolve('transitive-caps/',
      req.params.capabilityName,
      req.path.slice(1) // drop initial slash
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
  capsRouter.use('/:scope/:capName/:version', (req, res, next) => {
    // construct docker container name from named cap and version
    // e.g., transitive-robotics.configuration-management.0.1.5-0.cloud_caps
    // (cloud_caps is the name of the docker network)
    const host =
      `${req.params.scope}.${req.params.capName}.${req.params.version}.cloud_caps`;
    log.debug('proxying to', host);
    capsProxy.web(req, res, {target: `http://${host}:8085`});
  });
};


/** Serve the js bundles of capabilities */
app.use('/running/@transitive-robotics/_robot-agent',
  express.static(path.resolve(__dirname)));

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

/** authenticate the username based on the JWT given as password */
app.post('/auth/user', async (req, res) => {
  // log.debug('/auth/user', req.body);

  //   clientid: 'qEmYn5tibovKgGvSm',
  //   password: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkZXZpY2UiOiJHYkdhMnlncXF6IiwiY2FwYWJpbGl0eSI6ImhlYWx0aC1tb25pdG9yaW5nIiwidXNlcklkIjoicG9ydGFsVXNlci1xRW1ZbjV0aWJvdktnR3ZTbSIsInZhbGlkaXR5Ijo0MzIwMCwiaWF0IjoxNjM3MDk1Nzg5fQ.H6-3I5z-BwFeUJ3A-j1_2NE9YFa7AGAz5nTWkMPuY9k',
  //   username: '{id, payload: {device, capability, userId, validity}}'

  const accounts = Mongo.db.collection('accounts');
  // const devices = Mongo.db.collection('devices');

  const token = req.body.password;
  const payload = decodeJWT(token);
  const parsedUsername = JSON.parse(req.body.username);
  // log.debug('  ', payload, parsedUsername);

  try {
    // First verify that the user's signed JWT has the same payload as username.
    // This is needed because downstream decision, e.g., in ACL, will be based
    // on this verified username.
    assert.deepEqual(payload, parsedUsername.payload);

    const account = await accounts.findOne({_id: parsedUsername.id});
    // log.debug(account);
    if (!account) {
      res.status(401).send(
        'no such account, please verify the id provided to the web component');
      return;
    }
    if (!account.jwtSecret) {
      res.status(401).send('account has no jwt secret! please recreate using the cli tool');
      return;
    }

    await jwt.verify(token, account.jwtSecret);
    log.debug('verified token');

    if (!payload.validity || (payload.iat + payload.validity) * 1e3 < Date.now()) {
      // The token is expired
      log.info(`JWT is expired ${JSON.stringify(payload)}`);
      res.status(401).send(`JWT is expired ${JSON.stringify(payload)}`);
      return;
    }

    res.send('ok');
  } catch (e) {
    log.info(`user authentication failed`, e);
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
    const allowed = id == requested.organization &&
      permitted.validity &&
      (permitted.iat + permitted.validity) * 1e3 > Date.now() &&
      (
        (permitted.device == requested.device &&
            ((permitted.capability == requested.capability &&
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
          // _fleet permissions give read access to all devices' data for the
          // cap (in the permitted org only of course)
          ( permitted.device == '_fleet' && readAccess &&
              requested.capability == permitted.capability &&
              !permitted.topics )
      );

    // log.debug('/auth/acl', payload, parsedTopic);
    // log.debug('/auth/acl', req.body.topic, readAccess, allowed);

    (allowed ? res.send('ok') :
      res.status(401).end('not authorized for topic or token expired')
    );
  } catch (e) {
    log.warn('/auth/acl exception', e, req.body);
    res.status(400).end('unable to parse authentication request')
  }
});



/* -------------------------------------------------------------------------
  Cloud Agent
*/

// After 24h of a robot not reporting a heartbeat we'll pause billing for any
// premium capabilities it might be running
const RUNNING_THRESHOLD = 24 * 60 * 60 * 1000;

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
      this.data.subscribePathFlat(
        '/+org/+device/@transitive-robotics/_robot-agent/+/status/runningPackages/+scope/+capName/+version',
        (value, topic, matched, tags) => {

          if (!value) return;

          // this.addDevicePackageVersion(parsed);
          const {scope, capName, version} = matched;
          const name = `${scope}/${capName}`;
          const key = `${name}:${version}`;

          if (!matched.capName.startsWith('_')) {
            if (process.env.NODOCKER) {
              log.info('NODOCKER: not starting docker container for', key);
            } else {
              log.info('ensureRunning docker container for', key);
              docker.ensureRunning({name, version});
            }
          }
        });

      this.mqttSync.waitForHeartbeatOnce(() => {
        this.updateSubscriptions();
        new CronJob('0 0 0,12 * * *', this.updateSubscriptions.bind(this), null, true);
      });
    });
  }

  /** Ensure that customers have subscriptions in Stripe for all the paid caps
  they are running, incl. quantity. This function should be called regularly,
  maybe once an hour. */
  async updateSubscriptions() {
    // first make sure list of products in Stripe is up to date
    const products = await updateProducts();

    const running = this.data.filter(['+', '+', '@transitive-robotics',
      '_robot-agent', '+', 'status', 'runningPackages']);
    // log.debug('updateSubscriptions, running', JSON.stringify(running, true, 2));

    _.forEach(running, (orgRunning, orgId) => {
      const counts = {};
      _.forEach(orgRunning, (deviceRunning, deviceId) => {

        // Remove any by robots that have been offline for more than
        // a threshold
        const agent = this.data.get([orgId, deviceId, '@transitive-robotics',
          '_robot-agent']);
        const mergedAgent = mergeVersions(agent, 'status');
        log.debug({mergedAgent});
        const heartbeat = new Date(mergedAgent.status?.heartbeat || 0).getTime();
        if (heartbeat < Date.now() - RUNNING_THRESHOLD) {
          log.debug(`ignoring device ${deviceId}, offline since ${heartbeat}`);
          return;
        }

        const allVersions = deviceRunning['@transitive-robotics']['_robot-agent'];
        const merged = mergeVersions(allVersions, 'status/runningPackages');
        const pkgRunning = merged.status.runningPackages;

        log.debug(`running packages, ${orgId}/${deviceId}:`, pkgRunning);

        _.forEach(pkgRunning, (scopeRunning, scope) => {
          _.forEach(scopeRunning, (capRunning, capName) => {
            if (_.some(capRunning, (value) => value)) {
              const capability = `${scope}/${capName}`;
              // log.debug(`updateSubscriptions: cap ${capability} is running`);
              !counts[capability] && (counts[capability] = 0);
              counts[capability]++;
            }
          });
        });
      });

      stripeUtils.updateSubscriptions(orgId, counts, products);
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
    _.each(org, device => {
      const versions = device['@transitive-robotics']['_robot-agent'];
      const running = mergeVersions(versions, 'status').status.runningPackages;

      forMatchIterator(running, ['+scope', '+capName', '+version'],
        (value, topic, {scope, capName, version}) => {
          value && _.set(runningPackages, [scope, capName], version);
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
      // TODO: do not hard-code store url (once #82)
      // TODO: add authentication headers (once #84), npm token as Bearer
      const selector = JSON.stringify({'versions.transitiverobotics': {$exists: 1}});
      const response = await fetch(`http://${REGISTRY}/-/custom/all?q=${selector}`);
      const data = await response.json();
      log.trace('availablePackages', data);
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
        return fail('to account name given');
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
      res.cookie(COOKIE_NAME,
        JSON.stringify({user: account._id, robot_token: account.robotToken}))
        .json({status: 'ok'});
    });


    this.router.post('/logout', async (req, res) => {
      log.debug('logout', req.session.user);
      res.clearCookie(COOKIE_NAME).json({status: 'ok'});
      delete req.session.user;
    });


    this.router.post('/getJWT', requireLogin, async (req, res) => {
      log.debug('get JWT token', req.body);

      const accounts = Mongo.db.collection('accounts');
      const account = await accounts.findOne({_id: req.session.user._id});

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
      const modifier = {[`capTokens.${req.body.tokenName}`]: payload};
      const updateResult = await accounts.updateOne(
        {_id: req.session.user._id}, {$set: modifier});
      log.debug({updateResult});

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

    this.router.get('/stripe/create-customer-portal-session',
      requireLogin,
      stripeUtils.createPortalSession);

    this.router.get('/admin/startCloudCap/:name/:version', requireLogin,
      (req, res) => {
        docker.ensureRunning(req.params);
        log.debug('manually starting cloud cap for', req.params);
        res.json({});
      });
  }
};


const robotAgent = new _robotAgent();
// let robot agent capability handle it's own sub-path; enable the same for all
// other, regular, capabilities as well?
app.use('/@transitive-robotics/_robot-agent', robotAgent.router);

// routes used during the installation process of a new robot
app.use('/install', installRouter);

/** receive webhook events from Stripe */
app.use('/stripe/webhooks', stripeUtils.handleWebhook);

/** fetch the latest info about packages from registry, and update Stripe */
const updateProducts = async () => {
  const selector = JSON.stringify({'transitiverobotics.price': {$exists: 1}});
  const response = await fetch(`http://${REGISTRY}/-/custom/all?q=${selector}`);
  const allPackages = await response.json();

  // log.debug(JSON.stringify(allPackages, true, 2));
  // const latest = allPackages.map(data => data.versions.find(({version}) =>
  //   version == data.version));
  const list = await stripeUtils.updateProducts(allPackages);

  return list;
};

// for debugging
// app.use('*', (req, res, next) => {
//   console.log('Unknown path', req.method, req.url);
//   res.status(404).end();
// });

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
  res.sendFile(path.join(__dirname, 'public', 'index.html')));


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
    createAccount(process.env.TR_USER, process.env.TR_PASS);

  addCapsRoutes();
  robotAgent.addRoutes();

  server.listen(PORT, () => {
    log.info(`Server started on port ${server.address().port}`);
  });

  // once an hour update products
  // new CronJob('0 0 * * * *', updateProducts, null, true);
  // updateProducts();
});
