'use strict';

const mqtt = require('mqtt');
const { MqttSync, getLogger, getPackageVersionNamespace } =
  require('@transitive-sdk/utils');

const log = getLogger('main');
log.setLevel('debug');

// Read config.versionNamespace from parent package.json to determine which
// version namespace to use: major, minor, or patch (default).
const version = getPackageVersionNamespace();
log.debug({version});

const MQTT_HOST = 'mqtt://localhost'; // the mqtt server provided by robot-agent
const mqttClient  = mqtt.connect(MQTT_HOST, {
  clientId: `${process.env.npm_package_name}/${version}`,
  username: JSON.stringify({
    version: process.env.npm_package_version,
  }),
  password: process.env.PASSWORD, // is set in startPackage.sh
});

// ------------------------------------------------------------

mqttClient.once('connect', (connack) => {
  log.debug('connected to mqtt broker', connack);

  const mqttSync = new MqttSync({mqttClient, ignoreRetain: true,
    // Slices off the first N fields of the topic, i.e., our client NS
    // "/org/device/@scope/name/version":
    sliceTopic: 5
  });

  // subscribe to changes from cloud
  mqttSync.subscribe('/cloud');
  // publish our own changes in a new path
  mqttSync.publish('/device');

  // log all updates from the cloud to the console
  mqttSync.data.subscribePathFlat(`/cloud`, (value, key, matched) => {
    log.info('cloud:', key, value);
  });

  /** Flip flop between flat and structured publication of an object.
  This demonstrates the two different formats for data-fields.
  */
  const flipFlop = () => {
    // flat:
    mqttSync.data.update(`/device/time`, String(new Date()));
    setTimeout(() => {
        // structured:
        mqttSync.data.update(`/device`, {time: String(new Date())}),
        setTimeout(flipFlop, 2000);
      },
      2000);
  };

  // start flip-flopping
  flipFlop();

  // for debugging: a handy command palette when running in a terminal
  process.stdin.isTTY && process.stdin.on('data', (buffer) => {
    const key = buffer.toString();
    switch (key[0]) {

      case 'p': // print current data
      log.info(JSON.stringify(mqttSync.data.get(), true, 2));
      log.info(mqttSync.publishedMessages);
      break;

      default:
    }
  });
});

mqttClient.on('error', console.log);
mqttClient.on('disconnect', console.log);