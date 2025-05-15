const { execSync } = require('child_process');
const { getLogger } = require('@transitive-sdk/utils');
const log = getLogger('selfChecks.js');
log.setLevel('info');

// list of self checks to run
const selfChecks = {
  // check if unshare is available
  unshareNotSupported: {
    run: () => {
      log.info('Running self check: unshareNotSupported');
      try {
        const result = execSync('unshare -rm whoami', {encoding: 'utf8'});
        const failed = result.trim() !== 'root';
        log.info(`unshareNotSupported result: ${failed ? 'FAILED' : 'PASSED'}`);
        return failed;
      }
      catch (e) {
        log.info('unshareNotSupported error:', e.message || e);
        return true;
      }
    },
    error: 'unshare not supported, add kernel.apparmor_restrict_unprivileged_userns = 0 to /etc/sysctl.conf',
  },
  // check if bash is installed
  bashNotInstalled: {
    run: () => {
      log.info('Running self check: bashNotInstalled');
      try {
        const result = execSync('which bash', {encoding: 'utf8'});
        const failed = result.trim() == '';
        log.info(`bashNotInstalled result: ${failed ? 'FAILED' : 'PASSED'}`);
        return failed;
      }
      catch (e) {
        log.info('bashNotInstalled error:', e.message || e);
        return true;
      }
    },
    error: 'bash not installed, install bash',
  },
  // check if bash is the default shell
  bashNotDefaultShell: {
    run: () => {
      log.info('Running self check: bashNotDefaultShell');
      try {
        const result = execSync('echo $SHELL', {encoding: 'utf8'});
        const failed = result.trim() !== '/bin/bash';
        log.info(`bashNotDefaultShell result: ${failed ? 'FAILED' : 'PASSED'}`);
        return failed;
      }
      catch (e) {
        log.info('bashNotDefaultShell error:', e.message || e);
        return true;
      }
    },
    error: 'bash not default shell, set bash as default shell',
  },
  // check if mqtt port (1883) is available (not in use)
  mqttPortNotAvailable: {
    run: () => {
      log.info('Running self check: mqttPortNotAvailable');
      try {
        execSync('nc -z 127.0.0.1 1883', { stdio: 'ignore' });
        // If nc exits with 0, port is open (in use)
        log.info('mqttPortNotAvailable result: FAILED (port in use)');
        return true;
      } catch (e) {
        // If nc exits with non-zero, port is not open (available)
        log.info('mqttPortNotAvailable result: PASSED');
        return false;
      }
    },
    error: 'mqtt port (1883) not available, check if other process is using it',
  },
};

module.exports = { selfChecks };
