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
  });

  console.log('connecting');
  client.on('connect', function () {
    console.log('connected');
    client.subscribe('/+/+/health-monitoring/#', function (err) {
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
    console.log(`${topic}`);

    clients.forEach(({ws, permission}) =>
      permitted(topic, permission) &&
        ws.send(`{ "${topic}": ${message.toString()} }`)
    );

    // handle retain flag
    if (packet.retain) {
      cache[topic] = message.toString();
    }
  });
};

/** check cache for any retained messages for this client */
const sendRetained = ({ws, permission}) => {
  for (let topic in cache) {
    const message = cache[topic];
    permitted(topic, permission) && ws.send(`{ "${topic}": ${message} }`);
  }
};

module.exports = {startMQTT, sendRetained};
