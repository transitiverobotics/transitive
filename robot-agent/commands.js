const fs = require('fs');
const assert = require('assert');
const { exec, execSync } = require('child_process');

const _ = require('lodash');

const constants = require('./constants');
const utils = require('./utils');

const { DataCache, toFlatObject } = require('@transitive-robotics/utils/server');
const dataCache = new DataCache();

/** given a package name, return the system-escaped version of it */
const systemd_escape = (pkgName) =>
  execSync(`systemd-escape "${pkgName}"`).toString().trim();

/** install new package. Note: addedPkg may include a scope,
  e.g., @transitive-robotics/test1 */
const addPackage = (addedPkg) => {
  console.log(`adding package ${addedPkg}`);
  const dir = `${constants.TRANSITIVE_DIR}/packages/${addedPkg}`;
  fs.mkdirSync(dir, {recursive: true});
  fs.copyFileSync(`${constants.TRANSITIVE_DIR}/.npmrc`, `${dir}/.npmrc`);
  fs.writeFileSync(`${dir}/package.json`,
    `{ "dependencies": {"${addedPkg}": "*"} }`);

  const command =
    `systemctl --user start transitive-package@${systemd_escape(addedPkg)}.service`;
  if (process.env.TR_DEVMODE) {
    console.log(`DEV MODE, not starting package (${command})`);
  } else {
    exec(command, {}, (err, stdout, stderr) => {
      console.log('package installed and started', {err, stdout, stderr});
    });
  }
};

/** stop and uninstall named package */
const removePackage = (pkg) => {
  console.log(`removing package ${pkg}`);
  // verify the pkg name is a string, not empty, and doesn't contain dots
  assert(typeof pkg == 'string' && pkg.match(/\w/) && !pkg.match(/\./));
  // stop and remove folder
  exec(`systemctl --user stop transitive-package@${systemd_escape(pkg)}.service`,
    {},
    (err, stdout, stderr) => {
      console.log('package stopped, removing files', {err, stdout, stderr});
      exec(`rm -rf ${constants.TRANSITIVE_DIR}/packages/${pkg}`);
    });
};

/** ensure packages are installed IFF they are in desiredPackages in dataCache */
const ensureDesiredPackages = (desired = {}) => {
  console.log('ensureDesiredPackages', desired);
  // const desired = dataCache.get('desiredPackages');
  const desiredPackages = toFlatObject(desired);
  // remove the initial '/' from the keys:
  _.each(desiredPackages, (value, key) => {
    if (key.startsWith('/')) {
      delete desiredPackages[key];
      desiredPackages[key.slice(1)] = value;
    }
  });
  console.log('Ensure installed packages match: ', desiredPackages);

  const packages = utils.getInstalledPackages();
  console.log('currently installed: ', packages);
  packages.forEach(pkg => {
    if (desiredPackages[pkg]) {
      // TODO: later, check whether the version has changed; for now all
      // packages are set to version "*"
      delete desiredPackages[pkg];
    } else {
      removePackage(pkg);
    }
  });

  // what remains in `desired` is added new, install and start
  console.log('add: ', desiredPackages);
  Object.keys(desiredPackages).forEach(addPackage);
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

/** commands that the agent accepts over mqtt; all need to be prefixed with an
  underscore */
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
  //   console.log('handle agent data', subPath, value, dataCache.get());
  //   if (subPath[0][0] != '_') {
  //     dataCache.update(subPath, value);
  //   }
  // },
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
