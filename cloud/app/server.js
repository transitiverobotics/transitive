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

const Mongo = require('@transitive-sdk/utils/mongo');
const { parseMQTTTopic, decodeJWT, loglevel, getLogger, versionCompare } =
  require('@transitive-sdk/utils');
const { Capability } = require('@transitive-sdk/utils/cloud');

const {createAccount} = require('./accounts');
const { COOKIE_NAME } = require('./common.js');

// const WebRTCVideo = require('./caps/webrtc_video');
// const RemoteTeleop = require('./caps/remote_teleop');
// const RemoteAccess = require('./caps/remote_access');

const docker = require('./docker');
const installRouter = require('./install');

const HEARTBEAT_TOPIC = '$SYS/broker/uptime';

const REGISTRY = process.env.TR_REGISTRY || 'localhost:6000';

const PORT = process.env.TR_CLOUD_PORT || 9000;

const log = getLogger('server');
log.setLevel('debug');

// ----------------------------------------------------------------------

const app = express();

/* log all requests when debugging */
// app.use((req, res, next) => {
//   log.debug(req.method, req.originalUrl);
//   next();
// });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'dist')));

// for DEV: ignore version number and serve (latest) from relative path, see
// docker-compose or create symlink `ln -s ../../transitive-caps .`
app.use('/caps/:scope/:capabilityName/:version/dist/:asset', (req, res, next) => {
  const filePath = path.resolve('transitive-caps/',
    req.params.capabilityName, 'dist',
    // path.basename(req.url),
    req.params.asset);
  log.debug('checking for dev bundle', filePath);
  fs.access(filePath, (err) => {
    if (err) {
      next();
    } else {
      log.debug('capability bundle from dev environment:', filePath);
      res.sendFile(filePath);
    }
  });
});

app.use('/caps', express.static(docker.RUN_DIR));


app.use(express.json());

const server = http.createServer(app);

// app.get('/bundle/:capability/:jsFile', (req, res) => {
/** Serve the js bundles of capabilities */
const capRouter = express.Router();
app.use('/bundle', capRouter);
capRouter.use('/@transitive-robotics/_robot-agent',
  express.static(path.resolve(__dirname, 'dist')));

