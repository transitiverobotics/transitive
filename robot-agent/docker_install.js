/** This file is run by the install.sh script executed from the curl command
when a docker build environment is detected. It's purpose is to pre-install
any desired packages.
*/

const fs = require('fs');
const {execSync} = require('child_process');
const localApi = require('./localApi');

const constants = require('./constants');
const DIR = constants.TRANSITIVE_DIR;

let config = {};
console.log(`Reading config from: ${DIR}/config.json`);
try {
  config = JSON.parse(fs.readFileSync(`${DIR}/config.json`, {encoding: 'utf8'}));
  console.log(`Using config:\n${JSON.stringify(config, true, 2)}`);
} catch (e) {
  console.log('No config.json file found or not valid JSON, proceeding without.',
    e);
}

const installPackage = (pkg) => {
  console.log(`Installing ${pkg}`);
  const pkgDir = `${DIR}/packages/${pkg}`;
  fs.mkdirSync(pkgDir, {recursive: true});
  fs.copyFileSync(`${DIR}/.npmrc`, `${pkgDir}/.npmrc`);
  fs.writeFileSync(`${pkgDir}/package.json`,
    `{ "dependencies": {"${pkg}": "*"} }`);
  try {
    execSync('npm install --no-save', {cwd: pkgDir,
      env: Object.assign({}, process.env,
        {
          PATH: `${process.PATH}:${DIR}/usr/bin`,


          // #HERE: test this



        })
    });
  } catch (e) {
    console.warn(`Installing ${pkg} failed:`, e);
  }
};

// Need to start the local API server to install package dependencies if necessary
localApi.startServer(() => {
  const packages = config?.global?.desiredPackages || [];
  console.log(`Desired packages: ${packages.join(', ')}`);
  packages.forEach(installPackage);

  localApi.stopServer();
  console.log('docker_install.js: done');
});