const { execSync } = require('child_process');
const _ = require('lodash');

const { getLogger} = require('@transitive-sdk/utils');

const log = getLogger('selfChecks');
log.setLevel('info');

// list of self checks to run
const selfChecks = {
  // check if unshare is available
  unshareNotSupported: {
    command: 'unshare -rm whoami',
    checkResult: (result) => {
      return result.trim() !== 'root';
    },
    error: 'unshare not supported, add kernel.apparmor_restrict_unprivileged_userns = 0 to /etc/sysctl.conf',
  },
  // check if bash is installed
  bashNotInstalled: {
    command: 'which bash',
    checkResult: (result) => {
      return result.trim() === '';
    },
    error: 'bash not installed, install bash',
  },
  // check if bash is the default shell
  bashNotDefaultShell: {
    command: 'echo $SHELL',
    checkResult: (result) => {
      return result.trim() !== '/bin/bash';
    },
    error: 'bash not default shell, set bash as default shell',
  },
  // check if mqtt port (1883) is available (not in use)
  mqttPortNotAvailable: {
    command: 'nc -z 127.0.0.1 1883',
    checkResult: (result) => {
      return true; // nc returns a line if the port is in use
    },
    checkException: (e) => {
      return false;
    },
    error: 'mqtt port (1883) not available, check if other process is using it',
  },
  // check if an overlay file system can be created
  overlayNotSupported: {
    command: 'TRPACKAGE=@test_overlay/test ./unshare.sh whoami',
    checkResult: (result) => {
      return false;
    },
    checkException: (e) => {
      return true;
    },
    error: 'overlay file system not supported',
  },
};

const executeSelfChecks = () => {
  log.info('executing self checks');
  data.update(`${AGENT_PREFIX}/status/selfCheckErrors`, []);
  const errors = [];
  _.forEach(selfChecks, (check, name) => {
    log.info(`running self check: ${name}`);
    let error;
    try {
      const result = execSync(check.command, {encoding: 'utf8', stdio: 'pipe'});
      error = check.checkResult(result);
    } catch (e) {
      error = check.checkException ? check.checkException(e) : true;
    }
    if (error) {
      log.error(`self check ${name} FAILED`);
      errors.push(check.error);
    } else {
      log.info(`self check ${name} PASSED`);
    }
  });
  data.update(`${AGENT_PREFIX}/status/selfCheckErrors`, errors);
}


module.exports = { executeSelfChecks };
