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
const os = require('os');
const utils = require('./utils');
const { handleAgentCommand } = require('./commands');

const server = require('net').createServer(aedes.handle);
const PORT = 1883;

// prefix for all our mqtt topics, i.e., our namespace
const PREFIX = `/${process.env.TR_USERID}/${process.env.TR_DEVICEID}`;
console.log('PREFIX =', PREFIX);

server.listen(PORT, () => {
  console.log('mqtt server bound');
});

aedes.on('publish', (packet, client) => {
  console.log(packet, client && client.id);
  if (client) {
    // relay packet to upstream, note that topic has already been forced into
    // client's namespace by authorizePublish function
    mqttClient.publish(packet.topic, packet.payload, {
      retain: packet.retain,
      qos: packet.qos
    });
  }
});

aedes.on('subscribe', (subscriptions, client) => {
  subscriptions.forEach(subscription => {
    console.log(client && client.id, 'wants', subscription);
    if (client) {
      mqttClient.subscribe(subscription.topic); // TODO: also relay QoS
    }
  });
});


// ------------------------
// Security

aedes.authenticate = (client, username, password, callback) => {
  console.log('authenticate', client.id);
  // During ExecStartPre of each package, a random password is written
  // into it's private folder (only readable by that package and us). Using
  // this here for authentication.
  fs.readFile(`packages/${client.id}/password`, (err, correctPassword) => {
    callback(err, !err && correctPassword
        && (password.toString('ascii') == correctPassword.toString('ascii'))
    )
  });
};

aedes.authorizePublish = (client, packet, callback) => {
  // overwrite packet: force client to its namespace
  packet.topic = `${PREFIX}/${client.id}/${packet.topic}`;
  callback(null)
}

aedes.authorizeSubscribe = (client, subscription, callback) => {
  // overwrite subscription: force client to its namespace
  subscription.topic = `${PREFIX}/${client.id}/${subscription.topic}`;
  callback(null, subscription);
}

// ---------------------------------------------------------------------------
// Upstream

const mqtt = require('mqtt');

// connect to upstream mqtt server
// const MQTT_HOST = 'mqtts://localhost';
const MQTT_HOST = `mqtts://data.${process.env.TR_HOST.split(':')[0]}`;
const mqttClient = mqtt.connect(MQTT_HOST, {
  key: fs.readFileSync('certs/client.key'),
  cert: fs.readFileSync('certs/client.crt'),
  rejectUnauthorized: false,
});

mqttClient.on('connect', function(x) {
  console.log('connected to upstream mqtt broker', x);
  console.log('subscribing to robot-agent commands');
  mqttClient.subscribe(`${PREFIX}/_robot-agent/desiredPackages`, console.log);

  mqttClient.publish(`${PREFIX}/_robot-agent/info`, JSON.stringify({
    os: {
      hostname: os.hostname(),
      release: os.release(),
      version: os.version(),
      networkInterfaces: os.networkInterfaces()
    }
  }), {retain: true});

  heartbeat();
  setInterval(heartbeat, 60 * 1e3);
});

mqttClient.on('error', console.log);
mqttClient.on('disconnect', console.log);

mqttClient.on('message', (topic, payload) => {
  console.log(`upstream mqtt, ${topic}: ${payload.toString()}`);
  // relay the upstream message to local

  const parsedTopic = utils.parseMQTTTopic(topic);
  // TODO: ensure no one tries to publish a capability with this name
  if (parsedTopic.capability == '_robot-agent') {
    // it's for us, the robot-agent
    handleAgentCommand(parsedTopic.sub, JSON.parse(payload.toString('ascii')));
  } else {
    // not for us, relay it locally
    aedes.publish({topic, payload}, () => {});
  }
});

const heartbeat = () => {
  mqttClient.publish(`${PREFIX}/_robot-agent/status`, JSON.stringify({
    heartbeat: new Date(),
    loadavg: os.loadavg(),
    freemem: os.freemem()
  }), {retain: true});
};