capRouter.get('/:scope/:capabilityName/*', (req, res) => {
  console.log(`getting ${req.path}`, req.query, req.params);
  const capability = `${req.params.scope}/${req.params.capabilityName}`;
  const filePath = req.params[0]; // the part that matched the *
  let version;
  if (req.query.deviceId == "_fleet") {
    // Serve the latest version run by any device
    version = robotAgent.getLatestRunningVersion(req.query.userId, capability);
    // TODO: if no device is running this capability, serve the latest version.
    // This is required to allow capabilities that are cloud+UI only.
  } else {
    const runningPkgs = robotAgent &&
      robotAgent.getDevicePackages(req.query.userId, req.query.deviceId);
    version = runningPkgs && runningPkgs[capability];
  }
  console.log({version});
  if (version) {
    // redirect to the folder in dist (symlinked to the place where the named
    // package exposes its distribution files bundles: in production from docker,
    // in dev symlinked in folder).
    res.redirect(`/caps/${capability}/${version}/dist/${filePath}`);
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
  console.log('  ', payload, parsedUsername);

  try {
    // First verify that the user's signed JWT has the same payload as username.
    // This is needed because downstream decision, e.g., in ACL, will be based
    // on this verified username.
    assert.deepEqual(payload, parsedUsername.payload);

    const account = await accounts.findOne({_id: parsedUsername.id});
    console.log(account);
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
    console.log('verified token');

    if (!payload.validity || (payload.iat + payload.validity) * 1e3 < Date.now()) {
      // The token is expired
      console.log(`JWT is expired ${JSON.stringify(payload)}`);
      res.status(401).send(`JWT is expired ${JSON.stringify(payload)}`);
      return;
    }

    res.send('ok');
  } catch (e) {
    console.log(`user authentication failed`, e);
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
    const {id, payload} = JSON.parse(req.body.username);
    // payload describes the permissions of the user
    const parsedTopic = parseMQTTTopic(req.body.topic);
    // whether or not the request is just for reading
    const readAccess = (req.body.acc == 1 || req.body.acc == 4);
    const allowed = id == parsedTopic.organization &&
      payload.validity && (payload.iat + payload.validity) * 1e3 > Date.now() &&
      ( ( payload.device == parsedTopic.device &&
            ( payload.capability == parsedTopic.capability ||
              // all valid JWTs for a device also grant read access to _robot-agent
              (readAccess &&
                parsedTopic.capability == '@transitive-robotics/_robot-agent'))
        ) ||
          // _fleet permissions give read access also to all devices' robot-agents
          ( payload.device == '_fleet' && readAccess &&
              parsedTopic.capability == '@transitive-robotics/_robot-agent' )
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


/** simple middleware to check whether the user is logged in */
const requireLogin = (req, res, next) => {
  if (!req.session || !req.session.user) {
    res.status(401).end('Not authorized. You need to be logged in.');
  } else {
    next();
  }
};

/* -------------------------------------------------------------------------
  Cloud Agent
*/

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
      this.mqtt.subscribe(`/+/+/+/#`);
      this.mqtt.on('message', (topic) => {
        if (topic.startsWith('$SYS')) return;

        const parsed = parseMQTTTopic(topic);
        this.addDevicePackageVersion(parsed);
        const key = `${parsed.capability}@${parsed.version}`;

        if (!this.runningPackages[key] && !key.startsWith('@transitive-robotics/_')) {

          if (process.env.NODOCKER) {
            log.debug('NODOCKER: not starting docker container for', key);
          } else {
            log.debug('starting docker container for', key);
            docker.ensureRunning({name: parsed.capability, version: parsed.version});
          }

          this.runningPackages[key] = new Date();
        }
      });
    });

    this.router.use(express.json());
  }

  /** remember that the given device runs the given version of the capability */
  addDevicePackageVersion({organization, device, capability, version}) {
    !this.devicePackageVersions[organization] &&
      (this.devicePackageVersions[organization] = {});
    !this.devicePackageVersions[organization][device] &&
      (this.devicePackageVersions[organization][device] = {});
    this.devicePackageVersions[organization][device][capability] = version;
  }

  /** get list of all packages running on a device, incl. their versions */
  getDevicePackages(organization, device) {
    return this.devicePackageVersions[organization][device] || {};
  }

  /** get the latest version of the named capability running on any device
  by the given organziation */
  getLatestRunningVersion(organization, capability) {
    const devices = this.devicePackageVersions[organization];
    const versions = Object.values(devices)
        .map(device => device[capability] || '0.0.0-0');
    log.debug({versions});
    versions.sort(versionCompare);
    return versions.at(-1);
  }

  /** define routes for this app */
  addRoutes() {
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


    this.router.use(session({
      secret: process.env.TR_SESSION_SECRET,
      resave: false,
      saveUninitialized: true,
      store: MongoStore.create({
        clientPromise: new Promise((resolve) => resolve(Mongo.client)),
        dbName: Mongo.db.databaseName
      })
    }));


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
        log.debug('no such account', req.body.name);
        return fail('invalid credentials');
        // on purpose not disclosing that the account doesn't exist
      }

      const valid = await bcrypt.compare(req.body.password, account.bcryptPassword);
      if (!valid) {
        log.debug('wrong password for account', req.body.name);
        return fail('invalid credentials');
      }

      // Write the verified username to the session to indicate logged in status
      req.session.user = account._id;
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
      const account = await accounts.findOne({_id: req.session.user});

      const token = jwt.sign(req.body, account.jwtSecret);
      log.debug('responding with', {token});
      res.json({token});
    });

    this.router.get('/runningPackages', requireLogin, async (req, res) => {
      res.json(this.runningPackages);
    });

    this.router.get('/jwtSecret', requireLogin, async (req, res) => {
      log.debug('get JWT secret for', req.session.user);
      const accounts = Mongo.db.collection('accounts');
      const account = await accounts.findOne({_id: req.session.user});
      res.json({jwtSecret: account.jwtSecret});
    });
  }
};


const robotAgent = new _robotAgent();
// let robot agent capability handle it's own sub-path; enable the same for all
// other, regular, capabilities as well?
app.use('/@transitive-robotics/_robot-agent', robotAgent.router);

// routes used during the installation process of a new robot
app.use('/install', installRouter);

// for debugging
// app.use('*', (req, res, next) => {
//   console.log('Unknown path', req.method, req.url);
//   res.status(404).end();
// });

// to allow client-side routing:
app.use('/*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html')));

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

  robotAgent.addRoutes();
  server.listen(PORT, () => {
    log.info(`Server started on port ${server.address().port}`);
  });
});
