const mqtt = require('mqtt');
const fs = require('fs');
const _ = require('lodash');

const { randomId } = require('@transitive-robotics/utils/server');

/** check whether topic matches the mqtt subscription expression, i.e.,
  a topic with potential wildcards; see https://mosquitto.org/man/mqtt-7.html */
const mqttTopicMatch = (topic, subscription) => {
  const partsMatch = (topicParts, subParts) => {
    if (subParts.length == 0 && topicParts.length == 0) {
      return true;
    } else if (subParts.length == 0 && topicParts.length > 0) {
      // subscription is for a (specific) parent topic
      return false;
    } else if (subParts[0] == '#') {
      return true;
    } else if (subParts.length > 0 && topicParts.length == 0) {
      // subscription is more specific than topic
      return false;
    } else {
      return (subParts[0] == '+' || subParts[0] == topicParts[0])
        && partsMatch(topicParts.slice(1), subParts.slice(1));
    }
  };

  return partsMatch(topic.split('/'), subscription.split('/'));
}

// -----------------------------------------------------------------


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
      console.log(`${topic}`, packet.retain);
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
};

module.exports = {mqttTopicMatch, MQTTHandler};
