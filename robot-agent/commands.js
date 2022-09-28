const fs = require('fs');
const { exec } = require('child_process');
const zlib = require('zlib');

const constants = require('./constants');
const { restartPackage, killPackage, killAllPackages } = require('./utils');

const { DataCache, getLogger } = require('@transitive-sdk/utils');
const dataCache = new DataCache();

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
