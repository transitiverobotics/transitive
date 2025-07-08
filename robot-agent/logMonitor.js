const { Tail } = require('tail');
const fs = require('fs');
const util = require('util');
const _ = require('lodash');

const { getLogger } = require('@transitive-sdk/utils');
const log = getLogger('logMonitor.js');
log.setLevel('info');

const WAIT_TIME_IN_CASE_OF_ERROR = 30000; // 30 seconds to wait before retrying failed uploads
const REGULAR_UPLOAD_INTERVAL = 10000; // 10 seconds to upload logs regularly
const MAX_LOGS_PER_BATCH = 50; // Maximum number of logs to upload in one go
const MAX_PENDING_LOGS = 100; // Maximum number of logs to keep pending

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
    this.mqttSync.publish(`${this.AGENT_PREFIX}/status/logs/lastLogTimestamp`);
    this.mqttSync.publish(`${this.AGENT_PREFIX}/status/logs/errorCount/#`);
    this.mqttSync.publish(`${this.AGENT_PREFIX}/status/logs/lastError/#`);

    this.mqttSync.waitForHeartbeatOnce(() => {
      log.info('LogMonitor heartbeat received, initializing...');
      this.lastLogTimestamp = this.mqttSync.data.getByTopic(
        `${this.AGENT_PREFIX}/status/logs/lastLogTimestamp`
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

    this.clearErrorCount(packageName); // Clear any existing upload timer for this package

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
      const { timestamp, level } = logObject;
      this.updateErrorCount(packageName, logObject); // Increment error logs count
      // Convert timestamp to milliseconds
      if (timestamp < this.lastLogTimestamp) {
        continue; // skip logs older than the last sent log
      }
      this.storePendingLog(logObject); // Store the log object in pending logs
    }

    this.watchedPackages[packageName].initialized = true; // Mark as initialized

    this.startUploadingLogs(); // Start the log uploading process
    const tail = new Tail(filePath);
    this.watchedPackages[packageName].tail = tail; // Store the tail instance for later use

    tail.on('line', async (line) => {
      const logObject = this.parseLogLine(line, packageName);
      if (!logObject) return; // skip lines that are not valid log lines
      this.updateErrorCount(packageName, logObject); // Increment error logs count
      this.storePendingLog(logObject); // Store the log object in pending logs
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
   * Stores a log object in the pending logs array.
   * If the pending logs limit is reached, it drops the oldest log.
   * @param {Object} logObject - Log object to store.
   */
  storePendingLog(logObject) {
    if (this.pendingLogs.length >= MAX_PENDING_LOGS) {
      log.warn('Pending logs limit reached, dropping oldest log:', this.pendingLogs[0]);
      this.pendingLogs.shift(); // Remove the oldest log if limit is reached
    }
    this.pendingLogs.push(logObject);
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
    line = util.stripVTControlCharacters(line);

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
    // Ensure all parts are present
    if (!dateTime || !moduleName || !level) return null;

    // Ignore logs produced by this module
    if (moduleName === log.name) return null;

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
      level: level.toUpperCase(),
      logLevelValue,
      message,
      package: packageName
    };
    return logObject;
  }

  /**
   * Starts the log uploading process if not already running.
   */
  startUploadingLogs(delay = REGULAR_UPLOAD_INTERVAL) {
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
      const logsToUpload = this.pendingLogs.slice(0, MAX_LOGS_PER_BATCH);
      if (logsToUpload.length > 0) {
        this.pendingLogs = this.pendingLogs.slice(MAX_LOGS_PER_BATCH);
        log.debug(`Preparing to upload ${logsToUpload.length} logs...`);
        try {
          await this.publishLogsAsJson(logsToUpload);
          this.mqttSync.data.update(`${this.AGENT_PREFIX}/status/logs/lastLogTimestamp`, logsToUpload[logsToUpload.length - 1].timestamp);
          log.debug(`Uploaded ${logsToUpload.length} logs successfully.`);
          log.debug(`Remaining pending logs: ${this.pendingLogs.length}`);
        } catch (err) {
          log.debug(`Failed to upload ${logsToUpload.length} logs:`, err);
          // If an error occurs, we want to retry processing this log after a delay
          // Re-add the log to the front of the queue:
          this.pendingLogs = logsToUpload.concat(this.pendingLogs);
          this.clearUploadLogsTimer(); // Clear the timer before scheduling a retry
          log.debug(`Will retry uploading these logs after ${WAIT_TIME_IN_CASE_OF_ERROR} ms.`);
          this.startUploadingLogs(WAIT_TIME_IN_CASE_OF_ERROR); // Retry the log uploading process
          return; // Exit the function to wait for the retry
        }
      }
      this.publishErrorCounts(); // Publish error counts for all watched packages
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
      this.mqttClient.publish(`${this.AGENT_PREFIX}/status/logs/live` , strMsg, { qos: 2 }, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /** Clears the error logs count for a specific package.
   * Also resets the last error log object for that package.
   * @param {string} packageName - Name of the package to clear error logs count for.
   */
  clearErrorCount(packageName) {
    if (!this.watchedPackages[packageName]) {
      log.warn('Package not being watched:', packageName, 'Cannot clear error logs count.');
      return; // Package is not being watched
    }
    log.info('Clearing error logs count for package:', packageName);
    this.watchedPackages[packageName].errorCount = 0; // Reset error count in watched packages
    this.watchedPackages[packageName].lastError = null; // Reset last error log object
  }

  /** Increments the error logs count for a specific package.
   * Also updates the last error log object for that package.
   * @param {Object} errorLogObject - The error log object to store as the last error.
   * @param {string} packageName - Name of the package to increment error logs count for.
   */
  updateErrorCount(packageName, errorLogObject) {
    if (!errorLogObject || errorLogObject.level !== 'ERROR') {
      return; // Only increment for error logs
    }
    if (!this.watchedPackages[packageName]) {
      log.warn('Package not being watched:', packageName, 'Cannot increment error logs count.');
      return; // Package is not being watched
    }
    if (!this.watchedPackages[packageName].errorCount) {
      this.watchedPackages[packageName].errorCount = 0; // Initialize error count
    }
    this.watchedPackages[packageName].errorCount += 1; // Increment error count
    this.watchedPackages[packageName].lastError = errorLogObject; // Update last error log object 
  }

  /** Publishes the error counts and last error logs for all watched packages.
   * If a package has no errors, it sets the error count to 0 and last error to null.
   * This method is called periodically to update the error counts.
   */
  publishErrorCounts() {
    if (!this.initialized) {
      log.debug('LogMonitor not initialized yet, waiting...');
      return; // Wait until initialized
    }
    Object.keys(this.watchedPackages).forEach(packageName => {
      const packageData = this.watchedPackages[packageName];
      if (packageData.errorCount > 0 && packageData.lastError) {
        this.mqttSync.data.update(`${this.AGENT_PREFIX}/status/logs/errorCount/${packageName}`, packageData.errorCount);
        this.mqttSync.data.update(`${this.AGENT_PREFIX}/status/logs/lastError/${packageName}`, packageData.lastError);
        log.info(`Published error count for package ${packageName}:`, packageData.errorCount);
      } else {
        // If no errors, ensure the count is set to 0
        this.mqttSync.data.update(`${this.AGENT_PREFIX}/status/logs/errorCount/${packageName}`, 0);
        this.mqttSync.data.update(`${this.AGENT_PREFIX}/status/logs/lastError/${packageName}`, null);
        log.info(`No errors for package ${packageName}, setting error count to 0.`);
      }
    });
  }
}

const logMonitor = new LogMonitor();

module.exports = logMonitor;