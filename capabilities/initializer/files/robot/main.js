'use strict';

const mqtt = require('mqtt');
const { MqttSync, getLogger, getPackageVersionNamespace } =
  require('@transitive-sdk/utils');
const _ = require('lodash');

// If you want to use ROS (1 or 2) we recommend you use our utility library
// by runnign `npm i @transitive-sdk/utils-ros` and uncommenting the following
// const { getForVersion } = require('@transitive-sdk/utils-ros');

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

mqttClient.on('error', console.log);
mqttClient.on('disconnect', console.log);

// ------------------------------------------------------------

let mqttSync;
mqttClient.once('connect', (connack) => {
  log.debug('connected to mqtt broker', connack);

  mqttSync = new MqttSync({mqttClient, ignoreRetain: true,
    // Slices off the first N fields of the topic, i.e., our client NS
    // "/org/device/@scope/name/version":
    sliceTopic: 5
  });

  // subscribe to changes from cloud:
  mqttSync.subscribe('/cloud');
  // publish our own changes in the /device path:
  mqttSync.publish('/device');
  // optional: throttle our updates to the cloud
  // mqttSync.setThrottle(100);

  // log all updates from the cloud to the console
  mqttSync.data.subscribePathFlat(`/cloud`, (value, key, matched) => {
    log.info('cloud:', key, value);
  });

  // example of repeated edits to the shared data
  setInterval(() =>
    mqttSync.data.update(`/device/time`, String(new Date())), 1000);

  // example of how to relay topics from ROS cloud + web via MQTTSync
  // startROS();

  // totally optional: a handy tool for runtime control from the console
  ttyListener();
});


/** A mini example of how to connect to ROS1, subscribe to a topic and share
 * the messages with other MQTTSync participants (usually cloud + web).
 * Run a `roscore` and `rosrun turtlesim turtlesim_node` first.
 */
const startROS = async () => {
  const ros = getForVersion(1);
  await ros.init();

  const topic = '/turtle1/pose';
  const type = 'turtlesim/Pose';

  // const subscriber = ros.rn.subscribe(topic, type, (msg) => {
  ros.subscribe('/turtle1/pose', 'turtlesim/Pose', (msg) => {
    _.forEach(msg, (value, key) => {
      mqttSync.data.update(`/device/pose/${key}`, value);
    });
  });
};


// for debugging: a handy command palette when running in a terminal
const ttyListener = () => {
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
}