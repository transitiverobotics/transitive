const fs = require('fs');
const assert = require('assert');
const exec = require('child_process').exec;
const constants = require('./constants');
const utils = require('./utils');

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

/** this is the list of recognized commands and their implementation */
const commands = {
  /** set list of should-be-installed packages */
  desiredPackages: (desired) => {
    console.log('Ensure installed packages match', desired);

    const packages = utils.getInstalledPackages();
    packages.forEach(pkg => {
      if (desired[pkg]) {
        // TODO: later, check whether the version has changed; for now all
        // packages are set to version "*"
        delete desired[pkg];
      } else {
        console.log(`package ${pkg} has been remove`);
        // verify the pkg name is a string, not empty, and doesn't contain dots
        assert(typeof pkg == 'string' && pkg.match(/\w/) && !pkg.match(/\./));
        // stop and remove folder
        exec(`systemctl --user stop transitive-package@${pkg}.service`, {},
          (err, stdout, stderr) => {
            console.log('package installed and started', {err, stdout, stderr});
            exec(`rm -rf ${constants.TRANSITIVE_DIR}/packages/${pkg}`);
          });
      }
    });

    // what remains in `desired` is added new, install and start
    Object.keys(desired).forEach(addedPkg => {
      console.log(`adding package ${addedPkg}`);

      fs.mkdirSync(`${constants.TRANSITIVE_DIR}/packages/${addedPkg}`);
      fs.copyFileSync(`${constants.TRANSITIVE_DIR}/.npmrc`,
        `${constants.TRANSITIVE_DIR}/packages/${addedPkg}/.npmrc`);
      fs.writeFileSync(`${constants.TRANSITIVE_DIR}/packages/${addedPkg}/package.json`,
        JSON.stringify({dependencies: {
            [`@transitive-robotics/${addedPkg}`]: "*"
          }
        }, true, 2));

      exec(`systemctl --user start transitive-package@${addedPkg}.service`, {},
        (err, stdout, stderr) => {
          console.log('package installed and started', {err, stdout, stderr});
        });
    });
  }
};


module.exports = {
  /** handle, i.e., parse and execute a command sent to the agent via mqtt */
  handleAgentCommand: (command, payload) => {
    // command is an array
    const cmdFunction = commands[command];
    if (cmdFunction) {
      cmdFunction(payload);
    } else {
      console.error('Received unknown command', command);
    }
  }
};
