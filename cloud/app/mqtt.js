const mqtt = require('mqtt');
const fs = require('fs');

const startMQTT = (clients = []) => {
  const client  = mqtt.connect('mqtts://localhost', {
    key: fs.readFileSync('certs/client.key'),
    cert: fs.readFileSync('certs/client.crt'),
    rejectUnauthorized: false,
  });

  console.log('connecting');
  client.on('connect', function () {
    console.log('connected');
    client.subscribe('/plusone/health/#', function (err) {
      if (!err) {
        client.publish('/plusone/health/clients', 'Hi, I am the cloud back-end');
      }
    })
  });

  client.on('error', console.log);
  client.on('disconnect', console.log);

  client.on('message', function (topic, message) {
    // message is Buffer
    console.log(`${topic}`);

    // specific to health monitoring for now
    const [site, device] = topic.split('/').slice(3);
    clients.forEach(ws => ws.send(
      `{ "${site}": {"${device}": ${message.toString()} } }`));
  });
};

module.exports = {startMQTT};
