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
      client.publish('/plusone/health/site1/robot1', JSON.stringify(data));
      // TODO: send binary data instead (more compact)
    });

  const diagArray = rosnodejs.require('diagnostic_msgs').msg.DiagnosticArray;
  const diag_pub = rosNode.advertise(
    `/diagnostics_agg`, `diagnostic_msgs/DiagnosticArray`, {
      queueSize: 1,
      latching: true,
      throttleMs: 100
    }
  );

  setInterval(() => {
      diag_pub.publish(new diagArray({
        status: [{
            level: 0,
            name: '/OK_sensor',
            message: 'I\'m OK',
            hardware_id: 'ok',
            values: [{ key: 'key1', value: 'value1' }]
          }, {
            level: 1,
            name: '/WARN_sensor',
            message: 'I\'m warning',
            hardware_id: 'warn',
            values: [{ key: 'key2', value: 'value2' }]
          }, {
            level: 2,
            name: '/ERROR_sensor',
            message: 'I\'m in error',
            hardware_id: 'error',
            values: [{ key: 'key3', value: 'value3' }]
          }, {
            level: 3,
            name: '/STALE_sensor',
            message: 'I\'m stale',
            hardware_id: 'stale',
            values: [
              { key: 'key4', value: 'value4' },
              { key: 'key5', value: 'value5' }
            ]
          }]
      }));
    }, 500);

});
