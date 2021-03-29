const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const jwt = require('jsonwebtoken');

// const { db, init, close } = require('./mongo.js');
const Mongo = require('./mongo.js');

const { startMQTT, sendRetained } = require('./mqtt.js');

const app = express();

// app.use(express.static(path.join(__dirname, 'build')));
// app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'dist')));

// app.get('/', function (req, res) {
//   res.sendFile(path.join(__dirname, 'build', 'my.html'));
// });
//
// app.listen(9000);
// init();
Mongo.init();

//initialize a simple http server
const server = http.createServer(app);

//initialize the WebSocket server instance
const wss = new WebSocket.Server({ noServer: true });

const clients = [];

wss.on('connection', (ws, permission) => {
  console.log('client connected', permission);

  //connection is up, let's add a simple simple event
  ws.on('message', (message) => {
    //log the received message and send it back to the client
    console.log('received: %s', message);
    // ws.send(`Hello, you sent -> ${message}`);
  });

  //send immediatly a feedback to the incoming connection
  // ws.send(JSON.stringify({msg: 'Hi there, I am a WebSocket server'}));

  clients.push({ws, permission});

  // given all relevant retained message to this client
  sendRetained({ws, permission});  
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
        jwt.verify(token, doc.jwt_secret, cbWithMessage);
      }
    }
  });
};


server.on('upgrade', (request, socket, head) => {

  authenticate(request, (err, permission) => {
    if (err || !permission) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, permission);
    });
  });
});


server.listen(9000, () => {
  console.log(`Server started on port ${server.address().port} :)`);
});

startMQTT(clients);
