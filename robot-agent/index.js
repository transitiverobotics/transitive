const fs = require('fs');

/**
  Detect whether we are run out of
  ~/.transitive/node_modules/@transitive-robotics/robot-agent
  and if not, exit. This is to prevent other packages from installing this
  package once more in their respective node_modules and messing with the
  officially installed version in the above directory.
*/
const TRANSITIVE_DIR = `${process.env.HOME}/.transitive`;
if (__dirname != `${TRANSITIVE_DIR}/node_modules/@transitive-robotics/robot-agent`
    && ! fs.existsSync(`${TRANSITIVE_DIR}/DEVMODE`)) {
  console.log(`This package should not be run or used anywhere but in
    ~/.transitive/node_modules directly. You probably didn't mean to. Exiting.`,
  __dirname);
  process.exit(1);
}

const exec = require('child_process').exec;
require('./mqtt');

console.log('@transitive-robotics/robot-agent started', new Date());

// note that we here assume that we are run by the systemd user service that is
// installed by this package during postinstall
const BINDIR = `${TRANSITIVE_DIR}/usr/bin`;
const NPM = `${BINDIR}/node ${BINDIR}/npm`;
const UPDATE_INTERVAL = 60 * 60 * 1000; // once an hour

/** self-update this package */
const selfUpdate = () => {
  console.log('checking for updates');
  exec(`${NPM} update`, {
      cwd: TRANSITIVE_DIR
    },
    (err, stdout, stderr) => {
      console.log('self-update completed', {err, stdout, stderr});
    });
};

/** update package "name" */
const updatePackage = (name) => {
  console.log(`checking for updates for package ${name}`);
  exec(`${NPM} outdated --json`,
    { cwd: `${TRANSITIVE_DIR}/packages/${name}` },
    (err, stdout, stderr) => {
      const outdated = JSON.parse(stdout);
      console.log('outdated:', outdated);

      if (Object.keys(outdated).length > 0) {
        // package wants to be updated
        exec(`systemctl --user restart transitive-package@${name}.service`, {},
          (err, stdout, stderr) => {
            console.log('package updated and restarted', {err, stdout, stderr});
          });
      }
    });
};

/** update self and all packages */
const update = () => {
  selfUpdate(); // Note: this may kill this program and restart it

  const packages = fs.readdirSync(`${TRANSITIVE_DIR}/packages`,
    {withFileTypes: true}).filter(f => f.isDirectory());
  packages.forEach(({name}) => updatePackage(name));
};

setInterval(update, UPDATE_INTERVAL);

update();
