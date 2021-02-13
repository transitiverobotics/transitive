/**
  Detect whether we are run out of
  ~/.transitive/node_modules/@transitive-robotics/robot-agent
  and if not, exit. This is to prevent other packages from installing this
  package once more in their respective node_modules and messing with the
  officially installed version in the above directory.
*/
if (__dirname != `${process.env.HOME}/.transitive/node_modules/@transitive-robotics/robot-agent`) {
  console.log(`This package should not be run or used anywhere but in
    ~/.transitive/node_modules directly. You probably didn't mean to. Exiting.`);
  process.exit(1);
}

const fs = require('fs');
const exec = require('child_process').exec;

console.log('@transitive-robotics/robot-agent started', new Date());

// note that we here assume that we are run by the systemd user service that is
// installed by this package during postinstall
const NPM = './usr/bin/node ./usr/bin/npm';
const UPDATE_INTERVAL = 60 * 60 * 1000; // once an hour

const selfUpdate = () => {
  console.log('checking for updates');
  exec(`${NPM} --version`, {}, console.log);
  exec(`${NPM} update`, {
      cwd: `${process.env.HOME}/.transitive`
    },
    (err, stdout, stderr) => {
      console.log('self-update completed', {err, stdout, stderr});
    });
};
setInterval(selfUpdate, UPDATE_INTERVAL);

selfUpdate();
