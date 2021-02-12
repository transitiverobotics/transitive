const fs = require('fs');
const exec = require('child_process').exec;

console.log('@transitive-robotics/robot-agent started', new Date());

const NPM = './usr/bin/node ./usr/bin/npm';

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
setInterval(selfUpdate, 1 * 60 * 1000);

selfUpdate();
