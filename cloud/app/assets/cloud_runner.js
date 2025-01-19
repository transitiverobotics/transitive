/** Script to start the cloud capability of the current directory.
Also auto-updates the cloud cap.

Requires utils@0.7.1 or later, so that certs are found without the need for
symlinks created by docker.js.
*/

const fs = require('fs');
const {exec, execSync, spawn} = require('child_process');

const packageName = process.argv[2];

const log = {};
['log', 'debug', 'error', 'warn'].forEach(method => log[method] = (...args) =>
    console[method](`[${((new Date()).toISOString())} cloud_runner.js]`, ...args));

if (!packageName) {
  log.error('No package name given');
  process.exit(1);
}

const pkgPath = `node_modules/${packageName}`;
let capProcess = null;

/** (Re-)Start the capability process */
const restart = () => {
  log.debug('(re-)starting');
  // kill if running
  if (capProcess) {
    log.debug('killing', -capProcess.pid);
    process.kill(-capProcess.pid);
    // Note the minus: this kills the process group, not just `npm run cloud`
  }

  capProcess = spawn('npm', ['run', 'cloud'],
    {cwd: pkgPath, stdio: 'inherit', detached: true});
  // detached causes this to create a new process group that we can kill later
  capProcess.on('exit', () => log.debug('Capability stopped running'));
};

/** Remove all hidden files and directories in the given directory */
const rmHidden = (dir) => {
  fs.readdirSync(dir).forEach(name => name.startsWith('.') &&
      fs.rmSync(`${dir}/${name}`, {recursive: true, force: true})
  );
};

/** Check for updates and install them. If successful, restart the cap.
Does nothing when the version set for packageName is not a range, but, e.g.,
1.2.3.
*/
const checkForUpdate = () => {
  log.debug('checkForUpdate');
  exec(`npm outdated --json ${packageName}`, (err, stdout, stderr) => {
    const outdated = JSON.parse(stdout);

    if (outdated[packageName]) {
      log.debug('outdated', outdated[packageName]);
      if (outdated[packageName].wanted != outdated[packageName].current) {

        const scope = packageName.split('/')[0];
        rmHidden('node_modules');
        rmHidden(`node_modules/${scope}`);

        exec(`npm update ${packageName}`, (err, stdout, stderr) => {
          log.debug('npm update result:', {err, stdout, stderr});
          if (!err) {
            restart();
          }
        });
      }
    }
  });
};

restart();
setInterval(checkForUpdate, 5 * 60 * 1000);
