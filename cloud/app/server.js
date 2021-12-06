const express = require('express');
const path = require('path');
// const WebSocket = require('ws');
const http = require('http');
const jwt = require('jsonwebtoken');
const assert = require('assert');

const Mongo = require('@transitive-robotics/utils/mongo');
const { parseMQTTTopic, decodeJWT } = require('@transitive-robotics/utils/server');
const { Capability } = require('@transitive-robotics/utils/cloud');

const { MQTTHandler } = require('./mqtt');
// const Capability = require('./caps/capability');
const HealthMonitoring = require('./caps/health_monitoring');
const RemoteAccess = require('./caps/remote_access');
const VideoStreaming = require('./caps/video_streaming');
const WebRTCVideo = require('./caps/webrtc_video');
const RemoteTeleop = require('./caps/remote_teleop');

const docker = require('./docker');


// ----------------------------------------------------------------------

const app = express();
// app.use(express.static(path.join(__dirname, 'build')));
// app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.json());

const server = http.createServer(app);

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
  Authentication for MQTT Websockets
*/

/** authenticate the username based on the JWT given as password */
app.post('/auth/user', async (req, res) => {
  console.log('/auth/user', req.body);
  //   clientid: 'qEmYn5tibovKgGvSm',
  //   password: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkZXZpY2UiOiJHYkdhMnlncXF6IiwiY2FwYWJpbGl0eSI6ImhlYWx0aC1tb25pdG9yaW5nIiwidXNlcklkIjoicG9ydGFsVXNlci1xRW1ZbjV0aWJvdktnR3ZTbSIsInZhbGlkaXR5Ijo0MzIwMCwiaWF0IjoxNjM3MDk1Nzg5fQ.H6-3I5z-BwFeUJ3A-j1_2NE9YFa7AGAz5nTWkMPuY9k',
  //   username: '{id, payload: {device, capability, userId, validity}}'

  const users = Mongo.db.collection('users');
  const devices = Mongo.db.collection('devices');

  const token = req.body.password;
  const payload = decodeJWT(token);
  const parsedUsername = JSON.parse(req.body.username);
  console.log('  ', payload, parsedUsername);

  try {
    // First verify that the user's signed JWT has the same payload as username.
    // This is needed because downstream decision, e.g., in ACL, will be based
    // on this verified username.
    assert.deepEqual(payload, parsedUsername.payload);

    const user = await users.findOne({_id: parsedUsername.id});
    console.log(user);
    if (!user) {
      res.status(401).send(
        'no such user, please verify the id provided to the web component');
      return;
    }
    if (!user.jwt_secret) {
      res.status(401).send('user has no jwt secret yet, please visit the portal');
      return;
    }

    await jwt.verify(token, user.jwt_secret);
    console.log('verified token');

    if (!payload.validity || (payload.iat + payload.validity) * 1e3 < Date.now()) {
      // The token is expired
      res.status(401).send(`JWT is expired ${JSON.stringify(payload)}`);
      return;
    }

    res.send('ok');
  } catch (e) {
    res.status(401).send(e);
  }
});

app.post('/auth/acl', (req, res) => {
  console.log('/auth/acl', req.headers, req.body);
  /* {
    acc: 1,
    clientid: 'mqttjs_c799fa50',
    topic: '/qEmYn5tibovKgGvSm/ZXyqpabPL7/health-monitoring/diagnostics/disk partition: root/values/percent',
    username: '{"id":"qEmYn5tibovKgGvSm","payload":{"device":"GbGa2ygqqz","capability":"health-monitoring","userId":"portalUser-qEmYn5tibovKgGvSm","validity":43200,"iat":1637107056}}'
  }*/

  const {id, payload} = JSON.parse(req.body.username);
  const parsedTopic = parseMQTTTopic(req.body.topic);
  if (id == parsedTopic.organization &&
    payload.device == parsedTopic.device &&
    payload.capability == parsedTopic.capability &&
    payload.validity && (payload.iat + payload.validity) * 1e3 > Date.now()) {

    res.send('ok');
  } else {
    res.status(401).end('not authorized for topic or token expired');
  }
});


Mongo.init(() => {
  server.listen(9000, () => {
    console.log(`Server started on port ${server.address().port}`);
  });
});



/* -------------------------------------------------------------------------
  Cloud Agent
*/


/** dummy capability just to forward general info about devices */
class _robotAgent extends Capability {

  runningPackages = {};

  constructor() {
    super(() => {
      // Subscribe to all messages and make sure that the named capabilities are
      // running.
      this.mqtt.subscribe(`/+/+/+/#`, (packet) => {
        const parsed = parseMQTTTopic(packet.topic);
        if (!this.runningPackages[parsed.capability]) {
          console.log('starting', parsed.capability);

          docker.ensureRunning({name: parsed.capability, version: 'latest'})
          // TODO: extend this (and change namespaces) to include version of pkg

          this.runningPackages[parsed.capability] = new Date();
        }
      });
    });
  }

  // onMessage(packet) {
  //   // console.log('_robotAgent', packet.topic);
  //   // listen to "package running" topics and when found, make sure
  //   // the required version of that package is installed and loaded
  //   const {sub, device} = parseMQTTTopic(packet.topic);
  //   if (sub[0] == 'status' && sub[1] == 'runningPackages') {
  //     const packageName = sub[2];
  //     const info = packet.payload && JSON.parse(packet.payload.toString());
  //     console.log('start', packageName, info);
  //     // #HERE: now make sure it's running, and start it in a docker container
  //     // if not
  //   }
  // }
};

new _robotAgent();

// Mongo.init(() => {
//   new MQTTHandler(mqtt => {
//     server.listen(9000, () => {
//       console.log(`Server started on port ${server.address().port}`);
//
//       Capability.init(mqtt);
//
//       // Start capabilities
//       const robotAgent = new _robotAgent();
//       // const hm = new HealthMonitoring(); // -> moved to cap
//       const remoteAccess = new RemoteAccess({
//         dbCollection: Mongo.db.collection('devices')
//       });
//       const videoStreaming = new VideoStreaming({
//         dbCollection: Mongo.db.collection('devices')
//       });
//       const webRTCVideo = new WebRTCVideo();
//       const remoteTeleop = new RemoteTeleop();
//     });
//   });
// });


/** catch-all to be safe */
process.on('uncaughtException', (err) => {
  console.error(`**** Caught exception: ${err}:`, err.stack);
});
