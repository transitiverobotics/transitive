console.log('health!');

const rosnodejs = require('rosnodejs');
const mqtt = require('mqtt');

const client  = mqtt.connect('mqtt://localhost')
client.on('connect', function () {
  // client.subscribe('/plusone/health/#', function (err) {
  //   if (!err) {
  //     client.publish('/plusone/health/clients', 'Hi, I am the robot');
  //   }
  // })
});

client.on('message', function (topic, message) {
  // message is Buffer
  console.log(`mqtt, ${topic}: ${message.toString()}`);
});

rosnodejs.initNode('/snap_health', {
  node: { forceExit: true },
}).then((rosNode) => {
  rosNode.subscribe('/diagnostics_agg', 'diagnostic_msgs/DiagnosticArray',
    (data) => {
      client.publish('/plusone/health/robot1', JSON.stringify(data));
      // TODO: send binary data instead (more compact)
    });
});
