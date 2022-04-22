/** Ensure ros core is installed and running */

const fs = require('fs');
const {exec, execSync, spawn} = require('child_process');
const url = require('url');
const net = require('net');

const rosDistros = {
  focal: 'noetic',
  bionic: 'melodic',
  xenial: 'kinetic'
};

let ubuntuRelease;
let rosDistro;

const ROS_MASTER_URI = process.env.ROS_MASTER_URI || 'http://localhost:11311';

/** Call callback with `true` is roscore is running */
const checkCoreRunning = (callback) => {
  const parsed = url.parse(ROS_MASTER_URI);
  const socket = new net.Socket()

  const report = (result) => {
    socket.destroy(); // to prevent other callback from firing
    callback(result);
  };
  socket.on('connect', () => report(true));
  socket.on('timeout', () => report(false));
  socket.on('error', () => report(false));
  socket.setTimeout(1000);
  try {
    socket.connect(parsed.port, parsed.hostname);
  } catch (e) {
    report(false);
  };
};

/** install ros core */
const install = () => {
  console.log(
    execSync(`${process.env.HOME}/.transitive/bin/aptLocal.sh ros-${rosDistro}-roslaunch`)
    .toString()
  );
};

/** Check whether roscore is installed, return the path */
const findRoscore = () => {
  const possiblePaths = [
    `/opt/ros/${rosDistro}/bin/roscore`, // official ROS install, system-wide
    `/usr/bin/roscore`, // ubuntu's ros packages
    `${process.env.HOME}/.transitive/opt/ros/${rosDistro}/bin/roscore` // local
  ];
  console.log('looking for roscore at', possiblePaths);
  return possiblePaths.find(path => fs.existsSync(path));
};

/** start roscore process, detached and unref'd so it can keep running after
current process (robot-agent) stops */
const startCore = (path) => {
  const cmd = [ `. ${process.env.HOME}/.transitive/etc/env_local`,
      `. ${process.env.HOME}/.transitive/opt/ros/${rosDistro}/setup.bash`,
      `. /opt/ros/${rosDistro}/setup.bash`,
      path
    ].join(' ; ');
  console.log('starting core:', cmd);
  const roscore = spawn('/bin/bash', ['-c', cmd], {
    detached: true,
    stdio: 'ignore'
  });
  roscore.unref();
};


module.exports = (callback) => {
  ubuntuRelease = execSync('lsb_release -sc').toString().trim();
  rosDistro = rosDistros[ubuntuRelease];
  console.log({ubuntuRelease, rosDistro});

  checkCoreRunning(running => {
    console.log(`core is running: ${running}`);
    if (!running) {
      let roscorePath = findRoscore();
      console.log(`roscore: ${roscorePath}`);
      if (!roscorePath) {
        console.log('installing roscore');
        install();
        roscorePath = findRoscore();
      }

      if (!roscorePath) {
        console.warn('failed to install roscore');
        callback && callback('failed to install roscore');
      } else {
        console.log(`starting roscore: ${roscorePath}`);
        startCore(roscorePath);
        callback && callback();
      }
    } else {
      callback && callback();
    }
  });
};
