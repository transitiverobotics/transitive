const fs = require('fs');
const { exec } = require('child_process');
const zlib = require('zlib');
const _ = require('lodash');

const constants = require('./constants');
const { restartPackage, startPackage, killPackage, killAllPackages,
  upgradeNodejs } = require('./utils');

const { getLogger, clone } = require('@transitive-sdk/utils');

const log = getLogger('commands');
log.setLevel('debug');


// /** execute a sequence of commands and report corresponding results in cb */
// const execAll = ([head, ...tail], cb) => {
//   if (head) {
//     log.debug('execAll:', head);
//     exec(head, (err, stdout, stderr) => {
//       const result = {[head]: {err, stdout, stderr}};
//       execAll(tail, (subResult) => cb(Object.assign({}, subResult, result)));
//     });
//   } else {
//     cb({});
//   }
// };

/** commands that the agent accepts over mqtt; all need to be prefixed with an
  underscore */
const commands = {
  restart: () => {
    log.info("Received restart command.");
    process.exit(0);
  },
  stopAll: () => {
    log.info("Stop all packages");
    killAllPackages();
  },
  restartPackage: (sub) => {
    const pkg = sub.join('/')
    log.debug(`Restarting ${pkg}.`);
    restartPackage(pkg);
  },
  startPackage: (sub) => {
    const pkg = sub.join('/')
    log.debug(`Starting ${pkg}.`);
    startPackage(pkg);
  },
  stopPackage: (sub) => {
    const pkg = sub.join('/')
    log.debug(`Stopping ${pkg}.`);
    killPackage(pkg);
  },
  getPkgLog: (sub, value, cb) => {
    const pkg = sub.slice(0,2).join('/');
    exec(`cat ~/.transitive/packages/${pkg}/log | tail -n 100000`,
      (err, stdout, stderr) => cb({
        err,
        stdout: zlib.gzipSync(stdout).toString('base64'),
        stderr: zlib.gzipSync(stderr).toString('base64')
      }));
  },
  updateConfig: (sub, modifier, cb) => {
    log.debug('updateConfig', modifier);
    // now set it in `global.config` and write it back to disk
    _.forEach(modifier, (value, path) => _.set(global.config, path, value));
    log.debug('backing up old config and writing new', global.config);
    try {
      fs.copyFileSync('./config.json', './config.json.bak');
    } catch (e) {}
    fs.writeFileSync('./config.json', JSON.stringify(global.config, true, 2),
      {encoding: 'utf8'});

    global.data.update(`${global.AGENT_PREFIX}/info/config`,
      clone(global.config)
    );
  },

  upgradeNodejs: (sub, value, cb) => {
    upgradeNodejs((err, output) => {
      if (err) {
        cb(`Failed to upgrade nodejs: ${err}`);
      } else {
        cb(output);
      }
    });
  }
};

module.exports = {
  /** handle, i.e., parse and execute a command sent to the agent via mqtt */
  handleAgentCommand: (command, rest, value, cb) => {
    const cmd = commands[command];
    if (cmd) {
      log.debug('Executing command', command, rest);
      cmd(rest, value, cb);
    } else {
      console.error('Received unknown command', command);
    }
  },
};
