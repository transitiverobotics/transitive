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
  console.log(packet.topic, packet.payload.toString('utf-8'),
    client && client.id, packet.retain);
  if (client && mqttClient) {
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
    if (client && mqttClient) {
      mqttClient.subscribe(subscription.topic); // TODO: also relay QoS
    }
  });
});

aedes.on('unsubscribe', (subscriptions, client) => {
  subscriptions.forEach(subscription => {
    // Need to put subscription into namespace, because unsubscribe doesn't run
    // through authorizeSubscribe or some such, where the topic gets modified
    // for ubscribe and publish.
    // adjSubscription = `${PREFIX}/${client.id}/${subscription}`;
    console.log(client && client.id, 'is unsubscribing from', subscription);
    if (client && mqttClient) {
      mqttClient.unsubscribe(subscription, console.log); // TODO: also relay QoS
    }
  });

  // we need to manually send a system message to unsubscribe from modified namespace
  // $SYS/bf3d2769-a2c3-44f9-a091-bd2732730c76/new/unsubscribes \
  // {"clientId":"health-monitoring","subs":["/58Hwr3rZceBPwbYAc/98f52d3c67588c9e9afcff4f02df8485/health-monitoring/#"]}
  // DOESN'T WORK AS INTENDED, need to find another way
  // aedes.publish({
  //     topic: `$SYS/${aedes.id}/new/ubsubscribes`,
  //     payload: JSON.stringify({clientId: client.id, subs: [adjSubscription]})
  //   }, () => {});

  // #HERE: maybe just patch aedes to add something akin to authorizeUnsubscribe
  // i.e., allow changing topic on unsubscribe
});


// ------------------------
// Security

aedes.authenticate = (client, username, password, callback) => {
  console.log('authenticate', client.id);
  // During ExecStartPre of each package, a random password is written
  // into it's private folder (only readable by that package and us). Using
  // this here for authentication.
  fs.readFile(`packages/${client.id}/password`, (err, correctPassword) => {
    callback(err, !err && correctPassword && password
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

aedes.preUnsubscribe = (client, packet, callback) => {
  // overwrite unsubscriptions: force client to its namespace
  console.log('preUnsubscribe');
  for (let i in packet.unsubscriptions) {
    packet.unsubscriptions[i] = `${PREFIX}/${client.id}/${packet.unsubscriptions[i]}`;
  }
  callback(client, packet);
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
