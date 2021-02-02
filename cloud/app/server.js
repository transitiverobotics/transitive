const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');


const app = express();

// app.use(express.static(path.join(__dirname, 'build')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'dist')));

// app.get('/', function (req, res) {
//   res.sendFile(path.join(__dirname, 'build', 'my.html'));
// });
//
// app.listen(9000);



//initialize a simple http server
const server = http.createServer(app);

//initialize the WebSocket server instance
const wss = new WebSocket.Server({ server });

const clients = [];

wss.on('connection', (ws) => {

  //connection is up, let's add a simple simple event
  ws.on('message', (message) => {
    //log the received message and send it back to the client
    console.log('received: %s', message);
    // ws.send(`Hello, you sent -> ${message}`);
  });

  //send immediatly a feedback to the incoming connection
  ws.send(JSON.stringify({msg: 'Hi there, I am a WebSocket server'}));

  clients.push(ws);
});

const update = () => {
  const cpu = process.cpuUsage();
  clients.forEach(ws => {
    ws.send(JSON.stringify(cpu));
  });
};

server.listen(9000, () => {
  console.log(`Server started on port ${server.address().port} :)`);

  setInterval(update, 1000);
});
