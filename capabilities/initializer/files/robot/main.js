'use strict';

const mqtt = require('mqtt');
const { getLogger, getLocalMQTTSync } = require('@transitive-sdk/utils');
const _ = require('lodash');

// If you want to use ROS (1 or 2) we recommend you use our utility library
// by running `npm i @transitive-sdk/utils-ros` in robot/ and uncommenting:
//
// const { getForVersion } = require('@transitive-sdk/utils-ros');

const log = getLogger('main');
log.setLevel('debug');

// ------------------------------------------------------------

let mqttSync;
getLocalMQTTSync().then((m) => {
  mqttSync = m;

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

  ros.subscribe(topic, type, (msg) => {
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