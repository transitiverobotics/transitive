const { Tail } = require('tail');
const fs = require('fs');
const _ = require('lodash');

const { getLogger } = require('@transitive-sdk/utils');
const log = getLogger('logMonitor.js');
log.setLevel('info');

const WAIT_TIME_IN_CASE_OF_ERROR = 5000; // 5 seconds

/** Translate log level into a numeric value. */
const getLogLevelValue = (levelName) => {
  const levels = {
    'DEBUG': 10,
    'INFO': 20,
    'WARN': 30,
    'WARNING': 30,
    'ERROR': 40,
    'CRITICAL': 50,
  }
  return levels[levelName.toUpperCase()] || 20; // default to INFO if not found
};

/** Get the currently configured level of logging for the given package name
 * or the global one if not specified. Defaults to 'ERROR' if not set. */
const getMinLogLevel = (packageName) => {
  const globalMinLogLevel = _.get(global.config, 'global.minLogLevel', 'ERROR');
  return (packageName === 'robot-agent' ? globalMinLogLevel
    : _.get(global.config, `${packageName}.minLogLevel`, globalMinLogLevel)
  );
};

/** LogMonitor handles log monitoring and uploading.
  * Watches log files for specific packages, processes new log entries,
  * uploads logs to the cloud via MQTT. Keeps track of pending logs
  * and ensures logs are uploaded at regular intervals.
**/
class LogMonitor {
  constructor() {
    this.mqttClient = null;
    this.mqttSync = null;
    this.AGENT_PREFIX = null;
    this.watchedPackages = {}; // Store watched packages and data
    this.pendingLogs = []; // Array to store pending logs
    this.initialized = false;
    this.uploadNextLogsTimer = null;
    this.lastLogTimestamp = 0; // Timestamp of the last log sent
  }

  /**
   * Initializes the LogMonitor instance.
   * @param {Object} mqttClient - MQTT client instance for publishing logs.
   * @param {Object} mqttSync - MQTT sync object to listen for log level changes.
   * @param {string} agentPrefix - Topic prefix for logs publishing.
   */
  init(mqttClient, mqttSync, agentPrefix){
    this.mqttClient = mqttClient;
    this.mqttSync = mqttSync;
    this.AGENT_PREFIX = agentPrefix;
    this.mqttSync.subscribe(`${this.AGENT_PREFIX}/info`);
    this.mqttSync.data.subscribePathFlat(`${this.AGENT_PREFIX}/info/config`, () => {
      // Update minLogLevel for all watched packages
      Object.keys(this.watchedPackages).forEach(packageName => {
        const minLogLevel = getMinLogLevel(packageName);
        if (this.watchedPackages[packageName].minLogLevel === minLogLevel)
          return; // No change in minLogLevel
        log.info('Updating minLogLevel for', packageName, 'from',
          this.watchedPackages[packageName].minLogLevel,
          'to', minLogLevel
        );
        this.watchedPackages[packageName].minLogLevel = minLogLevel;
        this.watchedPackages[packageName].minLogLevelValue = getLogLevelValue(minLogLevel);
      });
    });
    this.mqttSync.subscribe(`${this.AGENT_PREFIX}/lastLogTimestamp`);
    this.mqttSync.publish(`${this.AGENT_PREFIX}/lastLogTimestamp`);
    this.mqttSync.waitForHeartbeatOnce(() => {
      log.info('LogMonitor heartbeat received, initializing...');
      this.lastLogTimestamp = this.mqttSync.data.getByTopic(
        `${this.AGENT_PREFIX}/lastLogTimestamp`
      ) || 0; // Get last log timestamp or default to 0
      this.initialized = true; // Set initialized state
      log.info('Starting watching logs for packages registered before initialization');
      _.forEach(this.watchedPackages, (packageData, packageName) => {
        if( !packageData.initialized) {
          this.watchLogs(packageName); // Start watching logs for the package
        }
      });
      this.restartUploadingLogs(); // Start the log uploading process
    });
  }

