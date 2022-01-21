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

const { parseMQTTTopic, DataCache, mqttClearRetained, mqttParsePayload } =
  require('@transitive-robotics/utils/server');
const { handleAgentCommand, handleAgentData } = require('./commands');

const {startLocalMQTTBroker} = require('./localMQTT');

const data = new DataCache();

// prefix for all our mqtt topics, i.e., our namespace
const PREFIX = `/${process.env.TR_USERID}/${process.env.TR_DEVICEID}`;
const version = process.env.npm_package_version || '0.0.0';
const AGENT_PREFIX = `${PREFIX}/_robot-agent/${version}`;
const MQTT_HOST = `mqtts://data.${process.env.TR_HOST.split(':')[0]}`;

const subOptions = {rap: true};

// connect to upstream mqtt server
const mqttClient = mqtt.connect(MQTT_HOST, {
  key: fs.readFileSync('certs/client.key'),
  cert: fs.readFileSync('certs/client.crt'),
  rejectUnauthorized: false,
  protocolVersion: 5 // needed for the `rap` option, i.e., to get retain flags
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
        for (let topic in flatChanges) {
          mqttClient.publish(`${AGENT_PREFIX}${topic}`,
            JSON.stringify(flatChanges[topic]), {retain: true});
        }
      });

      staticInfo();

      heartbeat();
      setInterval(heartbeat, 60 * 1e3);

      mqttClient.on('message', (topic, payload, packet) => {
        console.log(`upstream mqtt, ${topic}: ${payload.toString()}`, packet.retain);
        // relay the upstream message to local

        const parsedTopic = parseMQTTTopic(topic);
        // TODO: ensure no one tries to publish a capability with this name -> registry
        if (parsedTopic.capability == '_robot-agent') {
          // it's for us, the robot-agent
          const json = mqttParsePayload(payload);
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
          // Not for us, relay it locally.
          /* We do NOT want to retain package-specific messages because we do not
            subscribe to them all the time and could be missing "clear" messages,
            which would cause discrepancies between the master data (in the cloud)
            and our local copy. Instead, we just un-subscribe and resubscribe to
          upstream and get retained messages from there when we connect. */
          packet.retain = false;
          localBroker && localBroker.publish(packet, () => {});
        }
      });

      const localBroker = startLocalMQTTBroker(mqttClient, PREFIX, AGENT_PREFIX);

      mqttClient.subscribe(`${AGENT_PREFIX}/desiredPackages/#`, subOptions);
      mqttClient.subscribe(`${AGENT_PREFIX}/_restart`, subOptions, console.log);
      mqttClient.subscribe(`${AGENT_PREFIX}/_restartPackage/#`, subOptions, console.log);
      mqttClient.subscribe(`${AGENT_PREFIX}/_getStatus/#`, subOptions, console.log);
      mqttClient.subscribe(`${AGENT_PREFIX}/_getLog`, subOptions, console.log);

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
