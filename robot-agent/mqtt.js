/**
  Upstream part of MQTT bridge
    - connect to upstream mqtt broker (using private certificates)

  - relay messages between the two in a package-aware way

    The order in which we do things is important:
    - connect upstream
    - clear upstream
    - register upstream listener
    - create local (aedes)
    - subscribe to upstream topics

  For local part see localMQTT.js.
*/


// ---------------------------------------------------------------------------
// Upstream

const fs = require('fs');
const os = require('os');
const mqtt = require('mqtt');
const exec = require('child_process').exec;

const { parseMQTTTopic, DataCache, mqttClearRetained }
  = require('@transitive-robotics/utils/server');
const { handleAgentCommand, handleAgentData, ensureDesiredPackages }
  = require('./commands');

const {startLocalMQTTBroker} = require('./localMQTT');

const data = new DataCache();

// prefix for all our mqtt topics, i.e., our namespace
const PREFIX = `/${process.env.TR_USERID}/${process.env.TR_DEVICEID}`;
const AGENT_PREFIX = `${PREFIX}/_robot-agent`;
const MQTT_HOST = `mqtts://data.${process.env.TR_HOST.split(':')[0]}`;

// connect to upstream mqtt server
const mqttClient = mqtt.connect(MQTT_HOST, {
  key: fs.readFileSync('certs/client.key'),
  cert: fs.readFileSync('certs/client.crt'),
  rejectUnauthorized: false,
});

mqttClient.on('error', console.log);
mqttClient.on('disconnect', console.log);

let initialized = false;
mqttClient.on('connect', function(connackPacket) {
  console.log(`${initialized ? 're-' : ''}connected to upstream mqtt broker`);

  // TODO: this should not execute more than once, but it does if:
  //  the portal is not running, and
  //  this agent connects to the mqtt broker (which is not getting a response
  //    from the portal)

  // TODO: somehow make this part of DataCache and/or a stronger notion of a
  // "publication", of which this may be a "clear on start" functionality
  !initialized && mqttClearRetained(mqttClient,
    [`${AGENT_PREFIX}/info`, `${AGENT_PREFIX}/status`], () => {

      console.log('subscribing to robot-agent commands');

      data.subscribe(flatChanges => {
        for (let key in flatChanges) {
          mqttClient.publish(`${AGENT_PREFIX}/${key.replace(/\./g, '/')}`,
            JSON.stringify(flatChanges[key]), {retain: true});
        }
      });

      staticInfo();

      heartbeat();
      setInterval(heartbeat, 60 * 1e3);

      mqttClient.on('message', (topic, payload, packet) => {
        console.log(`upstream mqtt, ${topic}: ${payload.toString()}, ${packet.retain}`);
        // relay the upstream message to local

        const parsedTopic = parseMQTTTopic(topic);
        // TODO: ensure no one tries to publish a capability with this name
        if (parsedTopic.capability == '_robot-agent') {
          // it's for us, the robot-agent
          const json = JSON.parse(payload.toString('utf-8'));
          if (parsedTopic.sub[0] && parsedTopic.sub[0][0] == '_') {
            // commands start with `_`
            handleAgentCommand(parsedTopic.sub, json, (response) => response &&
              mqttClient.publish(`${AGENT_PREFIX}/$response/${parsedTopic.sub}`,
                JSON.stringify(response)));
          } else {
            // everything else is data
            handleAgentData(parsedTopic.sub, json);
          }
        } else {
          // not for us, relay it locally
          // aedes.publish({topic, payload}, () => {});
          localBroker && localBroker.publish(packet, () => {});
        }
      });

      const localBroker = startLocalMQTTBroker(mqttClient, PREFIX);

      mqttClient.subscribe(`${AGENT_PREFIX}/desiredPackages/#`, () => {
        // 5 seconds after start: check that desired packages are installed
        setTimeout(ensureDesiredPackages, 5000);
      });
      mqttClient.subscribe(`${AGENT_PREFIX}/_restart`, console.log);
      mqttClient.subscribe(`${AGENT_PREFIX}/_restartPackage/#`, console.log);
      mqttClient.subscribe(`${AGENT_PREFIX}/_getStatus/#`, console.log);
      mqttClient.subscribe(`${AGENT_PREFIX}/_getLog`, console.log);

      initialized = true;
    });
});

/** publish static info about this machine */
const staticInfo = () => {
  data.update(['info'], { os: {
    hostname: os.hostname(),
    release: os.release(),
    version: os.version(),
    networkInterfaces: os.networkInterfaces()
  }});

  exec('lsb_release -a', (err, stdout, stderr) =>
    !err && data.update(['info', 'os'], { lsb_release: stdout.trim() }));
  exec('dpkg --print-architecture', (err, stdout, stderr) =>
    !err && data.update(['info', 'os'], { dpkgArch: stdout.trim() }));
};

const heartbeat = () => {
  data.update(['status'], {
    heartbeat: new Date(),
    // loadavg: os.loadavg(),
    // freemem: os.freemem()
  });
};
