const mqtt = require('mqtt');
const fs = require('fs');
const _ = require('lodash');

const { randomId } = require('./server_utils');

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

// const startMQTT = (clients = []) => {
//   const client  = mqtt.connect('mqtts://localhost', {
//     key: fs.readFileSync('certs/client.key'),
//     cert: fs.readFileSync('certs/client.crt'),
//     rejectUnauthorized: false,
//     protocolVersion: 5 // needed for the `rap` option, i.e., to get retain flags
//   });
//
//   console.log('connecting');
//   client.on('connect', function () {
//     console.log('connected');
//     client.subscribe('/+/+/health-monitoring/#', {rap: true}, (err) => {
//       if (!err) {
//         // client.publish('/plusone/health/clients', 'Hi, I am the cloud back-end');
//       } else {
//         console.log('error subscribing', err);
//       }
//     })
//   });
//
//   client.on('error', console.log);
//   client.on('disconnect', console.log);
//
//   client.on('message', (topic, message, packet) => {
//     // message is Buffer
//     console.log(`${topic}`, packet.retain);
//     const text = message.toString();
//
//     clients.forEach(({ws, permission}) =>
//       permitted(topic, permission) &&
//         ws.send(`{ "${topic}": ${text || null} }`)
//     );
//
//     // handle retain flag
//     if (packet.retain) {
//       if (!text) {
//         // empty message: clear cache
//         delete cache[topic];
//       } else {
//         cache[topic] = text;
//       }
//     }
//   });
// };

// /** check cache for any retained messages for this client */
// const sendRetained = ({ws, permission}) => {
//   for (let topic in cache) {
//     console.log('sending cached', topic);
//     permitted(topic, permission) && ws.send(`{ "${topic}": ${cache[topic]} }`);
//   }
// };


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
      // client.subscribe('/+/+/health-monitoring/#', {rap: true}, (err) => {
      //   if (!err) {
      //     // client.publish('/plusone/health/clients', 'Hi, I am the cloud back-end');
      //   } else {
      //     console.log('error subscribing', err);
      //   }
      // })
      onConnect(this);
    });

    client.on('error', console.log);
    client.on('disconnect', console.log);

    client.on('message', (topic, message, packet) => {
      // message is Buffer
      // console.log(`${topic}`, packet.retain);
      // for now we assume all messages are text
      const text = message.toString();

      // clients.forEach(({ws, permission}) =>
      //   permitted(topic, permission) &&
      //     ws.send(`{ "${topic}": ${text || null} }`)
      // );
      // ^^ MOVE THIS TO capability or WS handler


      _.each(this.subscriptions, sub =>
        mqttTopicMatch(topic, sub.topic) && sub.callback(packet)
      );
    });
  }

  /** Capabilities use this to subscribe to messages only on this topic;
  to unsubscribe, call .stop() on the returned object.
  */
  subscribe(topic, callback) {
    const key = randomId();

    this.client.subscribe(topic, {rap: true}, (err) => {
      if (!err) {
        console.log('adding subscription');
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
