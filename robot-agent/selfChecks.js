const { execSync } = require('child_process');
const _ = require('lodash');

const { getLogger} = require('@transitive-sdk/utils');

const log = getLogger('selfChecks');
log.setLevel('info');

/** List of self checks to run */
const selfChecks = {
  // check if unshare is supported
  unshareSupported: {
    command: 'unshare -rm whoami',
    checkResult: (result) => result.trim() === 'root',
    error: 'Unshare not supported, please add kernel.apparmor_restrict_unprivileged_userns = 0 to /etc/sysctl.conf',
  },
  // check if bash is installed
  bashInstalled: {
    command: 'which bash',
    checkResult: (result) => result.trim() !== '',
    error: 'Bash not installed, please install bash.',
  },
  // check if bash is the default shell
  bashDefaultShell: {
    command: 'echo $SHELL',
    checkResult: (result) => result.trim() === '/bin/bash',
    error: 'Bash is not the default shell, please set bash as the default shell',
  },
  // check if an overlay file system can be created
  overlaySupported: {
    command: 'TRPACKAGE=@test_overlay/test ./unshare.sh whoami',
    error: 'Overlay file system not supported, please see https://transitiverobotics.com/docs/guides/troubleshooting/',
  },
};


/** Perform self-checks and report results via MQTTSync so the front-end can
* show the failing test (if any) to the user. */
const executeSelfChecks = (data) => {
  log.info('executing self checks');

  _.forEach(selfChecks, (check, name) => {
    log.info(`running self check: ${name}`);
    let failed;

    try {
      const result = execSync(check.command,
        {encoding: 'utf8', stdio: 'pipe', timeout: 5000});
      failed = check.checkResult && !check.checkResult(result);
      // If checkResult is not defined, then the test is successful unless there
      // is an exception.
    } catch (e) {
      failed = true;
    }

    if (failed) {
      log.error(`self check ${name} FAILED`);
    } else {
      log.info(`self check ${name} PASSED`);
    }

    // update status in MQTTSync
    data.update(`${AGENT_PREFIX}/status/selfCheckErrors/${name}`,
      failed ? check.error : null);
  });
}


module.exports = { executeSelfChecks };
