/**
  Create a MQTT bridge
  - connect to upstream mqtt broker (using private certificates)
  - run a local mqtt broker, for packages
  - relay messages between the two in a package-aware way
*/

// ---------------------------------------------------------------------------
// Local MQTT broker (Aedes)

const aedes = require('aedes')();
const fs = require('fs');

const server = require('net').createServer(aedes.handle);
const PORT = 1883;

server.listen(PORT, () => {
  console.log('mqtt server bound');
});

aedes.on('publish', (packet, client) => {
  console.log(packet, client && client.id);
  if (client) {
    // relay packet to upstream, note that topic has already been forced into
    // client's namespace by authorizePublish function
    mqttClient.publish(packet.topic, packet.payload);
  }
});

aedes.authenticate = (client, username, password, callback) => {
  console.log('authenticate', client.id);
  // During ExecStartPre of each package, a random password is written
  // into it's private folder (only readable by that package and us). Using
  // this here for authentication.
  fs.readFile(`packages/${client.id}/password`, (err, correctPassword) =>
    callback(err,
      !err && (password.toString('ascii') == correctPassword.toString('ascii'))
    )
  );
};

aedes.authorizePublish = (client, packet, callback) => {
  // overwrite packet: force client to its namespace
  packet.topic = `${client.id}${packet.topic}`;
  callback(null)
}

aedes.authorizeSubscribe = (client, subscription, callback) => {
  // overwrite subscription: force client to its namespace
  subscription.topic = `${client.id}${subscription.topic}`;
  callback(null, subscription);
}

// setInterval(() =>
//   aedes.publish({
//       topic: 'presence',
//       payload: 'our heart beats for those that joined us'
//     }, () => {}),
//   5000);

// ---------------------------------------------------------------------------
// Upstream

const mqtt = require('mqtt');

const MQTT_HOST = 'mqtt://localhost'; // connect to mqtt server provided by robot-agent
// const MQTT_HOST = `mqtt://data.${process.env.TR_HOST}`;
const mqttClient = mqtt.connect(MQTT_HOST, {
  key: fs.readFileSync('certs/client.key'),
  cert: fs.readFileSync('certs/client.crt'),
  rejectUnauthorized: false,
});

mqttClient.on('connect', function(x) {
  console.log('connected to upstream mqtt broker', x);
});

mqttClient.on('error', console.log);
mqttClient.on('disconnect', console.log);

mqttClient.on('message', function (topic, message) {
  // message is Buffer
  console.log(`upstream mqtt, ${topic}: ${message.toString()}`);
});
