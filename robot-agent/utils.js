const fs = require('fs');
const { spawn, exec, execSync } = require('child_process');
const os = require('os');
const path = require('path');
const assert = require('assert');
const _ = require('lodash');

const { toFlatObject, getLogger } = require('@transitive-sdk/utils');
const constants = require('./constants');

const log = getLogger('utils');
log.setLevel('debug');

const basePath = `${constants.TRANSITIVE_DIR}/packages`;
const LOG_COUNT = 3;

/** given a path, list all sub-directories by name */
const getSubDirs = (path) => fs.readdirSync(path, {withFileTypes: true})
    .filter(f => f.isDirectory())
    .map(f => f.name);

/** find list of installed packages, defined as those that have a folder in
packages/ with a package.json in it (or other expected file if specified). */
const getInstalledPackages = (expectedFile = 'package.json') => {
  const list = getSubDirs(basePath);

  const lists = list.map(dir => {
    if (dir.startsWith('@')) {
      // it's a scope, not a package, list packages in that scope
      const sublist = getSubDirs(`${basePath}/${dir}`);
      return sublist.map(subdir => `${dir}/${subdir}`);
    } else {
      return [dir];
    }
  });
  const flat = [].concat(...lists); // flatten

  return flat.filter(dir => fileExists(`${basePath}/${dir}/${expectedFile}`));
};

/**
* Gets the process ID (PID) of a running package
*
* @param {string} pkgName - The name of the package to find the PID for
*/
const getPackagePid = (pkgName) =>{
  return new Promise((resolve, reject) => {
    const pgrep = spawn('pgrep',
      ['-nf', `startPackage.sh ${pkgName}`, '-U', process.getuid()]);
    let pkgPid = null;
    pgrep.stdout.on('data', (data) => {
      const pid = parseInt(data.toString().trim());
      log.debug(`pgrep found package ${pkgName} with PID: ${pid}`);
      if (!isNaN(pid)) {
        pkgPid = pid;
      } else {
        log.debug(`pgrep did not return a valid PID for package ${pkgName}`);
      }
    });

    pgrep.stdout.on('end', () => {
      if (pkgPid) {
        log.debug(`Resolved PID for package ${pkgName}: ${pkgPid}`);
        resolve(pkgPid);
      } else {
        log.debug(`No PID found for package ${pkgName}`);
        resolve(null);
      }
    });
  });
}

/** install new package. Note: addedPkg may include a scope,
e.g., @transitive-robotics/test1 */
const addPackage = (addedPkg) => {
  log.debug(`adding package ${addedPkg}`);
  const dir = `${constants.TRANSITIVE_DIR}/packages/${addedPkg}`;
  fs.mkdirSync(dir, {recursive: true});
  fs.copyFileSync(`${constants.TRANSITIVE_DIR}/.npmrc`, `${dir}/.npmrc`);
  fs.writeFileSync(`${dir}/package.json`,
    `{ "dependencies": {"${addedPkg}": "*"} }`);
  updatePackageConfigFile(addedPkg);
  startPackage(addedPkg);
};

/** stop and uninstall named package */
const removePackage = (pkg) => {
  log.debug(`removing package ${pkg}`);
  // verify the pkg name is a string, not empty, and doesn't contain dots
  assert(typeof pkg == 'string' && pkg.match(/\w/) && !pkg.match(/\./));
  // stop and remove folder
  killPackage(pkg, 'SIGTERM', (exitcode) => {
    if (exitcode) {
      console.warn(`stopping package failed (exit code: ${exitcode})`);
    } else {
      log.debug('package stopped, removing files');
    }
    exec(`rm -rf ${constants.TRANSITIVE_DIR}/packages/${pkg}`);
  });
};

/** update the config.json file for the package with the current global config
and the package specific config.*/
const updatePackageConfigFile = (packageName) => {
  const config = {
    global: global.config.global,      // global, shared config
    package: global.config[packageName] || {} // pkg specific config
  };
  log.info(`Updating ${packageName} config.json file`, config);
  // update the config.json file for this package
  fs.writeFileSync(`${basePath}/${packageName}/config.json`,
    JSON.stringify(config, null, 2));
};


