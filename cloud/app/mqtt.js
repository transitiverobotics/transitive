const mqtt = require('mqtt');
const fs = require('fs');
const _ = require('lodash');

const { randomId, mqttTopicMatch } = require('@transitive-robotics/utils/server');


/** Our handler of mqtt, used by all capabilities  */
class MQTTHandler {

  subscriptions = {};

  constructor(onConnect, URL = 'mqtts://localhost') {
    const client  = mqtt.connect(URL, {
      key: fs.readFileSync('certs/client.key'),
      cert: fs.readFileSync('certs/client.crt'),
      rejectUnauthorized: false,
      protocolVersion: 5 // needed for the `rap` option, i.e., to get retain flags
    });
    this.client = client;

    console.log('connecting');
    client.on('connect', () => {
      console.log('connected');
      onConnect(this);
    });

    client.on('error', console.log);
    client.on('disconnect', console.log);

    client.on('message', (topic, message, packet) => {
      console.log(`${topic}`, message, packet.retain);
      _.each(this.subscriptions, sub => {
        // don't remove braces, otherwise loop may terminate early
        mqttTopicMatch(topic, sub.topic) && sub.callback(packet)
      });
    });
  }

  /** Capabilities use this to subscribe to messages only on this topic;
  to unsubscribe, call .stop() on the returned object.
  */
  subscribe(topic, callback) {
    const key = randomId();

    this.client.subscribe(topic, {rap: true}, (err) => {
      if (!err) {
        console.log('adding subscription for', topic);
        this.subscriptions[key] = {topic, callback};
      } else {
        console.log('error subscribing', err);
      }
    });

    return {
      stop: () => this.client.unsubscribe(topic, () =>
        delete this.subscriptions[key]
      ),
      ready: () => !!this.subscriptions[key],
      topic,
      callback,
    };
  }

  publish(topic, payload, options) {
    this.client.publish(topic, payload, options);
  }
};

module.exports = {mqttTopicMatch, MQTTHandler};
