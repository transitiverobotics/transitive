const fs = require('fs');
const dotenv = require('dotenv');
const { clone } = require('@transitive-sdk/utils');

dotenv.config({path: './.env'});
dotenv.config({path: './.env_user'});

global.config = {};
const fleetConfig = {};

const refreshGlobalConfigFromFile = () => {
  try {
    global.config = JSON.parse(fs.readFileSync('./config.json', {encoding: 'utf8'}));
    console.log(`Using config:\n${JSON.stringify(global.config, true, 2)}`);
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

fs.watchFile('./config.json', { interval: 500 }, (curr, prev) => {
  if (curr.mtime !== prev.mtime) {
    console.log('config.json changed, updating global config');
    refreshGlobalConfigFromFile();
  }
});

/** Set the `key` in the fleet config to `value` */
const updateFleetConfig = (key, value) => fleetConfig[key] = value;

/** Return config value if present, else fall back to fleetConfig */
const getConfig = (key) =>
  global.config.hasOwnProperty(key)
  ? global.config[key]
  : fleetConfig[key];

module.exports = { updateFleetConfig, getConfig };