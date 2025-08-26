const fs = require('fs');
const { exec } = require('child_process');
const zlib = require('zlib');
const _ = require('lodash');

const { restartPackage, startPackage, killPackage, killAllPackages,
  upgradeNodejs } = require('./utils');

const { getLogger, clone } = require('@transitive-sdk/utils');

const log = getLogger('commands');
log.setLevel('debug');

/* Commands that are exposed as RPCs. */
const commands = {

  ping: ({timestamp}) => {
    log.info('got ping', timestamp);
    return Date.now();
  },

  restart: () => {
    log.info("Received restart command.");
    process.exit(0);
  },

  stopAll: () => {
    log.info("Stop all packages");
    killAllPackages();
  },

  restartPackage: ({pkg}) => {
    log.debug(`Restarting ${pkg}.`);
    restartPackage(pkg);
  },

  startPackage: ({pkg}) => {
    log.debug(`Starting ${pkg}.`);
    startPackage(pkg);
  },

  stopPackage: ({pkg}) => {
    log.debug(`Stopping ${pkg}.`);
    killPackage(pkg);
  },

  getPkgLog: ({pkg}) => {
    return new Promise((resolve, reject) => {
      exec(`cat ~/.transitive/packages/${pkg}/log | tail -n 100000`,
        (err, stdout, stderr) => resolve({
          err,
          stdout: zlib.gzipSync(stdout).toString('base64'),
        }));
    });
  },

  updateConfig: ({modifier}) => {
    log.debug('updateConfig', modifier);
    // now set it in `global.config` and write it back to disk
    const newConfig = clone(global.config);
    _.forEach(modifier, (value, path) => _.set(newConfig, path, value));
    log.debug('backing up old config and writing new', newConfig);
    try {
      fs.copyFileSync('./config.json', './config.json.bak');
    } catch (e) {}
    fs.writeFileSync('./config.json', JSON.stringify(newConfig, true, 2),
      {encoding: 'utf8'});
  },

  upgradeNodejs: () => {
    return new Promise((resolve, reject) => {
      upgradeNodejs((err, output) => {
        resolve(err ? `Failed to upgrade nodejs: ${err}` : output);
      });
    });
  },
}

module.exports = { commands };
