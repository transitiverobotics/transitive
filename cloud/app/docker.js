const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const Docker = require('dockerode');
const { getLogger } = require('@transitive-robotics/utils');

const RUN_DIR = `/run/user/${process.getuid()}/transitive/caps`;

const log = getLogger('docker.js');
log.setLevel('debug');

const docker = new Docker();

/** Ensure the given version of the given package is running. If not, start
  it in a docker container. */
const ensureRunning = async ({name, version}) => {
  const list = await docker.listContainers();
  const isRunning = list.some(cont => cont.Image == `${name}:${version}`);
  // const list = await docker.listContainers({filter:
  //   {Image: [`${name}:${version}`]}});
  // const isRunning = list.length > 0;
  if (!isRunning) {
    await start({name, version});
  }
};

/** generate docker tag name from capability name and version */
const getTagName = ({name, version}) => `${name.replace(/@/g, '')}:${version}`;

/** Build docker image for the given version of the given package */
const build = async ({name, version}) => {

  const tagName = getTagName({name, version});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transitive-cap-docker-'));
  log.debug(`building ${tagName} in ${dir}`);

  // generate certs
  const keyFile = path.join(dir, 'client.key');
  const csrFile = path.join(dir, 'client.csr');
  const crtFile = path.join(dir, 'client.crt');
  const cn = `cap:${name.replace(/\//g, '\\/')}`;
  execSync(`openssl genrsa -out ${keyFile} 2048`);
  execSync(`openssl req -out ${csrFile} -key ${keyFile} -new -subj="/CN=${cn}"`);
  execSync(`openssl x509 -req -in ${csrFile} -out ${crtFile} -CA /etc/mosquitto/certs/ca.crt -CAkey /etc/mosquitto/certs/ca.key -days 180`);

  // generate package.json
  const packageJson = {
    transitive_package: name,
    dependencies: {[name]: `${version}`}
  };
  fs.writeFileSync(path.join(dir, 'package.json'),
    JSON.stringify(packageJson, true, 2));

  // generate .npmrc
  fs.writeFileSync(path.join(dir, '.npmrc'),
    `@transitive-robotics:registry=http://127.0.0.1:6000\n`);
  // TODO: don't hard code in case we separate the npm registry from the app
  // in the cloud onto separate instances

  fs.writeFileSync(path.join(dir, '.dockerignore'), [
      'node_modules',
      'Dockerfile'
    ].join('\n'));

  // generate Dockerfile
  const pkgFolder = `node_modules/${name}/`;
  const certsFolder = `${pkgFolder}/cloud/certs`;
  fs.writeFileSync(path.join(dir, 'Dockerfile'), [
      'FROM node:16',
      'COPY * /app/',
      'WORKDIR /app',
      'RUN npm install',
      `RUN mkdir ${certsFolder}`,
      `RUN ln -s /app/client.crt ${certsFolder}`,
      `RUN ln -s /app/client.key ${certsFolder}`,
      `WORKDIR /app/${pkgFolder}`,
      `CMD cp -a dist /app/run && npm run cloud`
      // this ^ will be used by cloud-agent to serve capability's web components
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
  log.debug('building the image');
  const stream = await docker.buildImage({
      context: dir,
      src: ['Dockerfile', 'client.key', 'client.crt',
        'package.json', '.npmrc', '.dockerignore']
    }, {
      networkmode: 'host', // #DEBUG,
      extrahosts: 'registry.homedesk.local:172.17.0.1', // #DEBUG
      t: tagName
    });
  stream.on('data', chunk =>
    log.debug(JSON.parse(chunk.toString()).stream?.trim()));
  await new Promise((resolve, reject) => {
    docker.modem.followProgress(stream,
      (err, res) => err ? reject(err) : resolve(res));
  });
  log.debug('done building');
};

/** start the given version of the given package, build it first if it doesn't
  yet exist */
const start = async ({name, version}) => {

  const tagName = getTagName({name, version});
  const runDir = path.join(RUN_DIR, name, version);
  fs.mkdirSync(runDir, {recursive: true});
  const list = await docker.listImages();
  const exists = list.some(image =>
    image.RepoTags && image.RepoTags.includes(tagName));

  if (!exists) {
    await build({name, version});
  } else {
    log.debug('image exists');
  }

  log.debug('starting container');
  docker.run(tagName, [], null, {
    name: tagName.replace(/[\/:]/g, '.'),
    HostConfig: {
      AutoRemove: true,
      NetworkMode: 'host', // TODO
      // expose app run folder to host, we are hosting the js bundle here
      Binds: [`${runDir}:/app/run`]
    },
    Labels: {
      'transitive-type': 'capability'
    }
  });
};

/** stop the container for the given version of the given package name */
const stop = async ({name, version}) => {
  const containerName = `${name}_${version}`;
  log.debug('stopping', containerName);
  const list = await docker.listContainers({filters: {name: [containerName]}});
  if (list.length > 0) {
    await docker.getContainer(list[0].Id).stop();
  }
};

module.exports = { ensureRunning, stop, RUN_DIR };
