/**
  Upstream part of MQTT bridge
    - connect to upstream mqtt broker (using private certificates)

  - relay messages between the two in a package-aware way

    The order in which we do things is important:
    - connect upstream
    - clear upstream
    - register upstream listener
    - create local (aedes)
    - subscribe to upstream topics

  For local part see localMQTT.js.
*/


// ---------------------------------------------------------------------------
// Upstream

const fs = require('fs');
const os = require('os');

const assert = require('assert');
const mqtt = require('mqtt');
const { exec } = require('child_process');
const _ = require('lodash');

const { parseMQTTTopic, mqttClearRetained, MqttSync, getLogger,
  loglevel, clone, getPackageVersionNamespace } = require('@transitive-sdk/utils');

const { handleAgentCommand, commands } = require('./commands');
const { ensureDesiredPackages, watchStatus } = require('./utils');
const { startLocalMQTTBroker } = require('./localMQTT');
const { updateFleetConfig } = require('./config');
const { executeSelfChecks } = require('./selfChecks');
const logMonitor = require('./logMonitor');
const resourceMonitor = require('./resourceMonitor');

const log = getLogger('mqtt.js');
log.setLevel('info');
// loglevel.setAll('debug');

const versionNS = getPackageVersionNamespace();

// TODO: get this from utils
const HEARTBEAT_TOPIC = '$SYS/broker/uptime';

let data;

// prefix for all our mqtt topics, i.e., our namespace
const PREFIX = `/${process.env.TR_USERID}/${process.env.TR_DEVICEID}`;
const version = process.env.npm_package_version;
const CAP_NAME = '@transitive-robotics/_robot-agent'
const AGENT_PREFIX = `${PREFIX}/${CAP_NAME}/${version}`; // not yet using versionNS!
const FLEET_PREFIX = `/${process.env.TR_USERID}/_fleet/${CAP_NAME}/${versionNS}`;
const MQTT_HOST = `mqtts://data.${process.env.TR_HOST.split(':')[0]}`;
log.debug('using', {AGENT_PREFIX, MQTT_HOST});
assert(version, 'env var npm_package_version is required');

const subOptions = {rap: true};

// connect to upstream mqtt server
const mqttClient = mqtt.connect(MQTT_HOST, {
  key: fs.readFileSync('certs/client.key'),
  cert: fs.readFileSync('certs/client.crt'),
  rejectUnauthorized: false,
  protocolVersion: 5 // needed for the `rap` option, i.e., to get retain flags
});

mqttClient.on('error', (...args) => log.warn('mqtt error', ...args));
mqttClient.on('disconnect', (...args) => log.warn('mqtt disconnect', ...args));

