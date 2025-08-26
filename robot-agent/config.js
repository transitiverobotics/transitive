const fs = require('fs');
const dotenv = require('dotenv');
const _ = require('lodash');
const { clone, getLogger } = require('@transitive-sdk/utils');
const { getInstalledPackages, updatePackageConfigFile } = require('./utils');

const log = getLogger('config.js');
log.setLevel('info');

dotenv.config({path: './.env'});
dotenv.config({path: './.env_user'});

global.config = {};
const fleetConfig = {};

const refreshGlobalConfigFromFile = _.debounce(() => {
  log.info('Reloading config.json');

  try {
    global.config = JSON.parse(fs.readFileSync('./config.json', {encoding: 'utf8'}));
    log.info(`Using config: ${JSON.stringify(global.config)}`);

    const packages = getInstalledPackages();
    // generate config.json for each package
    packages.forEach(updatePackageConfigFile);
    // update the config in the fleet data store
    if (global.data) {
      // update the config in the fleet data store
      log.debug(`Updating global config in ${global.AGENT_PREFIX}/info/config`);
      global.data.update(`${global.AGENT_PREFIX}/info/config`, clone(global.config));
    }
  } catch (e) {
    log.warn('No config.json file found or not valid JSON, proceeding without.');
  }
}, 100);

refreshGlobalConfigFromFile();

fs.watch('./', { persistence: false }, (eventType, filename) => {
  if (filename !== 'config.json') {
    return;
  }
  // check if the file exists, eventType == 'rename' triggers when the file is
  // created or deleted but we only want to reload if the file is changed or
  // created
  if (eventType == 'rename' && !fs.existsSync('./config.json')) {
    return;
  }

  refreshGlobalConfigFromFile();
});

/** Set the `key` in the fleet config to `value` */
const updateFleetConfig = (key, value) => fleetConfig[key] = value;

/** Return config value if present, else fall back to fleetConfig */
const getConfig = (key) =>
  global.config.hasOwnProperty(key)
  ? global.config[key]
  : fleetConfig[key];

module.exports = { updateFleetConfig, getConfig };