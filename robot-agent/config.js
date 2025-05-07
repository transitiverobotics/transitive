const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({path: './.env'});
dotenv.config({path: './.env_user'});

global.config = {};
const fleetConfig = {};

const configChangeHandlers = [];

const refreshGlobalConfig = () => {
  try {
    global.config = JSON.parse(fs.readFileSync('./config.json', {encoding: 'utf8'}));
    console.log(`Using config:\n${JSON.stringify(global.config, true, 2)}`);
    // Notify all handlers of the config change
    configChangeHandlers.forEach(handler => handler(global.config));
  } catch (e) {
    console.log('No config.json file found or not valid JSON, proceeding without.');
  }
};
refreshGlobalConfig();

fs.watch('./config.json', {interval: 1000}, (curr, prev) => {
  console.log('Reloading config.json');
  refreshGlobalConfig();
});

/** Set the `key` in the fleet config to `value` */
const updateFleetConfig = (key, value) => fleetConfig[key] = value;

/** Return config value if present, else fall back to fleetConfig */
const getConfig = (key) =>
  global.config.hasOwnProperty(key)
  ? global.config[key]
  : fleetConfig[key];

const registerConfigChangeHandler = (handler) => {
  configChangeHandlers.push(handler);
}

module.exports = { updateFleetConfig, getConfig, registerConfigChangeHandler };