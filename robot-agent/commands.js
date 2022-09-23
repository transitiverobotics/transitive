const fs = require('fs');
const { exec } = require('child_process');

const constants = require('./constants');
const { restartPackage, killPackage, killAllPackages } = require('./utils');

const { DataCache, getLogger } = require('@transitive-sdk/utils');
const dataCache = new DataCache();

const log = getLogger('commands');
log.setLevel('debug');



/** execute a sequence of commands and report corresponding results in cb */
const execAll = ([head, ...tail], cb) => {
  if (head) {
    exec(head, (err, stdout, stderr) => {
      const result = {[head]: {err, stdout, stderr}};
      execAll(tail, (subResult) => cb(Object.assign({}, subResult, result)));
    });
  } else {
    cb({});
  }
};

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
  // _exec: (sub, value, cb) => {
  //   exec(value, (err, stdout, stderr) => cb({err, stdout, stderr}));
  // }

  // Not in use:
  // _getStatus: (sub, value, cb) => {
  //   execAll([
  //       `systemctl --user status "transitive-package@${systemd_escape(sub[0])}"`,
  //       `ls ${process.env.HOME}/.transitive/packages/${sub[0]}`,
  //       `journalctl --user -n 1000 | grep unshare`
  //       // note that journalctl -u doesn't show all output (stderr?)
  //     ], cb);
  // },
  getLog: (sub, value, cb) => {
    execAll([
        `grep ${process.pid} /var/log/syslog | tail -n 1000`,
      ], cb);
  }
};

/** define handlers for data changes (used for reactive programming), but not
  right away, only once we have gotten our initial batch. Otherwise we'll
  remove packages when the first to-be-installed-package message is received.
*/
// setTimeout(() => {
//     ensureDesiredPackages();
//     dataCache.subscribePath('/desiredPackages', ensureDesiredPackages);
//   }, 4000);

module.exports = {
  /** handle, i.e., parse and execute a command sent to the agent via mqtt */
  // handleAgentData: (subPath, value) => {
  //   log.debug('handle agent data', subPath, value, dataCache.get());
  //   if (subPath[0][0] != '_') {
  //     dataCache.update(subPath, value);
  //   }
  // },
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
