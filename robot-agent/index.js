const constants = require('./constants');

process.env.TR_DEVMODE && console.log('*** DEV MODE');

/**
  Detect whether we are run out of
  ~/.transitive/node_modules/@transitive-robotics/robot-agent
  and if not, exit. This is to prevent other packages from installing this
  package once more in their respective node_modules and messing with the
  officially installed version in the above directory.
*/
if (__dirname != `${constants.TRANSITIVE_DIR}/node_modules/@transitive-robotics/robot-agent`
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

const utils = require('./utils');
const exec = require('child_process').exec;

console.log('@transitive-robotics/robot-agent started', new Date());

// note that we here assume that we are run by the systemd user service that is
// installed by this package during postinstall
const UPDATE_INTERVAL = 60 * 60 * 1000; // once an hour

/** self-update this package */
const selfUpdate = (cb) => {
  console.log('checking for updates');
  exec(`${constants.NPM} update`, {cwd: constants.TRANSITIVE_DIR},
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
        exec(`systemctl --user restart transitive-package@${name}.service`, {},
          (err, stdout, stderr) => {
            console.log(`package ${name} updated and restarted`, {err, stdout, stderr});
          });
      } else {
        // no update needed just start it (does nothing if it's already running)
        exec(`systemctl --user start transitive-package@${name}.service`, {},
          (err, stdout, stderr) => {
            err && console.log(`error starting package ${name}`, stderr);
          });
      }
    });
};

const updateAllPackages = () => {
  const packages = utils.getInstalledPackages();
  packages.forEach(name => updatePackage(name));
};

/** update self and all packages */
const update = () => {
  if (!process.env.TR_DEVMODE) {
    selfUpdate(updateAllPackages);
  }
}

setInterval(update, UPDATE_INTERVAL);

update();

// TODO: make this safer against self-destructing updates by only loading this
// after updates are complete
require('./mqtt');


/** catch-all to be safe */
process.on('uncaughtException', (err) => {
  console.error(`**** Caught exception: ${err}:`, err.stack);
});