  /**
   * Watches logs for a specific package and starts processing them.
   * Reads existing logs and tails the log file for new entries.
   * @param {string} packageName - Name of the package to watch logs for.
   */
  watchLogs(packageName) {
    const watchedPackage = this.watchedPackages[packageName];
    if (watchedPackage) {
      if (watchedPackage.initialized) {
        log.info('Package is already being watched:', packageName);
        return; // Already watching this package
      }      
    } else {
      log.info('Adding package to watch list:', packageName);
      this.watchedPackages[packageName] = {
        initialized: false,
      }
    }
    if (!this.initialized) {
      log.warn('LogMonitor not initialized yet, will wait for initialization before watching logs for', packageName);
      return; // Wait until initialized
    }

    const filePath = (packageName === 'robot-agent') ?
      `${process.env.HOME}/.transitive/agent.log` :
      `${process.env.HOME}/.transitive/packages/${packageName}/log`;
    
    if (!fs.existsSync(filePath)) {
      log.warn('Log file does not exist yet for package:', packageName, 'at path:', filePath);
      setTimeout(() => {
        this.watchLogs(packageName); // Retry watching logs after a delay
      }, 5000); // Retry after 5 seconds
      log.debug('Waiting for log file to be created:', filePath);
      return; // Log file does not exist yet, wait for it to be created
    }

    const minLogLevel = getMinLogLevel(packageName);
    const minLogLevelValue = getLogLevelValue(minLogLevel);
    this.watchedPackages[packageName].minLogLevel = minLogLevel;
    this.watchedPackages[packageName].minLogLevelValue = minLogLevelValue;
    
    log.debug('Watching logs for package:', packageName, 'at path:', filePath,
      ' with: ', { filePath, minLogLevel, minLogLevelValue }
    );

    const fileContent = fs.readFileSync(filePath, { encoding: 'utf8' });
    const lines = fileContent.split('\n');
    for (const line of lines) {
      const logObject = this.parseLogLine(line, packageName);
      if (!logObject) continue; // skip lines that are not valid log lines
      const { timestamp } = logObject;
      if (!timestamp) {
        log.warn('Skipping log line without timestamp:', line);
        continue; // skip lines without a timestamp
      }
      // Convert timestamp to milliseconds
      if (timestamp < this.lastLogTimestamp) {
        continue; // skip logs older than the last sent log
      }
      this.pendingLogs.push({ logObject, packageName });
    }

    this.watchedPackages[packageName].initialized = true; // Mark as initialized
  
    this.restartUploadingLogs(); // Start the log uploading process
    const tail = new Tail(filePath);
    this.watchedPackages[packageName].tail = tail; // Store the tail instance for later use
  
    tail.on('line', async (line) => {
      const logObject = this.parseLogLine(line, packageName);
      if (!logObject) return; // skip lines that are not valid log lines
      this.pendingLogs.push({ logObject, packageName });
      this.restartUploadingLogs(); // Start uploading process if it's not already running
    });

    tail.on('error', (error) => {
      log.error('Error tailing log file:', filePath, error.message);
    });

    tail.on('close', () => {
      log.info('Stopped tailing log file:', filePath);
      // Remove from watched packages on close
      this.stopWatchingLogs(packageName);
    });

    log.info('Started tailing log file:', filePath);
  }

  /**
   * Stops watching logs for a specific package.
   * Unwatches the log file and removes the package from the watched list.
   * @param {string} packageName - Name of the package to stop watching logs for.
   */
  stopWatchingLogs(packageName) {
    const watchedPackage = this.watchedPackages[packageName];
    if (!watchedPackage) {
      log.warn('Package is not being watched:', packageName);
      return; // Not watching this package
    }
    if (watchedPackage.tail) {
      watchedPackage.tail.unwatch(); // Stop tailing the log file
      log.info('Stopped watching logs for package:', packageName);
    } else {
      log.warn('No tail instance found for package:', packageName);
    }
    delete this.watchedPackages[packageName]; // Remove from watched packages
  }

