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

let watcher;

// Wait for the file to exist before using it
// This is useful for VI or other editors that creates a new file
// on save, which can cause the watcher to trigger before the file is ready
// to be read.
const waitForFile = (filePath, callback) => {
  const interval = setInterval(() => {
    if (fs.existsSync(filePath)) {
      clearInterval(interval);
      callback();
    }
  }, 500);
};

const startWatchingConfig = () => {
  if (watcher) {
    watcher.close();
    console.log('Previous watcher closed.');
  }

  waitForFile('./config.json', () => {
    try {
      watcher = fs.watch('./config.json', { persistence: false }, (eventType, filename) => {
        console.log('config.json changed');
        waitForFile('./config.json', () => {
          refreshGlobalConfigFromFile();
        });
        startWatchingConfig(); // Restart the watcher
      });

      console.log('Started watching config.json');
    } catch (err) {
      console.error('Error setting up watcher:', err);
    }
  });
};

startWatchingConfig();

/** Set the `key` in the fleet config to `value` */
const updateFleetConfig = (key, value) => fleetConfig[key] = value;

/** Return config value if present, else fall back to fleetConfig */
const getConfig = (key) =>
  global.config.hasOwnProperty(key)
  ? global.config[key]
  : fleetConfig[key];

module.exports = { updateFleetConfig, getConfig };