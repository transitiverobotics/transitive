const express = require('express');
const path = require('path');
const http = require('http');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const fetch = require('node-fetch');
const bcrypt = require('bcrypt');
const session = require('express-session');
const MongoStore = require('connect-mongo');

const Mongo = require('@transitive-robotics/utils/mongo');
const { parseMQTTTopic, decodeJWT, loglevel, getLogger, versionCompare } =
  require('@transitive-robotics/utils/server');
const { Capability } = require('@transitive-robotics/utils/cloud');

// const { MQTTHandler } = require('./mqtt');
// const Capability = require('./caps/capability');
// const HealthMonitoring = require('./caps/health_monitoring');
// const RemoteAccess = require('./caps/remote_access');
// const VideoStreaming = require('./caps/video_streaming');
// const WebRTCVideo = require('./caps/webrtc_video');
// const RemoteTeleop = require('./caps/remote_teleop');

const docker = require('./docker');
const installRouter = require('./install');

const HEARTBEAT_TOPIC = '$SYS/broker/uptime';

const log = getLogger(module.id);

// ----------------------------------------------------------------------

const app = express();

app.use((req, res, next) => {
  log.debug(req.method, req.originalUrl);
  next();
});

// app.use(express.static(path.join(__dirname, 'build')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'dist')));
app.use('/caps', express.static(docker.RUN_DIR));

// for DEV: ignore version number and serve (latest) from relative path
app.use('/caps/:scope/:capabilityName/:version/:asset', (req, res, next) => {
  const filePath = path.resolve(__dirname, '../../../transitive-caps/',
    req.params.capabilityName, 'dist',
    // path.basename(req.url),
    req.params.asset);
  res.sendFile(filePath);
});

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
  // #HERE: handle the case where deviceId == "_fleet"; serve the
  // latest version run by any device?
  let version;
  if (req.query.deviceId == "_fleet") {
    version = robotAgent.getLatestRunningVersion(req.query.userId, capability);
  } else {
    const runningPkgs = robotAgent &&
      robotAgent.getDevicePackages(req.query.userId, req.query.deviceId);
    version = runningPkgs && runningPkgs[capability];
  }
  console.log(version);
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


// const clients = [];

// const wss = new WebSocket.Server({ noServer: true });
//
// wss.on('connection', (ws, permission) => {
//   // console.log('client connected', permission);
//   const cap = Capability.lookup(permission.capability);
//   if (cap) {
//     cap.addClient({ws, permission});
//   } else {
//     console.warn(`A ws client connected for an unknown capability
//       ${permission.capability}`);
//   }
// });


// /** authenticate the request to connect to our WS server */
// const authenticate = (request, cb) => {
//   const query = new URLSearchParams(request.url.replace(/^\//,''));
//   console.log('authenticate', request.url, query);
//
//   const token = query.get('t');
//   const transitiveUserId = query.get('id');
//
//   const cbWithMessage = (err, result) => {
//     err && console.log(err);
//     result && (result.transitiveUserId = transitiveUserId);
//     cb(err, result);
//   };
//
//   if (!token) {
//     cbWithMessage('no jwt provided');
//     return;
//   }
//   if (!transitiveUserId) {
//     cbWithMessage('no id provided');
//     return;
//   }
//
//   const users = Mongo.db.collection('users');
//   const devices = Mongo.db.collection('devices');
//
//   users.findOne({_id: transitiveUserId}, (err, doc) => {
//     if (err || !doc) {
//       cbWithMessage(
//         'no such user, please verify the id provided to the web component')
//     } else {
//       console.log('from db:', err, doc);
//       if (!doc.jwt_secret) {
//         cbWithMessage('user has no jwt secret yet, please visit the portal')
//       } else {
//         jwt.verify(token, doc.jwt_secret, (err, payload) => {
//           if (err) {
//             cbWithMessage('Unable to verify JWT token');
//           } else {
//             if (payload.validity &&
//               (payload.iat + payload.validity) * 1e3 > Date.now()) {
//               // The token is valid.
//               if (!payload.device && payload.hostname) {
//                 // No device id provided, look it up from hostname
//                 devices.findOne({
//                     owner: transitiveUserId,
//                     'info.os.hostname': payload.hostname
//                   }, (err, doc) => {
//                     if (err) {
//                       console.warn(`Unable to find device of '${transitiveUserId}' by hostname '${payload.hostname}'`);
//                     } else {
//                       payload.device = doc._id;
//                       cbWithMessage(null, payload);
//                     }
//                   });
//               } else {
//                 cbWithMessage(null, payload);
//               }
//             } else {
//               cbWithMessage(`JWT is expired ${JSON.stringify(payload)}`);
//             }
//           }
//         });
//       }
//     }
//   });
// };
//
//
// server.on('upgrade', (request, socket, head) => {
//   authenticate(request, (err, permission) => {
//     if (err || !permission) {
//       socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
//       socket.destroy();
//     } else {
//       wss.handleUpgrade(request, socket, head,
//         ws => wss.emit('connection', ws, permission));
//     }
//   });
// });

/** ---------------------------------------------------------------------------
  Authentication for MQTT Websockets (called from mosquitto go-auth)
*/

/** authenticate the username based on the JWT given as password */
app.post('/auth/user', async (req, res) => {
  console.log('/auth/user', req.body);
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

    log.debug('/auth/acl', payload, parsedTopic);
    log.debug('/auth/acl', req.body.topic, readAccess, allowed);

    (allowed ? res.send('ok') :
      res.status(401).end('not authorized for topic or token expired')
    );
  } catch (e) {
    console.warn('/auth/acl exception', e, req.body);
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

const COOKIES = {
  USER: 'transitive-user'
};

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

        if (!this.runningPackages[key]) {
          console.log('starting', key);

          // #DEBUG: temporarily disabled for dev
          // docker.ensureRunning({name: parsed.capability, version: parsed.version})

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
    const versions = Object.values(devices).map(device => device[capability]);
    versions.sort(versionCompare);
    return versions.slice(-1)[0];
  }


  /** define routes for this app */
  addRoutes() {
    this.router.get('/availablePackages', async (req, res) => {
      // TODO: do not hard-code store url (once #82)
      // TODO: add authentication headers (once #84), npm token as Bearer
      const selector = JSON.stringify({'versions.transitiverobotics': {$exists: 1}});
      const response = await fetch(`http://localhost:6000/-/custom/all?q=${selector}`);
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

      const fail = (error) => res.clearCookie('user')
          .status(401).json({error, ok: false});

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
      res.cookie(COOKIES.USER, account._id).json({status: 'ok'});
    });


    this.router.post('/logout', async (req, res) => {
      log.debug('logout', req.session.user);
      res.clearCookie(COOKIES.USER, req.session.user).json({status: 'ok'});
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

// to allow client-side rendering:
app.use('/*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html')));

/** catch-all to be safe */
process.on('uncaughtException', (err) => {
  console.error(`**** Caught exception: ${err}:`, err.stack);
});

/** ---------------------------------------------------------------------------
  MAIN
*/
Mongo.init(() => {
  robotAgent.addRoutes();
  server.listen(9000, () => {
    console.log(`Server started on port ${server.address().port}`);
  });
});
