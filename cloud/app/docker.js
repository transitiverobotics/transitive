const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const Docker = require('dockerode');


const docker = new Docker();

/** Ensure the given version of the given package is running. If not, start
  it in a docker container. */
const ensureRunning = async ({name, version}) => {
  // const list = await docker.listContainers();
  // const isRunning = list.some(cont => cont.Image == `${name}:${version}`);
  const list = await docker.listContainers({filter:
    {Image: [`${name}:${version}`]}});
  const isRunning = list.length > 0;
  if (!isRunning) {
    await start({name, version});
  }
};

/** Build docker image for the given version of the given package */
const build = async ({name, version}) => {

  const imageName = `${name}:${version}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'transitive-cap-docker-'));
  console.log(`building ${imageName} in ${tmp}`);

  // generate certs
  fs.mkdirSync(path.join(tmp, 'certs'));
  const keyFile = path.join(tmp, 'certs', 'client.key');
  const csrFile = path.join(tmp, 'certs', 'client.csr');
  const crtFile = path.join(tmp, 'certs', 'client.crt');
  const cn = `cap:${name}`;
  execSync(`openssl genrsa -out ${keyFile} 2048`);
  execSync(`openssl req -out ${csrFile} -key ${keyFile} -new -subj="/CN=${cn}"`);
  execSync(`openssl x509 -req -in ${csrFile} -out ${crtFile} -CA /etc/mosquitto/certs/ca.crt -CAkey /etc/mosquitto/certs/ca.key`);

  // generate package.json
  const packageJson = {
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

  fs.writeFileSync(path.join(tmp, '.dockerignore'), [
      'node_modules',
      'Dockerfile'
    ].join('\n'));

  // generate Dockerfile
  const pkgFolder = `node_modules/@transitive-robotics/${name}/`;
  const certsFolder = `${pkgFolder}/cloud/certs`;
  fs.writeFileSync(path.join(tmp, 'Dockerfile'), [
      'FROM node:16',
      'WORKDIR /app',
      'COPY * /app/',
      'RUN npm install',
      `RUN mkdir ${certsFolder}`,
      `RUN ln -s /app/client.crt ${certsFolder}`,
      `RUN ln -s /app/client.key ${certsFolder}`,
      `WORKDIR /app/${pkgFolder}`,
      'CMD npm run cloud'
    ].join('\n'));

  /** now build the equivalent of this docker-compose:
  version: "3.7"
  services:
    test:
      build:
        context: .
        network: host
      image: "${name}:${version}"
  */
  const stream = await docker.buildImage({
      context: tmp,
      src: ['Dockerfile',
        'certs/client.key',
        'certs/client.crt',
        'package.json', '.npmrc', '.dockerignore']
    }, {
      networkmode: 'host', // #DEBUG
      t: imageName
    });
  stream.on('data', chunk => console.log(chunk.toString()));
  await new Promise((resolve, reject) => {
    docker.modem.followProgress(stream,
      (err, res) => err ? reject(err) : resolve(res));
  });
  console.log('done building');
};

/** start the given version of the given package, build it first if it doesn't
  yet exist */
const start = async ({name, version}) => {
  const imageName = `${name}:${version}`;
  const list = await docker.listImages();
  const exists = list.some(image =>
    image.RepoTags && image.RepoTags.includes(imageName));

  if (!exists) {
    await build({name, version});
  } else {
    console.log('image exists');
  }

  console.log('starting container');
  docker.run(imageName, [], null, {
    name: `${name}_${version}`,
    HostConfig: {
      AutoRemove: true,
      NetworkMode: 'host' // TODO
    },
    Labels: {
      'transitive-type': 'capability'
    }
  });
};

/** stop the container for the given version of the given package name */
const stop = async ({name, version}) => {
  const containerName = `${name}_${version}`;
  console.log('stopping', containerName);
  const list = await docker.listContainers({filters: {name: [containerName]}});
  if (list.length > 0) {
    await docker.getContainer(list[0].Id).stop();
  }
};

module.exports = { ensureRunning, stop };
// ensureRunning({name: 'health-monitoring', version: '0.3.11'});
