const { Tail } = require('tail');
const fs = require('fs');
const _ = require('lodash');

const { getLogger } = require('@transitive-sdk/utils');
const log = getLogger('logMonitor.js');
log.setLevel('info');

const WAIT_TIME_IN_CASE_OF_ERROR = 5000; // 5 seconds
const MAX_LOGS_PER_BATCH = 5; // Maximum number of logs to upload in one go

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
      this.startUploadingLogs(); // Start the log uploading process
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
      this.pendingLogs.push(logObject);
    }

    this.watchedPackages[packageName].initialized = true; // Mark as initialized
  
    this.startUploadingLogs(); // Start the log uploading process
    const tail = new Tail(filePath);
    this.watchedPackages[packageName].tail = tail; // Store the tail instance for later use
  
    tail.on('line', async (line) => {
      const logObject = this.parseLogLine(line, packageName);
      if (!logObject) return; // skip lines that are not valid log lines
      this.pendingLogs.push(logObject);
      this.startUploadingLogs(); // Start uploading process if it's not already running
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
    const logObject = { 
      timestamp,
      module: moduleName,
      level,
      logLevelValue,
      message,
      package: packageName
    };
    return logObject;
  }

  /**
   * Starts the log uploading process if not already running.
   */
  startUploadingLogs(delay = 0) {
    if (!this.uploadNextLogsTimer) {
      log.debug('Starting log upload process in', delay, 'ms');
      this.uploadNextLogsTimer = setTimeout(async () => {
        await this.uploadPendingLogs();
      }, delay);
    }
  }

  /**
   * Clears the log upload timer if it exists.
   */
  clearUploadLogsTimer() {
    if (this.uploadNextLogsTimer) {
      clearTimeout(this.uploadNextLogsTimer);
      this.uploadNextLogsTimer = null; // Reset the timer
      log.debug('Cleared log upload timer');
    }
  }

  /**
   * Uploads the next pending logs to the cloud.
   * Retries failed uploads and updates the last log timestamp.
   */
  async uploadPendingLogs() {
    if (!this.initialized) {
      log.debug('LogMonitor not initialized yet, waiting...');
    } else {
      let logCount = 0;
      log.debug('Starting to upload pending logs, count:', this.pendingLogs.length);      
      while (this.pendingLogs.length > 0) {
        const logsToUpload = this.pendingLogs.slice(0, MAX_LOGS_PER_BATCH);
        this.pendingLogs = this.pendingLogs.slice(MAX_LOGS_PER_BATCH);
        try {
          await this.publishLogsAsJson(logsToUpload);
          this.mqttSync.data.update(`${this.AGENT_PREFIX}/lastLogTimestamp`, logsToUpload[logsToUpload.length - 1].timestamp);
          log.debug('Published logs:', logsToUpload);
          logCount += logsToUpload.length;
        } catch (err) {
          log.debug('Failed to publish ', logsToUpload.length, 'logs:', err.message);
          log.debug('Will retry uploading this logs in ', WAIT_TIME_IN_CASE_OF_ERROR, 'ms');
          // If an error occurs, we want to retry processing this log after a delay
          // Re-add the log to the front of the queue:
          this.pendingLogs = logsToUpload.concat(this.pendingLogs);
          this.clearUploadLogsTimer(); // Clear the timer before scheduling a retry
          this.startUploadingLogs(WAIT_TIME_IN_CASE_OF_ERROR); // Retry the log uploading process
          return; // Exit the function to wait for the retry
        }
      }
      log.debug('Uploaded', logCount, 'logs successfully.');
    }
    this.clearUploadLogsTimer(); // Clear the timer after processing all logs
  }

  /**
   * Publishes logs as JSON to the MQTT broker.
   * @param {Array} logs - Array of log objects to publish.
   * @returns {Promise} - Resolves when the log is published.
   */
  async publishLogsAsJson(logs){
    const strMsg = JSON.stringify(logs);
    return new Promise((resolve, reject) => {
      this.mqttClient.publish(`${this.AGENT_PREFIX}/logs` , strMsg, { qos: 2 }, (err) => {
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