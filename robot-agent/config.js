const fs = require('fs');
const dotenv = require('dotenv');
const { clone } = require('@transitive-sdk/utils');
const { getInstalledPackages, updatePackageConfigFile } = require('./utils');

dotenv.config({path: './.env'});
dotenv.config({path: './.env_user'});

global.config = {};
const fleetConfig = {};

const refreshGlobalConfigFromFile = () => {
  try {
    global.config = JSON.parse(fs.readFileSync('./config.json', {encoding: 'utf8'}));
    console.log(`Using config:\n${JSON.stringify(global.config, true, 2)}`);
    const packages = getInstalledPackages();
    // generate config.json for each package
    packages.forEach(updatePackageConfigFile);
    // update the config in the fleet data store
    if (global.data) {
      // update the config in the fleet data store
      console.log(`Updating global config in ${global.AGENT_PREFIX}/info/config`);
      global.data.update(`${global.AGENT_PREFIX}/info/config`, clone(global.config));
    }
  } catch (e) {
    console.log('No config.json file found or not valid JSON, proceeding without.');
  }
};
refreshGlobalConfigFromFile();

fs.watch('./', { persistence: false }, (eventType, filename) => {
  if (filename !== 'config.json') {
    return;
  }
  // check if the file exists, eventType == 'rename' triggers when the file is created or deleted
  // but we only want to reload if the file is changed or created
  if (eventType == 'rename' && !fs.existsSync('./config.json')) {
    return;
  }        
  console.log('config.json changed, reloading...');
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