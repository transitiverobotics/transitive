const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const jwt = require('jsonwebtoken');

const Mongo = require('./mongo');
const { MQTTHandler } = require('./mqtt');
const Capability = require('./caps/capability');
const HealthMonitoring = require('./caps/health_monitoring');

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
  ws.on('message', (message) => {
    console.log('received: %s', message);
  });

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
          if (payload.validity &&
            (payload.iat + payload.validity) * 1e3 > Date.now()) {
            cbWithMessage(null, payload);
          } else {
            cbWithMessage(`JWT is expired ${JSON.stringify(payload)}`);
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
    console.log('_robotAgent', packet.topic);
  }
};

Mongo.init(() => {
  new MQTTHandler(mqtt => {
    Capability.init(mqtt);
    // everything is ready, start listening for clients
    server.listen(9000, () => {
      console.log(`Server started on port ${server.address().port} :)`);
      // Here: start capabilities ...

      const hm = new HealthMonitoring();
      const robotAgent = new _robotAgent();
    });
  });
});


/** catch-all to be safe */
process.on('uncaughtException', (err) => {
  console.error(`**** Caught exception: ${err}:`, err.stack);
});
