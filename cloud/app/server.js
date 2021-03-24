const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const jwt = require('jsonwebtoken');

const startMQTT = require('./mqtt.js').startMQTT;

const app = express();

// app.use(express.static(path.join(__dirname, 'build')));
// app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'dist')));

// app.get('/', function (req, res) {
//   res.sendFile(path.join(__dirname, 'build', 'my.html'));
// });
//
// app.listen(9000);



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

  clients.push(ws); // TODO: include permission, then in mqtt only relay messages
  // to relevant and authorized clients (for given topic)
});


/** authenticate the request to connect to our WS server */
const authenticate = (request, cb) => {
  const query = new URLSearchParams(request.url.replace(/^\//,''));
  console.log('authenticate', request.url, query);
  if (query && query.get('t')) {
    // TODO
    jwt.verify(query.get('t'), 'secret', cb);
  } else {
    cb('no jwt provided');
  }
};

server.on('upgrade', (request, socket, head) => {
  // This function is not defined on purpose. Implement it with your own logic.
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