/** restart the named package by sending a SIGUSR1 to its startPackage.sh process
e.g., name = '@transitive-robotics/health-monitoring'
*/
const restartPackage = (name, startIfNotRunning = false) => {
  killPackage(name, 'SIGUSR1', (code) => {
    if (code == 1) {
      log.warn(`package ${name} not running`);
      startIfNotRunning && startPackage(name);
    } else if (code) {
      log.warn(`restarting package ${name} failed (code: ${code})`)
    } else {
      log.debug(`package ${name} updated and restarted`)
    }
  });
};

/** 'kill' package, i.e., send it the desired signal to the process group
leader. Also used for restarting packages via SIGUSR1, see the trap in
startPackage.sh */
const killPackage = (name, signal = 'SIGTERM', cb = undefined) => {
  const args = [`-${signal}`, '-nf', `startPackage.sh ${name}`,
    '-U', process.getuid()];

  log.debug('pkill', args);
  const pkill = spawn('pkill', args);
  // yes, we need to use spawn here rather than exec because otherwise the `-n`
  // will cause the pkill to find the shell in which it is running itself.
  pkill.stdout.on('data', buffer => log.debug(buffer.toString()));
  pkill.stderr.on('data', buffer => log.warn(buffer.toString()));
  pkill.on('error', log.error);
  cb && pkill.on('exit', cb);
}

/** start the named package if it isn't already running */
const startPackage = (name) => {
  log.debug(`startPackage ${name}`);
  // first check whether it might already be running
  const pgrep = spawn('pgrep',
    ['-nf', `startPackage.sh ${name}`, '-U', process.getuid()]);

  pgrep.on('exit', (code) => {
    if (code) {
      log.debug(`starting ${name}`);
      // package is not running, start it
      const logFile = `${os.homedir()}/.transitive/packages/${name}/log`;
      fs.mkdirSync(path.dirname(logFile), {recursive: true});
      const out = fs.openSync(logFile, 'a');

      const subprocess = spawn(`${os.homedir()}/.transitive/unshare.sh`,
        [`/home/bin/startPackage.sh ${name}`],
        { stdio: ['ignore', out, out], // so it can continue without us
          detached: true,
          cwd: `${os.homedir()}/.transitive`,
          env: Object.assign({},
            process.env, // TODO: is this safe? we may *not* want capabilities to see this
            {
              TRPACKAGE: name,
              TR_ROS_RELEASES: config?.global?.rosReleases?.join(' '),
            })
        });
      subprocess.unref();
      log.debug(`Package ${name} started with PID: ${subprocess.pid}`);
    } else {
      log.debug(`Package ${name} is already running`);
    }
  });
};

/** Watch the status.json file of a package, and relay that info to mqtt.
* If the file doesn't initially exist, create it and set the provided initial
* status.
*/
const watchStatus = (name, status) => {
  const statusFile = `${os.homedir()}/.transitive/packages/${name}/status.json`;

  fs.access(statusFile, fs.constants.R_OK, (err) => {
    if (err) {
      fs.writeFileSync(statusFile, JSON.stringify({status}));
    }

    const watcher = fs.watch(statusFile, {persistence: false},
      (eventType, filename) => {
        // log.debug(`event type is: ${eventType}`);
        if (filename) {
          fs.readFile(statusFile, {encoding: 'utf-8'}, (err, res) => {
            if (err) {
              // log.warn('Error reading package status', err);
              global.data?.update(`${global.AGENT_PREFIX}/status/package/${name}`,
                null);
            } else {
              try {
                const json = JSON.parse(res);
                global.data?.update(`${global.AGENT_PREFIX}/status/package/${name}`,
                  json);
              } catch (e) {
                log.warn('Error parsing status.json', e);
              }
            }
          });
        } else {
          log.debug('filename not provided');
        }
      }
    );
  });
};

/** check whether we, the running process, have password-less sudo rights */
let _weHaveSudo = null;
const weHaveSudo = () => {
  if (_weHaveSudo == null) {
    try {
      execSync('sudo -n whoami');
      _weHaveSudo = true;
    } catch (err) {
      _weHaveSudo = false;
    }
  }
  return _weHaveSudo;
};

const fileExists = (filePath) => {
  try {
    fs.accessSync(filePath);
    return true;
  } catch (e) {
    return false;
  }
}

/** rotate given (log) file */
const logRotate = (file, count = LOG_COUNT) => {
  if (!fileExists(file)) return;
  log.debug('Rotating log file', file);

  for (let i = count - 1; i > 0; i--) {
    try {
      fs.copyFileSync(`${file}.${i}`, `${file}.${i+1}`);
    } catch (e) {};
  }
  fs.copyFileSync(file, `${file}.1`);
  // Now truncate the current file. Don't delete! That would break the logging
  // stream.
  fs.truncateSync(file);
};

