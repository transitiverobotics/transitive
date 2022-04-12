const constants = require('./constants');
const fs = require('fs');

process.env.TR_DEVMODE && console.log('*** DEV MODE');

/**
  Detect whether we are run out of
  ~/.transitive/node_modules/@transitive-robotics/robot-agent
  and if not, exit. This is to prevent other packages from installing this
  package once more in their respective node_modules and messing with the
  officially installed version in the above directory.

  Using fs.realpathSync here in case the home directory path contains a symlink.
*/
if (__dirname != fs.realpathSync(
  `${constants.TRANSITIVE_DIR}/node_modules/@transitive-robotics/robot-agent`)
  && !process.env.TR_DEVMODE) {
  console.error(`This package should not be run or used anywhere but in
    ~/.transitive/node_modules directly. You probably didn't mean to. Exiting.`,
  __dirname);
  process.exit(1);
}

if (!process.env.TR_USERID) {
  console.error('Missing environment variable: TR_USERID');
  process.exit(2);
}

const {exec} = require('child_process');
const {getInstalledPackages, restartPackage, startPackage} = require('./utils');
const { getLogger } = require('@transitive-sdk/utils');
const localApi = require('./localApi');
const ensureROS = require('./ensureROS');

const log = getLogger('index.js');
log.setLevel('debug');

log.debug('@transitive-robotics/robot-agent started', new Date());

// note that we here assume that we are run by the systemd user service that is
// installed by this package during postinstall or inside a while loop
const UPDATE_INTERVAL = 60 * 60 * 1000; // once an hour

/** self-update this package */
const selfUpdate = (cb) => {
  console.log('checking for updates');
  exec(`${constants.NPM} update --no-save`, {cwd: constants.TRANSITIVE_DIR},
    (err, stdout, stderr) => {
      if (!err) {
        console.log('self-update completed:', stdout);
        cb();
      } else {
        console.log('self-update failed', {err, stderr});
      }
    });
};



/** update package "name" */
const updatePackage = (name) => {
  console.log(`checking for updates for package ${name}`);
  exec(`${constants.NPM} outdated --json`,
    { cwd: `${constants.TRANSITIVE_DIR}/packages/${name}` },
    (err, stdout, stderr) => {
      const outdated = JSON.parse(stdout);
      console.log('outdated:', outdated);

      if (Object.keys(outdated).length > 0) {
        // package wants to be updated
        restartPackage(name, true);
      } else {
        // no update needed just start it (does nothing if it's already running)
        startPackage(name);
      }
    });
};

const updateAllPackages = () => {
  const packages = getInstalledPackages();
  packages.forEach(name => updatePackage(name));
};

/** update self and all packages */
const update = () => {
  if (!process.env.TR_DEVMODE) {
    selfUpdate(() => ensureROS(updateAllPackages));
  } else {
    // ensureROS();
    ensureROS(updateAllPackages);
  }
}

setInterval(update, UPDATE_INTERVAL);

update();

// TODO: make this safer against self-destructing updates by only loading this
// after updates are complete
require('./mqtt');

localApi.startServer();

/** catch-all to be safe */
process.on('uncaughtException', (err) => {
  console.error(`**** Caught exception: ${err}:`, err.stack);
});
