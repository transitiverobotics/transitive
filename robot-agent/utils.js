const fs = require('fs');
const { spawn, exec, execSync } = require('child_process');
const os = require('os');
const path = require('path');
const { getLogger } = require('@transitive-sdk/utils');
const constants = require('./constants');

const log = getLogger('utils');
log.setLevel('debug');

/** given a path, list all sub-directories by name */
const getSubDirs = (path) => fs.readdirSync(path, {withFileTypes: true})
    .filter(f => f.isDirectory())
    .map(f => f.name);

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
      const logFile = `/tmp/_tr_logs/${name}.log`;
      fs.mkdirSync(path.dirname(logFile), {recursive: true});
      const out = fs.openSync(logFile, 'a');
      // TODO: add a log-rotate or truncate for these log files

      const subprocess = spawn(`${os.homedir()}/.transitive/unshare.sh`,
        [`/home/usr/bin/startPackage.sh ${name}`],
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


module.exports = {
  getInstalledPackages: () => {
    const basePath = `${constants.TRANSITIVE_DIR}/packages`;
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
    return [].concat(...lists); // flatten
  },

  restartPackage,
  killPackage,
  startPackage
};