  /**
   * Parses a log line into a structured log object.
   * Filters logs based on minimum log level.
   * @param {string} line - Log line to parse.
   * @param {string} packageName - Name of the package.
   * @returns {Object|null} - Parsed log object or null if invalid.
   */
  parseLogLine(line, packageName) {
    if (!line.startsWith('[')) return;
    if (!_.get(this.watchedPackages, packageName)) {
      log.warn('Package is not being watched:', packageName,
        'Log line will not be parsed:', line);
      return null; // Skip if package is not being watched
    }

    // Remove the leading '[' and split by spaces
    const endBracketIdx = line.indexOf(']');
    if (endBracketIdx === -1) return null;

    const header = line.slice(1, endBracketIdx);
    const message = line.slice(endBracketIdx + 2); // skip "] "

    // Ensure both header and message are present
    if (!header || !message) return null;

    const parts = header.split(' ');
    // Ensure there are at least 3 parts (timestamp, module, level)
    if (parts.length < 3) return null;

    const [dateTime, moduleName, level] = parts;
    // Ignore logs produced by this module

    if (moduleName === log.name) return null;

    // Ensure all parts are present
    if (!dateTime || !moduleName || !level) return null;

    const timestamp = new Date(dateTime).getTime();
    if (isNaN(timestamp)) {
      log.warn('Invalid timestamp in log line:', dateTime, 'in line:', line);
      return null; // Skip invalid timestamps
    }

    const logLevelValue = getLogLevelValue(level);
    const minLogLevelValue = this.watchedPackages[packageName].minLogLevelValue;

    // Skip logs below the minimum log level
    if (logLevelValue < minLogLevelValue) return null;
    const logObject = { timestamp, module: moduleName, level, logLevelValue, message };
    return logObject;
  }

  restartUploadingLogs(nextTimeOut = 0) {
    if (!this.uploadNextLogsTimer) {
      log.debug('Restarting log upload process in', nextTimeOut, 'ms');
      this.uploadNextLogsTimer = setTimeout(() => {
        this.uploadNextPendingLogs(); // Start processing the next log
      }, nextTimeOut); // Start immediately
    }
  }

  /**
   * Uploads the next pending log to the cloud.
   * Retries failed uploads and updates the last log timestamp.
   */
  async uploadNextPendingLogs() {
    if (this.pendingLogs.length === 0) {
      log.debug('No pending logs to process');
      this.uploadNextLogsTimer = null;
      return;
    }

    if (!this.initialized) {
      log.debug('LogMonitor not initialized yet, waiting...');
      return; // Wait until initialized
    }

    let nextTimeOut = 0;
    const pendingLog = this.pendingLogs.shift(); // Get the first pending log
    const {logObject, packageName} = pendingLog;

    try {
      await this.publishLogAsJson(logObject, packageName);
      this.mqttSync.data.update(`${this.AGENT_PREFIX}/lastLogTimestamp`, logObject.timestamp);
      log.debug('Published log:', logObject, 'for package:', packageName);
    } catch (err) {
      log.debug('Failed to publish log:', logObject, 'Error:', err.message);
      log.debug('Will retry uploading this log in ', WAIT_TIME_IN_CASE_OF_ERROR, 'ms');
      // If an error occurs, we want to retry processing this log after a delay
      // Re-add the log to the front of the queue:
      this.pendingLogs.unshift(pendingLog);
      nextTimeOut = WAIT_TIME_IN_CASE_OF_ERROR; // Retry after the defined interval
    }
    this.uploadNextLogsTimer = null;
    if (this.pendingLogs.length === 0) {
      log.debug('No pending logs to process');
      return;
    }
    this.restartUploadingLogs(nextTimeOut); // Restart the log uploading process
    log.debug('Scheduled next log upload in', nextTimeOut, 'ms');
  }

  /**
   * Publishes a log object as JSON to the MQTT topic.
   * @param {Object} logObject - Log object to publish.
   * @param {string} packageName - Name of the package.
   * @returns {Promise} - Resolves when the log is published.
   */
  async publishLogAsJson(logObject, packageName){
    const logTopic = (packageName === 'robot-agent') ?
      `${this.AGENT_PREFIX}/logs/agent` :
      `${this.AGENT_PREFIX}/logs/capabilities/${packageName}`;

    const logJson = JSON.stringify(logObject);
    return new Promise((resolve, reject) => {
      this.mqttClient.publish(logTopic, logJson, { qos: 2 }, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

const logMonitor = new LogMonitor();

module.exports = logMonitor;