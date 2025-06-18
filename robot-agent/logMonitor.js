const { Tail } = require('tail');
const fs = require('fs');
const _ = require('lodash');

const { getLogger, topicToPath} = require('@transitive-sdk/utils');
const log = getLogger('logMonitor.js');
log.setLevel('info');

const LOGS_UPLOADING_INTERVAL = 100; // Interval to process logs in milliseconds

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
    this.logUploadingInterval = null;
    this.uploadingNextLog = false; // Flag to prevent concurrent uploads
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
      const lastLogTimestampString = this.mqttSync.data.getByTopic(
        `${this.AGENT_PREFIX}/lastLogTimestamp`
      );
      if (lastLogTimestampString) {
        log.info('Last log timestamp found:', lastLogTimestampString);
        this.lastLogTimestamp = new Date(lastLogTimestampString).getTime();
      } else {
        log.info('No last log timestamp found, defaulting to 0');
        this.lastLogTimestamp = 0; // Default to 0 if not found
      }    
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

    let filePath = '';
    let topicSuffix = '';
    if (packageName === 'robot-agent') {
      log.info('Watching logs for robot-agent package');
      filePath = `${process.env.HOME}/.transitive/agent.log`;
      topicSuffix = '/agent';
    } else {
      log.info('Watching logs for package:', packageName);
      filePath = `${process.env.HOME}/.transitive/packages/${packageName}/log`;
      topicSuffix = `/capabilities/${packageName}`;
    }

    let minLogLevel = getMinLogLevel(packageName);
    let minLogLevelValue = getLogLevelValue(minLogLevel);
    this.watchedPackages[packageName].filePath = filePath;
    this.watchedPackages[packageName].topicSuffix = topicSuffix;
    this.watchedPackages[packageName].minLogLevel = minLogLevel;
    this.watchedPackages[packageName].minLogLevelValue = minLogLevelValue;

    log.debug('WatchingLogs with', { filePath, topicSuffix, minLogLevel,
      minLogLevelValue });

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
      const logTimestamp = new Date(timestamp).getTime();
      if (logTimestamp < this.lastLogTimestamp) {
        continue; // skip logs older than the last sent log
      }
      this.pendingLogs.push({ logObject, packageName });
    }

    this.watchedPackages[packageName].initialized = true; // Mark as initialized
  
    this.startUploadingLogs(); // Start the log uploading process
    const tail = new Tail(filePath);

    tail.on('line', async (line) => {
      const logObject = this.parseLogLine(line, packageName);
      if (!logObject) return; // skip lines that are not valid log lines
      this.pendingLogs.push({ logObject, packageName });
      this.startUploadingLogs(); // Ensure logs are uploaded
    });

    tail.on('error', (error) => {
      log.error('Error tailing log file:', filePath, error.message);
    });

    tail.on('close', () => {
      log.info('Stopped tailing log file:', filePath);
      // Remove from watched packages on close
      this.watchedPackages[packageName] = null;
    });

    log.info('Started tailing log file:', filePath);
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

    const [timestamp, moduleName, level] = parts;
    // Ignore logs produced by this module

    if (moduleName === log.name) return null;

    // Ensure all parts are present
    if (!timestamp || !moduleName || !level) return null;

    const logLevelValue = getLogLevelValue(level);
    const minLogLevelValue = this.watchedPackages[packageName].minLogLevelValue;

    // Skip logs below the minimum log level
    if (logLevelValue < minLogLevelValue) return null;
    const logObject = { timestamp, module: moduleName,
      level, logLevelValue, message };
    return logObject;
  }

  /**
   * Starts the process of uploading logs at regular intervals.
   */
  startUploadingLogs() {
    if (this.logUploadingInterval) {
      log.debug('Log uploading already started, skipping');
      return;
    }
    log.debug('Starting log uploading');
    this.logUploadingInterval = setInterval(async () => {
      if (this.uploadingNextLog) {
        log.debug('Already uploading a log, skipping this interval');
        return; // Skip this interval if already uploading a log
      }
      this.uploadingNextLog = true; // Set flag to indicate upload is in progress
      log.debug('Uploading next pending log');
      await this.uploadNextPendingLog();
      this.uploadingNextLog = false; // Reset flag after upload is done
    }, LOGS_UPLOADING_INTERVAL);
  }

  /**
   * Stops the log uploading process.
   */
  stopUploadingLogs() {
    if (this.logUploadingInterval) {
      log.debug('Stopping log uploading');
      clearInterval(this.logUploadingInterval);
      this.logUploadingInterval = null; // Reset interval
    } else {
      log.debug('Log uploading not started, nothing to stop');
    }
  }

  /**
   * Uploads the next pending log to the cloud.
   * Retries failed uploads and updates the last log timestamp.
   */
  async uploadNextPendingLog() {
    if (this.pendingLogs.length === 0 ) {
      log.debug('No pending logs to process');
      this.stopUploadingLogs(); // Stop if no logs are pending
      return;
    }

    if (!this.initialized) {
      log.debug('LogMonitor not initialized yet, waiting...');
      return; // Wait until initialized
    }

    const pendingLog = this.pendingLogs.shift(); // Get the first pending log
    const {logObject, packageName} = pendingLog;

    if (_.get(this.watchedPackages, packageName) === null) {
      log.warn('Package is no longer being watched:', packageName,
        'Log will not be processed:', logObject);
      return;
    }

    try {
      await this.publishLogAsJson(logObject, packageName);
      this.mqttSync.data.update(`${this.AGENT_PREFIX}/lastLogTimestamp`, logObject.timestamp);
    } catch (err) {
      log.error('Failed to publish log:', logObject, 'Error:', err.message);
      // If an error occurs, we want to retry processing this log after a delay
      // Re-add the log to the front of the queue:
      this.pendingLogs.unshift(pendingLog);
    }
  }

  /**
   * Publishes a log object as JSON to the MQTT topic.
   * @param {Object} logObject - Log object to publish.
   * @param {string} packageName - Name of the package.
   * @returns {Promise} - Resolves when the log is published.
   */
  async publishLogAsJson(logObject, packageName){
    const topicSuffix = this.watchedPackages[packageName].topicSuffix;
    const logTopic = `${this.AGENT_PREFIX}/logs${topicSuffix}`;
    const logJson = JSON.stringify(logObject);
    return new Promise((resolve, reject) => {
      this.mqttClient.publish(logTopic, logJson, { qos: 2 }, (err) => {
        if (err) {
          log.error('Failed to publish log to MQTT on topic', logTopic, ':',
            err.message);
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
