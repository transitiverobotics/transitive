const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const jwt = require('jsonwebtoken');

const Mongo = require('@transitive-robotics/utils/mongo');
const { MQTTHandler } = require('./mqtt');
const Capability = require('./caps/capability');
const HealthMonitoring = require('./caps/health_monitoring');
const RemoteAccess = require('./caps/remote_access');
const VideoStreaming = require('./caps/video_streaming');
const WebRTCVideo = require('./caps/webrtc_video');
const RemoteTeleop = require('./caps/remote_teleop');

// ----------------------------------------------------------------------

const app = express();
// app.use(express.static(path.join(__dirname, 'build')));
// app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'dist')));

const server = http.createServer(app);

const clients = [];

const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws, permission) => {
  // console.log('client connected', permission);
  const cap = Capability.lookup(permission.capability);
  if (cap) {
    cap.addClient({ws, permission});
  } else {
    console.warn(`A ws client connected for an unknown capability
      ${permission.capability}`);
  }
});


/** authenticate the request to connect to our WS server */
const authenticate = (request, cb) => {
  const query = new URLSearchParams(request.url.replace(/^\//,''));
  console.log('authenticate', request.url, query);

  const token = query.get('t');
  const transitiveUserId = query.get('id');

  const cbWithMessage = (err, result) => {
    err && console.log(err);
    result && (result.transitiveUserId = transitiveUserId);
    cb(err, result);
  };

  if (!token) {
    cbWithMessage('no jwt provided');
    return;
  }
  if (!transitiveUserId) {
    cbWithMessage('no id provided');
    return;
  }

  const users = Mongo.db.collection('users');
  const devices = Mongo.db.collection('devices');

  users.findOne({_id: transitiveUserId}, (err, doc) => {
    if (err || !doc) {
      cbWithMessage(
        'no such user, please verify the id provided to the web component')
    } else {
      console.log('from db:', err, doc);
      if (!doc.jwt_secret) {
        cbWithMessage('user has no jwt secret yet, please visit the portal')
      } else {
        jwt.verify(token, doc.jwt_secret, (err, payload) => {
          if (err) {
            cbWithMessage('Unable to verify JWT token');
          } else {
            if (payload.validity &&
              (payload.iat + payload.validity) * 1e3 > Date.now()) {
              // The token is valid.
              if (!payload.device && payload.hostname) {
                // No device id provided, look it up from hostname
                devices.findOne({
                    owner: transitiveUserId,
                    'info.os.hostname': payload.hostname
                  }, (err, doc) => {
                    if (err) {
                      console.warn(`Unable to find device of '${transitiveUserId}' by hostname '${payload.hostname}'`);
                    } else {
                      payload.device = doc._id;
                      cbWithMessage(null, payload);
                    }
                  });
              } else {
                cbWithMessage(null, payload);
              }
            } else {
              cbWithMessage(`JWT is expired ${JSON.stringify(payload)}`);
            }
          }
        });
      }
    }
  });
};


server.on('upgrade', (request, socket, head) => {
  authenticate(request, (err, permission) => {
    if (err || !permission) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    } else {
      wss.handleUpgrade(request, socket, head,
        ws => wss.emit('connection', ws, permission));
    }
  });
});

/** dummy capability just to forward general info about devices */
class _robotAgent extends Capability {
  onMessage(packet) {
    // console.log('_robotAgent', packet.topic);
  }
};

Mongo.init(() => {
  new MQTTHandler(mqtt => {
    Capability.init(mqtt);
    // everything is ready, start listening for clients
    server.listen(9000, () => {
      console.log(`Server started on port ${server.address().port} :)`);

      // Start capabilities
      const robotAgent = new _robotAgent();
      const hm = new HealthMonitoring();
      const remoteAccess = new RemoteAccess({
          dbCollection: Mongo.db.collection('devices')
        });
      const videoStreaming = new VideoStreaming({
        dbCollection: Mongo.db.collection('devices')
      });
      const webRTCVideo = new WebRTCVideo();
      const remoteTeleop = new RemoteTeleop();
    });
  });
});


/** catch-all to be safe */
process.on('uncaughtException', (err) => {
  console.error(`**** Caught exception: ${err}:`, err.stack);
});
