console.log('health!', process.env);

const rosnodejs = require('rosnodejs');
rosnodejs.initNode('/snap_health', {
  node: { forceExit: true },
}).then((rosNode) => {
  rosNode.subscribe('/turtle1/pose', 'turtlesim/Pose', console.log);
});
