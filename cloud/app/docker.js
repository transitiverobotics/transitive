const fs = require('fs');
const os = require('os');
const dns = require('dns');
const path = require('path');
const { execSync } = require('child_process');
const Docker = require('dockerode');
const fetch = require('node-fetch');
const _ = require('lodash');
const { getLogger } = require('@transitive-sdk/utils');

const { getNextInRange } = require('./utils');

const RUN_DIR = `/run/user/${process.getuid()}/transitive/caps`;
// const REGISTRY = process.env.TR_REGISTRY || '172.17.0.1:6000';
// const REGISTRY_HOST = REGISTRY.split(':')[0];
const REGISTRY_HOST = '172.17.0.1';

// window of port numbers from which to give out ports to cap containers
const EXPOSED_PORT_WINDOW = [11000, 25000];
// Note: 30000 - 40000 currently given to turnserver in our cloud

const log = getLogger('docker.js');
log.setLevel('debug');

const docker = new Docker();

/** lookup IP of mqtt server */
// const MQTT_URL = process.env.MQTT_URL || 'mqtts://localhost';
// const mqttURL = new URL(MQTT_URL);
// let mosquittoIP;
// dns.resolve(mqttURL.hostname, (err, results) =>
//   !err && results && (mosquittoIP = results[0]));


/** Ensure the given version of the given package is running. If not, start
  it in a docker container. */
const ensureRunning = async ({name, version}) => {
  const list = await docker.listContainers();
  const isRunning = list.some(cont => cont.Image == getTagName({name, version}));
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
  const pkgFolder = `node_modules/${name}/`;

  fs.writeFileSync(path.join(dir, 'package.json'),
    JSON.stringify(packageJson, true, 2));

  // generate .npmrc
  fs.writeFileSync(path.join(dir, '.npmrc'),
    `@transitive-robotics:registry=http://registry:6000\n`);
  // this is what it will be called inside the docker container started here
  // by dockerrode; see extrahosts below to see where it points.

  fs.writeFileSync(path.join(dir, '.dockerignore'), [
      'node_modules',
      'Dockerfile'
    ].join('\n'));

  fs.writeFileSync(path.join(dir, 'run.sh'), [
      `cp -a /app/${pkgFolder}/dist /app/${pkgFolder}/package.json /app/run`,
      // this ^ will be used by cloud-agent to serve capability's web components
      `cd /app/${pkgFolder}/`,
      'exec npm run cloud'
    ].join(' && '));

  // generate Dockerfile
  const certsFolder = `${pkgFolder}/cloud/certs`;
  const externalIp = await dns.promises.lookup(process.env.HOST, {family: 4});
  log.debug({externalIp});
  fs.writeFileSync(path.join(dir, 'Dockerfile'), [
      'FROM node:16',
      'RUN apt-get update',
      'COPY * /app/',
      'WORKDIR /app',
      `ENV HOST=${process.env.HOST}`,
      `ENV EXTERNAL_IP=${externalIp.address}`,
      'ENV TRANSITIVE_IS_CLOUD=1',
      'RUN npm install',
      `RUN mkdir ${certsFolder}`,
      `RUN ln -s /app/client.crt ${certsFolder}`,
      `RUN ln -s /app/client.key ${certsFolder}`,
      `RUN chmod +x /app/run.sh`,
      'CMD ["./run.sh"]'
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
        'package.json', '.npmrc', '.dockerignore', 'run.sh']
    }, {
      networkmode: 'host', // #DEBUG,
      extrahosts: `registry:${REGISTRY_HOST}`,
      t: tagName
    });
  stream.on('data', chunk =>
    log.debug(JSON.parse(chunk.toString()).stream?.trim()));
  await new Promise((resolve, reject) => {
    docker.modem.followProgress(stream,
      (err, res) => {
        log.debug('result from building image', err, res);
        return err ? reject(err) : resolve(res);
      });
  });
  log.debug('done building');
};

const portsUsedByUs = [];
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

  const pkgInfo = await (
      await fetch(`http://${REGISTRY_HOST}:6000/${encodeURIComponent(name)}`))
      .json();
  const ports = pkgInfo.versions[version]?.transitiverobotics?.ports || 1;
  ports > 100 && log.warn(`${name}:${version} is requesting ${ports} ports!`);

  const exposedPorts = ports > 0 && await allocatePorts(ports);

  const devNull = fs.createWriteStream('/dev/null');
  log.debug('starting container for', tagName, 'ports:', exposedPorts);

  const HostConfig = {
    AutoRemove: true,
    // expose app run folder to host, we are hosting the js bundle here
    Binds: [
      `${runDir}:/app/run`,
      `${process.env.TR_VAR_DIR}/caps/common:/persistent/common`,
      `${process.env.TR_VAR_DIR}/caps/${name}:/persistent/self`,
    ],
    // ExtraHosts: ["host.docker.internal:host-gateway"]
    // ExtraHosts: [`mqtt:${mosquittoIP || 'host-gateway'}`]
    // ExtraHosts: ['mqtt:host-gateway'],
    NetworkMode: 'cloud_caps',
    Init: true, // start an init process that reaps zombies, e.g., sshd's
  };

  let ExposedPorts;
  if (exposedPorts) {
    // the first exposed port always maps to port 1000 inside the container
    HostConfig.PortBindings = {
      "1000/tcp": [{"HostPort": String(exposedPorts.min)}],
      "1000/udp": [{"HostPort": String(exposedPorts.min)}]
    };
    ExposedPorts = {
      '1000/tcp': {},
      '1000/udp': {}
    };
    // Any additionally requested ports map 1:1. This is necessary because the
    // application running inside the container may need to share those ports
    // with clients to be reach at.
    for (let port = exposedPorts.min + 1; port <= exposedPorts.max; port++) {
      HostConfig.PortBindings[`${port}/tcp`] = [{"HostPort": String(port)}];
      HostConfig.PortBindings[`${port}/udp`] = [{"HostPort": String(port)}];
      ExposedPorts[`${port}/tcp`] = {};
      ExposedPorts[`${port}/udp`] = {};
    }
  }

  docker.run(tagName, [], devNull, {
      name: tagName.replace(/[\/:]/g, '.'),
      Env: [
        `MQTT_URL=${process.env.MQTT_URL}`,
        `PUBLIC_PORT=${exposedPorts.min}`,
        `MIN_PORT=${exposedPorts.min + 1}`,
        `MAX_PORT=${exposedPorts.max}`,
      ],
      ExposedPorts,
      HostConfig,
      Labels: {
        'transitive-type': 'capability'
      }
    }, (err, data, container) => {
      log.debug(tagName, 'ended:', err, data?.StatusCode);
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

/** allocate public ports that are not yet already in use by docker containers */
const allocatePorts = async (count = 1) => {
  const list = await docker.listContainers();
  const allPorts = list.map(c => c.Ports).flat();
  const ports = allPorts.map(port => port.PublicPort);
  const set = new Set(ports.concat(portsUsedByUs));

  const inUse = Array.from(set).filter(p => p !== undefined);
  const rtv = getNextInRange(inUse, EXPOSED_PORT_WINDOW, count);
  if (rtv) {
    // add the newly allocatd port to the list of used ones
    const enumerated = _.range(rtv.min, rtv.max+1);
    portsUsedByUs.splice(portsUsedByUs.length, 0, ...enumerated);
  }

  return rtv;
};

module.exports = { ensureRunning, stop, RUN_DIR };