let initialized = false;
let mqttSync;
mqttClient.on('connect', function(connackPacket) {
  log.info(`${initialized ? 're-' : ''}connected to upstream mqtt broker`);

  if (!mqttSync) {
    mqttSync = new MqttSync({mqttClient,
      migrate: [
        { topic: `${AGENT_PREFIX}/desiredPackages`, newVersion: version },
        { topic: `${AGENT_PREFIX}/cloudStatus`, newVersion: version, flat: true },
      ],
      onReady: () => {
        log.info('migration complete');

        mqttSync.subscribe(`${AGENT_PREFIX}/desiredPackages`, (err) => {
          if (err) {
            log.warn('Failed to subscribe to desiredPackages:', err,
              'Not changing installed packages for now.', new Date());
            return;
          }

          log.info('waiting for heartbeat from upstream');
          mqttSync.waitForHeartbeatOnce(() => {
            log.info('got heartbeat');
            ensureDesiredPackages(
              mqttSync.data.getByTopic(`${AGENT_PREFIX}/desiredPackages`));
            mqttSync.data.subscribePath(`${AGENT_PREFIX}/desiredPackages`,
              (value, key) => ensureDesiredPackages(value));
            // ready to install packages
            mqttSync.data.update(`${AGENT_PREFIX}/status/ready`, true);
          });
        });

        mqttSync.subscribe(`${AGENT_PREFIX}/cloudStatus`, (err) => {
          if (err) {
            log.warn('Failed to subscribe to cloudStatus', err);
            return;
          }
          mqttSync.waitForHeartbeatOnce(startMonitoring);
        });

        // subscribe to _fleet config
        mqttSync.subscribe(`${FLEET_PREFIX}/config`, (err) => {
          err && log.warn('failed to subscribe to fleet config', err);
        });
        mqttSync.data.subscribePath(`${FLEET_PREFIX}/config/+key`,
          (value, topic, {key}) => {
            log.info('got fleet config update:', key, value);
            updateFleetConfig(key, value);
          });
      }
    });
  } else {
    // send a new heartbeat right away
    heartbeat();
  }

  // TODO: somehow make this part of DataCache and/or a stronger notion of a
  // "publication", of which this may be a "clear on start" functionality
  const allVersionsPrefix = `${PREFIX}/${CAP_NAME}`;
  !initialized && mqttClearRetained(mqttClient,
    [`${allVersionsPrefix}/+/info`, `${allVersionsPrefix}/+/status`], () => {

      data = mqttSync.data;
      global.data = data; // #hacky; need this in commands.js
      global.AGENT_PREFIX = AGENT_PREFIX;

      mqttSync.publish(`${AGENT_PREFIX}/info`, {atomic: true});
      mqttSync.publish(`${AGENT_PREFIX}/status`);

      // for ongoing ping checking (not to be confused with ping RPC command)
      mqttSync.subscribe(`${AGENT_PREFIX}/client/ping`);
      mqttSync.data.subscribePath(`${AGENT_PREFIX}/client/ping`, ping => {
        log.debug(`ping: ${ping}`);
        mqttSync.data.update(`${AGENT_PREFIX}/status/pong`,
          {ping, pong: Date.now()});
      });

      staticInfo();
      heartbeat();
      setInterval(heartbeat, 60 * 1e3);

      mqttClient.on('message', (topic, payload, packet) => {
        // log.debug(`upstream mqtt, ${topic}:`, payload, packet.retain);
        // relay the upstream message to local
        if (topic == HEARTBEAT_TOPIC) {
          // relay heartbeat locally:
          localBroker && localBroker.publish(packet, () => {});
        } else {

          const parsedTopic = parseMQTTTopic(topic);
          // TODO: ensure no one tries to publish a capability with this name -> registry
          if (parsedTopic.capability != CAP_NAME) {
            // Not for us, relay it locally.
            // if (payload.length > 0) packet.retain = false;
            localBroker && localBroker.publish(packet, () => {});
          }
        }
      });

      const localBroker = startLocalMQTTBroker(mqttSync, PREFIX, AGENT_PREFIX,
        (error) => {
          log.error('Error starting local MQTT broker:', error);
          data.update(`${AGENT_PREFIX}/status/selfCheckErrors/mqttPortAvailable`,
            'Failed to start local MQTT broker on port 1883, please check if another process is using it.'
          );
        });

      // register all commands as RPCs
      _.forEach(commands, (cmdHandler, cmdName) => {
        const command = `${AGENT_PREFIX}/rpc/${cmdName}`;
        log.info(`registering ${command}`);
        mqttSync.register(command, cmdHandler);
      });

      getGeoIP();
      executeSelfChecks(data);

      initialized = true;
    });
});


/** Start monitoring: logs, resources, and capability's status.json */
const startMonitoring = () => {

  try {
    logMonitor.init(mqttSync, AGENT_PREFIX);
  } catch (err) {
    log.error('Failed to initialize log monitor:', err);
  }

  const handlePackageStartStop = (value, topic, {scope, capName}) => {
    const pkgName = `${scope}/${capName}`;

    if (!value || value === 'false') {
      log.info(`Package ${pkgName} stopped`);
      resourceMonitor.stopMonitoring(pkgName);
      logMonitor.stopWatchingLogs(pkgName);
      // We do *not* want to stop watching the status, because the capability
      // may just be restarting/upgrading.
    } else {
      log.info(`Package ${pkgName} started`);
      resourceMonitor.startMonitoring(pkgName);
      logMonitor.watchLogs(pkgName);
      watchStatus(pkgName);
    }
  };

  const topic = `${AGENT_PREFIX}/status/runningPackages/+scope/+capName/+version`;
  // start monitor already running packages
  mqttSync.data.forMatch(topic, handlePackageStartStop);
  // watch for start/stop events
  mqttSync.data.subscribePathFlat(topic, handlePackageStartStop);

  resourceMonitor.init(mqttSync, `${AGENT_PREFIX}/status/metrics`);
};

