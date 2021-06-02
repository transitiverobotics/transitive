const fs = require('fs');
const assert = require('assert');
const exec = require('child_process').exec;

const _ = require('lodash');

const constants = require('./constants');
const utils = require('./utils');

const { DataCache } = require('@transitive-robotics/utils/server');
const dataCache = new DataCache();

// const diff = (a, b) => {
//   const allkeys = _.uniq(_.keys(a).concat(_.keys(b)));
//   const added = [];
//   const removed = [];
//   const changed = [];
//   allkeys.forEach(pkg => {
//     if (a[pkg]) {
//       if (!b[pkg]) {
//         removed.push(pkg);
//       } else if (a[pkg] != b[pkg]) {
//         changed.push(pkg);
//       }
//     } else {
//       added.push(pkg);
//     }
//   });
//   return {added, removed, changed};
// };

/** install new package */
const addPackage = (addedPkg) => {
  console.log(`adding package ${addedPkg}`);
  const dir = `${constants.TRANSITIVE_DIR}/packages/${addedPkg}`;
  fs.mkdirSync(dir, {recursive: true});
  fs.copyFileSync(`${constants.TRANSITIVE_DIR}/.npmrc`, `${dir}/.npmrc`);
  fs.writeFileSync(`${dir}/package.json`,
    `{ "dependencies": {"@transitive-robotics/${addedPkg}": "*"} }`);

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
  const desired = dataCache.get('desiredPackages');
  console.log('Ensure installed packages match', desired);

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


const commands = {
  _restart: () => {
    console.log("Received restart command.");
    process.exit(0);
  }
};

// dataCache.subscribe(change => {
//   _.forEach(change, (value, key) => {
//     const command = key.split('.')[0];
//     const cmdFunction = dataHandlers[command];
//     if (cmdFunction) {
//       cmdFunction(dataCache.get(command));
//     } else {
//       console.error('Received unknown data command', command);
//     }
//   });
// });

/** define handlers for data changes (used for reactive programming) */
dataCache.subscribePath('desiredPackages.+pkg', (value, key, {pkg}) => {
  console.log('got desiredPackages request', pkg, value);
  if (value) {
    addPackage(pkg);
  } else {
    removePackage(pkg);
  }
});

module.exports = {
  /** handle, i.e., parse and execute a command sent to the agent via mqtt */
  handleAgentData: (subPath, value) => {
    if (subPath[0][0] != '_') {
      dataCache.update(subPath, value);
    }
  },
  handleAgentCommand: (subPath, value) => {
    const cmd = commands[subPath[0]];
    if (cmd) {
      console.error('Executing command', subPath[0]);
      cmd(subPath.slice(1));
    } else {
      console.error('Received unknown command', command);
    }
  },

  ensureDesiredPackages,
};
