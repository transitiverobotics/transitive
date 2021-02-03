const mqtt = require('mqtt')

const startMQTT = (clients = []) => {
  const client  = mqtt.connect('mqtt://localhost')

  client.on('connect', function () {
    client.subscribe('/plusone/health/#', function (err) {
      if (!err) {
        client.publish('/plusone/health/clients', 'Hi, I am the cloud back-end');
      }
    })
  });

  client.on('message', function (topic, message) {
    // message is Buffer
    // console.log(`${topic}: ${message.toString()}`);
    clients.forEach(ws => ws.send(message.toString()));
  });
};

module.exports = {startMQTT};
