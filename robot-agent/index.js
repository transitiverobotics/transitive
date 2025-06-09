
const fs = require('fs');
const path = require('path');

const constants = require('./constants');
const LogMonitor = require('./logMonitor');
const { getConfig } = require('./config');

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

// --------------------------------------------------------------------------

const {exec, execSync} = require('child_process');
const { CronJob } = require('cron');
const {getInstalledPackages, restartPackage, startPackage, rotateAllLogs,
  upgradeNodejs, killAllPackages } = require('./utils');
const { getLogger } = require('@transitive-sdk/utils');
const localApi = require('./localApi');

const log = getLogger('index.js');
log.setLevel('debug');

log.debug('@transitive-robotics/robot-agent started', new Date());

// note that we here assume that we are run by the systemd user service that is
// installed by this package during postinstall or inside a while loop
const UPDATE_INTERVAL = 60 * 60 * 1000; // once an hour

/** Ensure we are running the desired version of node.js */
const ensureNodeVersion = (callback) => {
  const desiredMajor = process.env.npm_package_config_desiredNodeVersion;
  const runningMajor = parseInt(process.versions.node);

  if (runningMajor != desiredMajor) {
    log.debug(`Node.js running (${runningMajor}) != desired (${desiredMajor})`);
    upgradeNodejs((err, output) => {
      if (err) {
        log.warn('New node.js version failed to install, continuing without:', err);
        callback();
      } else {
        killAllPackages();
        process.exit(0);
      }
    });
  } else {
    callback();
  }
};


/** self-update this package */
const selfUpdate = (callback) => {
  log.info('checking for updates');

  exec(`${constants.NPM} outdated --json`, {cwd: constants.TRANSITIVE_DIR},
    (err, stdout, stderr) => {
      const outdated = JSON.parse(stdout);

      if (Object.keys(outdated).length > 0) {
        // agent wants to be updated, exit to restart:
        process.exit(0);
        // TODO: maybe add a counter (in a file) that we can use to abort
        // updates if they have failed too many times in a row? (e.g., when offline)
      } else {
        log.info(
          `no update necessary (running ${process.env.npm_package_version})`);

        ensureNodeVersion(callback);
      }
    });
};

/** Are we allowed to update right now? */
const canWeUpdate = () => {
  const updateHours = getConfig('updateHours');
  const currentHour = (new Date()).getHours();
  return (!updateHours || (
      ( updateHours.from || 0) <= currentHour
        && (updateHours.to || 24) > currentHour)
  );
};

/** update package "name" */
const updatePackage = (name) => {

  log.info(`checking for updates for package ${name}`);
  exec(`${constants.NPM} outdated --json`,
    { cwd: `${constants.TRANSITIVE_DIR}/packages/${name}` },
    (err, stdout, stderr) => {
      const outdated = JSON.parse(stdout);
      log.info('outdated:', outdated);

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
  log.debug('updateAllPackages');
  const packages = getInstalledPackages();

  if (canWeUpdate()) {
    packages.forEach(name => updatePackage(name));
  } else {
    log.debug('Not in update window, skipping package updates');
    packages.forEach(name => startPackage(name));
  }
};

/** update self and all packages */
const update = () => {
  if (!process.env.TR_DEVMODE) {
    selfUpdate(updateAllPackages);
  } else {
    updateAllPackages();
  }
};

setInterval(update, UPDATE_INTERVAL);
// rotate all log files at 1am
rotateAllLogs();
new CronJob('0 0 1 * * *', rotateAllLogs, null, true);

update();

// TODO: make this safer against self-destructing updates by only loading this
// after updates are complete
require('./mqtt');

localApi.startServer();

/** catch-all to be safe */
process.on('uncaughtException', (err) => {
  console.error(`**** Caught exception: ${err}:`, err.stack);
});

// Path to agent log file
const logFilePath = path.join(process.env.HOME, '.transitive', 'agent.log');
LogMonitor.uploadLogsFromFile(logFilePath, '/agent');
