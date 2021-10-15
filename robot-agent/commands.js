const fs = require('fs');
const assert = require('assert');
const exec = require('child_process').exec;

const _ = require('lodash');

const constants = require('./constants');
const utils = require('./utils');

const { DataCache } = require('@transitive-robotics/utils/server');
const dataCache = new DataCache();


/** install new package */
const addPackage = (addedPkg) => {
  console.log(`adding package ${addedPkg}`);
  const dir = `${constants.TRANSITIVE_DIR}/packages/${addedPkg}`;
  fs.mkdirSync(dir, {recursive: true});
  fs.copyFileSync(`${constants.TRANSITIVE_DIR}/.npmrc`, `${dir}/.npmrc`);
  fs.writeFileSync(`${dir}/package.json`,
    `{ "dependencies": {"@transitive-robotics/${addedPkg}": "*"} }`);

  !process.env.TR_DEVMODE &&
    exec(`systemctl --user start transitive-package@${addedPkg}.service`, {},
      (err, stdout, stderr) => {
        console.log('package installed and started', {err, stdout, stderr});
      });
};

/** stop and uninstall named package */
const removePackage = (pkg) => {
  console.log(`removing package ${pkg}`);
  // verify the pkg name is a string, not empty, and doesn't contain dots
  assert(typeof pkg == 'string' && pkg.match(/\w/) && !pkg.match(/\./));
  // stop and remove folder
  exec(`systemctl --user stop transitive-package@${pkg}.service`, {},
    (err, stdout, stderr) => {
      console.log('package installed and started', {err, stdout, stderr});
      exec(`rm -rf ${constants.TRANSITIVE_DIR}/packages/${pkg}`);
    });
};

/** ensure packages are installed IFF they are in desiredPackages in dataCache */
const ensureDesiredPackages = () => {
  const desired = dataCache.get('desiredPackages') || {};
  console.log('Ensure installed packages match: ', desired);

  const packages = utils.getInstalledPackages();
  packages.forEach(pkg => {
    if (desired[pkg]) {
      // TODO: later, check whether the version has changed; for now all
      // packages are set to version "*"
      delete desired[pkg];
    } else {
      removePackage(pkg);
    }
  });

  // what remains in `desired` is added new, install and start
  Object.keys(desired).forEach(addPackage);
};

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

const commands = {
  _restart: () => {
    console.log("Received restart command.");
    process.exit(0);
  },
  _restartPackage: (sub) => {
    console.log(`Restarting ${sub[0]}.`);
    exec(`systemctl --user restart transitive-package@${sub[0]}`, console.log);
  },
  // _exec: (sub, value, cb) => {
  //   exec(value, (err, stdout, stderr) => cb({err, stdout, stderr}));
  // }
  _getStatus: (sub, value, cb) => {
    execAll([
        `systemctl --user status transitive-package@${sub[0]}`,
        `ls ${process.env.HOME}/.transitive/packages/${sub[0]}`,
        `journalctl --user -n 1000 | grep unshare`
        // note that journalctl -u doesn't show all output (stderr?)
      ], cb);
  },
  _getLog: (sub, value, cb) => {
    execAll([
        `grep ${process.pid} /var/log/syslog | tail -n 1000`,
      ], cb);
  }
};

/** define handlers for data changes (used for reactive programming) */
dataCache.subscribePath('desiredPackages', ensureDesiredPackages);

module.exports = {
  /** handle, i.e., parse and execute a command sent to the agent via mqtt */
  handleAgentData: (subPath, value) => {
    console.log('handle agent data', subPath, value);
    if (subPath[0][0] != '_') {
      dataCache.update(subPath, value);
    }
  },
  handleAgentCommand: (subPath, value, cb) => {
    const cmd = commands[subPath[0]];
    if (cmd) {
      console.log('Executing command', subPath);
      cmd(subPath.slice(1), value, cb);
    } else {
      console.error('Received unknown command', command);
    }
  },

  ensureDesiredPackages,
};