/** rotate the log files for all installed packages */
const rotateAllLogs = () => {
  const list = getInstalledPackages('log');
  list.forEach(dir => {
    const logFile = `${basePath}/${dir}/log`;
    logRotate(logFile);
  });
};

/** A more reliable way to kill all running packages/capabilities, even when
* they are not cooperating */
const killAllPackages = () => {
  try {
    execSync("pkill -f '/home/bin/startPackage.sh @'");
  } catch (e) {
    // this *always* happens, because the pkill also kills itself; we only care
    // if there is output
    const stdout = e.stdout.toString('utf8');
    const stderr = e.stderr.toString('utf8');
    if (stdout || stderr) {
      log.warn(`Error killing packages\n stdout: ${stdout}\n stderr: ${stderr}`);
    }
  }
};

/** ensure packages are installed IFF they are in desiredPackages in dataCache */
const ensureDesiredPackages = (desired = {}) => {
  log.debug('ensureDesiredPackages', desired);
  // const desired = dataCache.get('desiredPackages');
  const wanted = toFlatObject(desired);
  // remove the initial '/' from the keys:
  _.each(wanted, (value, key) => {
    if (key.startsWith('/')) {
      delete wanted[key];
      wanted[key.slice(1)] = value;
    }
  });

  // also add any configured packages from config.json:
  global.config?.global?.desiredPackages?.forEach(pkgName =>
    wanted[pkgName] = '*');

  log.debug('Ensure installed packages match: ', wanted);

  const packages = getInstalledPackages();
  log.debug('currently installed: ', packages);
  packages.forEach(pkg => {
    if (wanted[pkg]) {
      // TODO: later, check whether the version has changed; for now all
      // packages are set to version "*"
      delete wanted[pkg];
    } else {
      removePackage(pkg);
    }
  });

  // what remains is added new, install and start
  log.debug('add: ', wanted);
  Object.keys(wanted).forEach(addPackage);
};

/** Upgrade node.js to latest version. Which one that is is set by the apt
* sources added in aptCommon, which is part of the robot-agent release itself.
*/
const upgradeNodejs = (cb) => {
  log.debug('Upgrading nodejs to latest from active repos');
  // Need to (re)move old npm install, as would be done by nodejs preinst,
  // which we don't execute in aptLocal; see
  // https://github.com/chfritz/transitive/issues/377#issuecomment-2040236076

  const npmFolder = `${constants.TRANSITIVE_DIR}/usr/lib/node_modules/npm`;
  const npmBackup = `${npmFolder}.bak`;
  try {
    fs.rmSync(npmBackup, {recursive: true, force: true});
    fs.renameSync(npmFolder, npmBackup);
  } catch (e) {
    log.warn(`Unable to move ${npmFolder}`, e);
  }

  const cmd = `${__dirname}/aptFetch.sh nodejs`;
  // using aptFetch instead of aptLocal ensures that it will work even when
  // there are conflicting packages installed, such as node 10, see
  // #377#issuecomment-2041523598
  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      log.warn(`Failed to upgrade nodejs: ${err}`);
      // we failed, restore old npm
      try {
        fs.renameSync(npmBackup, npmFolder);
      } catch (e) {
        log.warn(`Unable to restore ${npmFolder}`, e);
      }
      cb(`Failed to upgrade nodejs: ${err}`);
    } else {
      log.debug(stdout);
      const msgs = [`Upgrade of nodejs complete: ${stdout}`];
      if (stderr) {
        log.warn(stderr);
        msgs.push(`stderr: ${stderr}`);
      }
      cb(null, msgs.join('\n'));
    }
  });
}

/** Round to precision avoiding the string conversions of Number(x.toPrecision()).
*/
const toPrecision = (number, precision) => {
  const factor = Math.pow(10, precision);
  return Math.trunc(number * factor) / factor;
};

module.exports = {
  restartPackage,
  killPackage,
  startPackage,
  weHaveSudo,
  rotateAllLogs,
  killAllPackages,
  ensureDesiredPackages,
  upgradeNodejs,
  updatePackageConfigFile,
  watchStatus,
  getInstalledPackages,
  getPackagePid,
  toPrecision
};
