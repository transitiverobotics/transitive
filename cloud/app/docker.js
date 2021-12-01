const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const Docker = require('dockerode');


const docker = new Docker();

/** Ensure the given version of the given package is running. If not, start
  it in a docker container. */
const ensureRunning = async ({name, version}) => {
  const list = await docker.listContainers();
  const isRunning = list.some(container => container.Image == `${name}:${version}`);
  if (!isRunning) {
    start({name, version});
  }
};

/** start the given version of the given package */
const start = ({name, version}) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transitive-cap-docker-'));
  console.log(tmp);

  // generate certs
  fs.mkdirSync(path.join(tmp, 'certs'));
  const keyFile = path.join(tmp, 'certs', 'client.key');
  const csrFile = path.join(tmp, 'certs', 'client.csr');
  const cn = `cap:${name}`;
  execSync(`openssl genrsa -out ${keyFile} 2048`);
  execSync(`openssl req -out ${csrFile} -key ${keyFile} -new -subj="/CN=${cn}"`);
  execSync(`openssl x509 -req -in ${csrFile} -CA /etc/mosquitto/certs/ca.crt -CAkey /etc/mosquitto/certs/ca.key`);

  // generate package.json
  const packageJson = {
    scripts: {
      start: `cd node_modules/@transitive-robotics/${name} && node -e "console.log(require('./package.json').transitive_package)" && ln -s /app/certs cloud/ && npm run cloud`
    },
    transitive_package: `@transitive-robotics/${name}`,
    dependencies: {
      [`@transitive-robotics/${name}`]: `${version}`
    }
  };
  fs.writeFileSync(path.join(tmp, 'package.json'),
    JSON.stringify(packageJson, true, 2));

  // generate .npmrc
  fs.writeFileSync(path.join(tmp, '.npmrc'),
    `@transitive-robotics:registry=http://127.0.0.1:6000\n`); // TODO: don't hard code

  /** now build the equivalent of this docker-compose:
  version: "3.7"
  services:
    test:
      build:
        context: .
        network: host
      image: "${name}:${version}"
  */

};

// module.exports = { ensureRunning };
ensureRunning({name: 'health-monitoring', version: '0.3.11'});
