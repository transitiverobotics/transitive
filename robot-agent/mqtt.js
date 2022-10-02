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
const assert = require('assert');
const mqtt = require('mqtt');
const exec = require('child_process').exec;

const { parseMQTTTopic, mqttClearRetained, mqttParsePayload, MqttSync, getLogger,
loglevel } = require('@transitive-sdk/utils');
const { handleAgentCommand } = require('./commands');
const { ensureDesiredPackages } = require('./utils');

const {startLocalMQTTBroker} = require('./localMQTT');
const log = getLogger('mqtt.js');
log.setLevel('info');

// TODO: get this from utils
const HEARTBEAT_TOPIC = '$SYS/broker/uptime';

let data;

// prefix for all our mqtt topics, i.e., our namespace
const PREFIX = `/${process.env.TR_USERID}/${process.env.TR_DEVICEID}`;
const version = process.env.npm_package_version;
const AGENT_PREFIX = `${PREFIX}/@transitive-robotics/_robot-agent/${version}`;
const MQTT_HOST = `mqtts://data.${process.env.TR_HOST.split(':')[0]}`;
log.debug('using', {AGENT_PREFIX, MQTT_HOST});
assert(version, 'env var npm_package_version is required');

const subOptions = {rap: true};

// connect to upstream mqtt server
const mqttClient = mqtt.connect(MQTT_HOST, {
  key: fs.readFileSync('certs/client.key'),
  cert: fs.readFileSync('certs/client.crt'),
  rejectUnauthorized: false,
  protocolVersion: 5 // needed for the `rap` option, i.e., to get retain flags
});

mqttClient.on('error', (...args) => log.warn('mqtt error', ...args));
mqttClient.on('disconnect', (...args) => log.warn('mqtt disconnect', ...args));

let initialized = false;
let mqttSync;
mqttClient.on('connect', function(connackPacket) {
  log.info(`${initialized ? 're-' : ''}connected to upstream mqtt broker`);

  if (!mqttSync) {
    mqttSync = new MqttSync({mqttClient,
      migrate: [{
        topic: `${AGENT_PREFIX}/desiredPackages`,
        newVersion: version
      }],
      onReady: () => {
        log.info('migration complete');
        mqttSync.subscribe(`${AGENT_PREFIX}/desiredPackages`, (err) => {
          if (err) {
            log.warn('Failed to subscribe to desiredPackages:', err,
              'Not changing installed packages for now.', new Date());
            return;
          }

          log.info('waiting for heartbeat from upstream');
          mqttSync.waitForHeartbeatOnce(() => {
            log.info('got heartbeat');
            ensureDesiredPackages(
              mqttSync.data.getByTopic(`${AGENT_PREFIX}/desiredPackages`));
            mqttSync.data.subscribePath(`${AGENT_PREFIX}/desiredPackages`,
              (value, key) => ensureDesiredPackages(value));
          });
        });
      }
    });
  }

  // TODO: somehow make this part of DataCache and/or a stronger notion of a
  // "publication", of which this may be a "clear on start" functionality
  const allVersionsPrefix = `${PREFIX}/@transitive-robotics/_robot-agent`;
  !initialized && mqttClearRetained(mqttClient,
    [`${allVersionsPrefix}/+/info`, `${allVersionsPrefix}/+/status`], () => {

      data = mqttSync.data;
      mqttSync.publish(`${AGENT_PREFIX}/info`);
      mqttSync.publish(`${AGENT_PREFIX}/status`);

      staticInfo();

      heartbeat();
      setInterval(heartbeat, 60 * 1e3);

      mqttClient.on('message', (topic, payload, packet) => {
        log.debug(`upstream mqtt, ${topic}: ${payload.toString()}`, packet.retain);
        // relay the upstream message to local
        if (topic == HEARTBEAT_TOPIC) {
          // relay heartbeat locally:
          localBroker && localBroker.publish(packet, () => {});
        } else {

          const parsedTopic = parseMQTTTopic(topic);
          // TODO: ensure no one tries to publish a capability with this name -> registry
          if (parsedTopic.capability == '@transitive-robotics/_robot-agent') {
            // it's for us, the robot-agent
            const json = mqttParsePayload(payload);

            const {command, rest} = (// old format (start with _):
              parsedTopic.sub[0]?.[0] == '_' &&
                { command: parsedTopic.sub[0].slice(1),
                  rest: parsedTopic.sub.slice(1)
                }) ||
              // new commands (under commands/):
              (parsedTopic.sub[0] == 'commands' &&
                { command: parsedTopic.sub[1],
                  rest: parsedTopic.sub.slice(2)
                });
            if (command) {
              handleAgentCommand(command, rest, json, (response) => response &&
                mqttClient.publish(
                  `${AGENT_PREFIX}/$response/${parsedTopic.sub.join('/')}`,
                  JSON.stringify(response)));
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
        }
      });

      const localBroker = startLocalMQTTBroker(mqttClient, PREFIX, AGENT_PREFIX);

      mqttClient.subscribe(`${AGENT_PREFIX}/_restart`, subOptions, log.debug);
      mqttClient.subscribe(`${AGENT_PREFIX}/_restartPackage/#`, subOptions, log.debug);
      mqttClient.subscribe(`${AGENT_PREFIX}/_getStatus/#`, subOptions, log.debug);
      mqttClient.subscribe(`${AGENT_PREFIX}/_getLog`, subOptions, log.debug);
      // mqttClient.subscribe(HEARTBEAT_TOPIC, {rap: true}, log.debug);
      // new commands should go under `commands/`
      log.info('subscribing to robot-agent commands');
      mqttClient.subscribe(`${AGENT_PREFIX}/commands/#`, subOptions, log.debug);

      initialized = true;
    });
});

/** publish static info about this machine */
const staticInfo = () => {
  const info = {os: {
    hostname: os.hostname(),
    release: os.release(),
    version: os.version(),
    networkInterfaces: os.networkInterfaces(),
  }};

  process.env.TR_LABELS && (info.labels = process.env.TR_LABELS.split(','));

  exec('lsb_release -a', (err, stdout, stderr) => {
    !err && (info.os.lsb_release = stdout.trim());
    exec('dpkg --print-architecture', (err, stdout, stderr) => {
      !err && (info.os.dpkgArch = stdout.trim());
      data.update(`${AGENT_PREFIX}/info`, info);
    });
  });
};

const heartbeat = () => {
  data.update(`${AGENT_PREFIX}/status/heartbeat`, new Date());
};
