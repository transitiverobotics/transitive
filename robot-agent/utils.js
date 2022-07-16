const fs = require('fs');
const { spawn, exec, execSync } = require('child_process');
const os = require('os');
const path = require('path');
const { getLogger } = require('@transitive-sdk/utils');
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
packages/ with a package.json in it. */
const getInstalledPackages = () => {
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
  return flat.filter(dir => fileExists(`${basePath}/${dir}/package.json`));
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
  cb && pkill.on('exit', cb);
};

/** start the named package if it isn't already running */
const startPackage = (name) => {
  log.debug(`startPackage ${name}`);

  // first check whether it might already be running
  const pgrep = spawn('pgrep',
    ['-nf', `startPackage.sh ${name}`, '-U', process.getuid()]);
  pgrep.stdout.on('data', (data) => console.log(`pgrep: ${data}`));

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
            { TRPACKAGE: name })
        });
      subprocess.unref();
      } // else: nothing to do, it's already running
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
const logRotate = (file, {count}) => {
  if (!fileExists(file)) return;

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
  const list = getInstalledPackages();
  list.forEach(dir => {
    const logFile = `${basePath}/${dir}/log`;
    logRotate(logFile, {count: LOG_COUNT}, (err) =>
      err && log.error(`error rotating log file for ${dir}`, err)
    );
  });
};

module.exports = {
  getInstalledPackages,
  restartPackage,
  killPackage,
  startPackage,
  weHaveSudo,
  rotateAllLogs,
};
