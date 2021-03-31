const mqtt = require('mqtt');
const fs = require('fs');

const cache = {};

/** check whether `permissions` grant access to `topic` */
const permitted = (topic, permissions) => {
  const [_, transitiveUserId, device, capability] = topic.split('/');
  return (permissions.transitiveUserId == transitiveUserId
    && permissions.device == device
    && permissions.capability == capability);
};

// -----------------------------------------------------------------

const startMQTT = (clients = []) => {
  const client  = mqtt.connect('mqtts://localhost', {
    key: fs.readFileSync('certs/client.key'),
    cert: fs.readFileSync('certs/client.crt'),
    rejectUnauthorized: false,
    protocolVersion: 5 // needed for the `rap` option, i.e., to get retain flags
  });

  console.log('connecting');
  client.on('connect', function () {
    console.log('connected');
    client.subscribe('/+/+/health-monitoring/#', {rap: true}, (err) => {
      if (!err) {
        // client.publish('/plusone/health/clients', 'Hi, I am the cloud back-end');
      } else {
        console.log('error subscribing', err);
      }
    })
  });

  client.on('error', console.log);
  client.on('disconnect', console.log);

  client.on('message', (topic, message, packet) => {
    // message is Buffer
    console.log(`${topic}`, packet.retain);
    const text = message.toString();

    clients.forEach(({ws, permission}) =>
      permitted(topic, permission) &&
        ws.send(`{ "${topic}": ${text || null} }`)
    );

    // handle retain flag
    if (packet.retain) {
      if (!text) {
        // empty message: clear cache
        delete cache[topic];
      } else {
        cache[topic] = text;
      }
    }
  });
};

/** check cache for any retained messages for this client */
const sendRetained = ({ws, permission}) => {
  for (let topic in cache) {
    console.log('sending cached', topic);
    permitted(topic, permission) && ws.send(`{ "${topic}": ${cache[topic]} }`);
  }
};

module.exports = {startMQTT, sendRetained};
