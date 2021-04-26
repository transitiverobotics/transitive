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
const { parseMQTTTopic, DataCache, pathToTopic, mqttClearRetained } =
  require('@transitive-robotics/utils/server');
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
    console.log(client && client.id, 'is unsubscribing from', subscription);
    if (client && mqttClient) {
      mqttClient.unsubscribe(subscription, console.log); // TODO: also relay QoS
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

/** using the special function we patched into aedes to also
  overwrite topic on unsubscribe, forcing client to its namespace */
aedes.preUnsubscribe = (client, packet, callback) => {
  console.log('preUnsubscribe');
  for (let i in packet.unsubscriptions) {
    packet.unsubscriptions[i] = `${PREFIX}/${client.id}/${packet.unsubscriptions[i]}`;
  }
  callback(client, packet);
}

// ---------------------------------------------------------------------------
// Upstream

const mqtt = require('mqtt');

const data = new DataCache();

const AGENT_PREFIX = `${PREFIX}/_robot-agent`;

// connect to upstream mqtt server
// const MQTT_HOST = 'mqtts://localhost';
const MQTT_HOST = `mqtts://data.${process.env.TR_HOST.split(':')[0]}`;
const mqttClient = mqtt.connect(MQTT_HOST, {
  key: fs.readFileSync('certs/client.key'),
  cert: fs.readFileSync('certs/client.crt'),
  rejectUnauthorized: false,
});

mqttClient.on('error', console.log);
mqttClient.on('disconnect', console.log);

/** TODO: break this function down into pieces */
mqttClient.on('connect', function(connackPacket) {
  console.log('connected to upstream mqtt broker');

  // TODO: this should not execute more than once, but it does if:
  //  the portal is not running, and
  //  this agent connects to the mqtt broker (which is not getting a response
  //    from the portal)

  // TODO: somehow make this part of DataCache and/or a stronger notion of a
  // "publication", of which this may be a "clear on start" functionality
  mqttClearRetained(mqttClient,
    [`${AGENT_PREFIX}/info`, `${AGENT_PREFIX}/status`], () => {

    console.log('subscribing to robot-agent commands');
    mqttClient.subscribe(`${AGENT_PREFIX}/desiredPackages/#`, console.log);

    data.subscribe(flatChanges => {
      for (let key in flatChanges) {
        mqttClient.publish(`${AGENT_PREFIX}/${key.replace(/\./g, '/')}`,
          JSON.stringify(flatChanges[key]), {retain: true});
      }
    });

    data.update(['info'], { os: {
      hostname: os.hostname(),
      release: os.release(),
      version: os.version(),
      networkInterfaces: os.networkInterfaces()
    }});

    heartbeat();
    setInterval(heartbeat, 60 * 1e3);

    mqttClient.on('message', (topic, payload) => {
      console.log(`upstream mqtt, ${topic}: ${payload.toString()}`);
      // relay the upstream message to local

      const parsedTopic = parseMQTTTopic(topic);
      // TODO: ensure no one tries to publish a capability with this name
      if (parsedTopic.capability == '_robot-agent') {
        // it's for us, the robot-agent
        handleAgentCommand(parsedTopic.sub, JSON.parse(payload.toString('utf-8')));
      } else {
        // not for us, relay it locally
        aedes.publish({topic, payload}, () => {});
      }
    });
  });
});


const heartbeat = () => {
  data.update(['status'], {
    heartbeat: new Date(),
    // loadavg: os.loadavg(),
    // freemem: os.freemem()
  });
};
