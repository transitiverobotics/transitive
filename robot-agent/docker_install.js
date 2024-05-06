/** This file is run by the install.sh script executed from the curl command
when a docker build environment is detected. It's purpose is to pre-install
any desired packages.
*/

const fs = require('fs');
const {spawn} = require('child_process');
const localApi = require('./localApi');

const constants = require('./constants');
const DIR = constants.TRANSITIVE_DIR;

let config = {};
console.log(`Reading config from: ${DIR}/config.json`);
try {
  config = JSON.parse(fs.readFileSync(`${DIR}/config.json`, {encoding: 'utf8'}));
  console.log(`Using config:\n${JSON.stringify(config, true, 2)}`);
} catch (e) {
  console.log('No config.json file found or not valid JSON, proceeding without.');
}

const installPackage = (pkg) => new Promise((resolve, reject) => {
  console.log(`Installing ${pkg}`);

  const pkgDir = `${DIR}/packages/${pkg}`;
  fs.mkdirSync(pkgDir, {recursive: true});
  fs.copyFileSync(`${DIR}/.npmrc`, `${pkgDir}/.npmrc`);
  fs.writeFileSync(`${pkgDir}/package.json`, `{"dependencies": {"${pkg}": "*"}}`);

  // Cannot use spawnSync here, since that would block requests to the localApi
  // as well, which we may need to process as part of these npm install processes
  const subprocess = spawn(`${__dirname}/preinstallPackage.sh`, [pkg], {
    cwd: pkgDir,
    env: {
      ...process.env,
      TR_ROS_RELEASES: config?.global?.rosReleases?.join(' ')
    },
    stdio: 'inherit'
  });
  subprocess.on('close', (code) => {
    code && console.warn(`Installing ${pkg} exited with code:`, code);
    resolve();
  });
});


// Need to start the local API server to install package dependencies if necessary
localApi.startServer(async () => {
  const packages = config?.global?.desiredPackages || [];
  console.log(`Desired packages: ${packages.join(', ')}`);
  for (let p of packages) {
    await installPackage(p);
  }

  localApi.stopServer();
  console.log('docker_install.js: done');
});