/** publish static info about this machine */
const staticInfo = () => {
  const info = {os: {
      hostname: process.env.TR_DISPLAYNAME || os.hostname(),
      release: os.release(),
      version: os.version(),
      networkInterfaces: os.networkInterfaces(),
      userInfo: os.userInfo(),
      timeZone: new Date().toTimeString().slice(9)
    },
    nodejs: process.versions,
  };

  process.env.TR_LABELS && (info.labels = process.env.TR_LABELS.split(','));
  global.config && (info.config = clone(global.config));
  // Note: need to clone, so that we can update it later again when
  // global.config changes. This is an unusual way to use mqttSync. Normally
  // the data in mqttSync is used directly and always updated directly.

  try {
    info.rosReleases = fs.readdirSync('/opt/ros').filter(name => name != 'rolling');
  } catch (e) {
    info.rosReleases = [];
  }

  // Check whether we are inside a docker container
  try {
    fs.accessSync('/.dockerenv');
    info.isDocker = true;
  } catch (e) {
    info.isDocker = false;
  }

  // Read device model file if available. It is on most arm boards.
  try {
    info.deviceModel = fs.readFileSync('/proc/device-tree/model', 'utf8')?.trim();
  } catch (e) {
    log.debug('no device model file found');
  }

  // placeholder for geo info
  info.geo = {};

  exec('lsb_release -a', (err, stdout, stderr) => {
    if (!err) {
      const output = stdout.trim();
      info.os.lsb_release = output;
      info.os.lsb = parseLsbRelease(output);
    }
    exec('dpkg --print-architecture', (err, stdout, stderr) => {
      !err && (info.os.dpkgArch = stdout.trim());
      data.update(`${AGENT_PREFIX}/info`, info);
    });
  });
};

/** Look up approximate location of this device using a geoip web service.
* Add to static data in mqttsync. */
const getGeoIP = async () => {
  // get geolocation and add to info
  try {
    const ipResponse = await fetch('https://api.ipify.org?format=json');
    if (ipResponse.ok) {
      const ipData = await ipResponse.json();
      log.debug('got IP info:', ipData);
      if (ipData.ip) {
      // use the IP address to get geo info
        const geoResponse = await fetch(`https://api.hackertarget.com/geoip/?q=${ipData.ip}&output=json`);
        if (geoResponse.ok) {
          const geo = await geoResponse.json();
          log.debug('got geo info:', geo);
          data.update(`${AGENT_PREFIX}/info/geo`, geo);
        }
      }
    }
  } catch (error) {
    log.warn('Error getting geoIP:', error);
  }
};

/** parse lsb_release info, e.g.,
'LSB Version:\tcore-11.1.0ubuntu2-noarch:security-11.1.0ubuntu2-noarch\nDistributor ID:\tUbuntu\nDescription:\tUbuntu 20.04.3 LTS\nRelease:\t20.04\nCodename:\tfocal'
*/
const parseLsbRelease = (string) => {
  const lines = string.split('\n');
  const rtv = {};
  lines.forEach(line => {
    const [field, value] = line.split('\t');
    // drop colon of field name, then add to rtv
    const name = field.slice(0, -1);
    rtv[name] = value;
    if (name == 'Release') {
      // also parse Release, e.g., 20.04 => major: 20, minor: 4
      const [major, minor] = value.split('.');
      rtv.major = Number(major);
      rtv.minor = Number(minor);
    }
  });
  return rtv;
};

const heartbeat = () => {
  data.update(`${AGENT_PREFIX}/status/heartbeat`, new Date());
};
