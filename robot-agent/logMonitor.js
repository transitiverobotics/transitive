const fs = require('fs');
const util = require('util');
const zlib = require('zlib');

const { Tail } = require('tail');
const _ = require('lodash');
const { CronJob } = require('cron');

const { getLogger, wait } = require('@transitive-sdk/utils');

const utils = require('./utils');

const log = getLogger('logMonitor.js');
log.setLevel('debug');

const WAIT_BETWEEN_BATCHES = 10000; // time to wait between sending batches of logs
const WAIT_TIME_IN_CASE_OF_ERROR = 5000; // Retry after this many ms after an error
const MAX_LOGS_PER_BATCH = 500; // Maximum number of logs to upload in one go

const getSeverityNumber = (level, defaultLevel = 'error') => {
  const levelMap = {
    'unspecified': 0,
    'trace': 1,
    'debug': 5,
    'info': 9,
    'warn': 13,
    'error': 17,
    'fatal': 21
  };
  return levelMap[level.toLowerCase()] || levelMap[defaultLevel];
};

/** Get the currently configured level of logging for the given package name
 * or the global one if not specified. Defaults to 'ERROR' if not set. */
const getMinLogLevel = (packageName) => {
  const globalMinLogLevel = _.get(global.config, 'global.minLogLevel', 'error');
  return _.get(global.config, `${packageName}.minLogLevel`, globalMinLogLevel)
    .toLowerCase();
};

/** LogMonitor handles log monitoring and uploading.
  * Watches log files for specific packages, processes new log entries,
  * uploads logs to the cloud via MQTT. Keeps track of pending logs
  * and ensures logs are uploaded at regular intervals.
**/
class LogMonitor {

  uploading = false; /// whether or not we are currently uploading pending logs

  constructor() {
    this.mqttSync = null;
    this.AGENT_PREFIX = null;
    this.watchedPackages = {}; // Store watched packages and data
    this.pendingLogs = []; // Array to store pending logs
    this.lastLogTimestamp = 0; // Timestamp of the last log sent
  }

  /**
   * Initializes the LogMonitor instance.
   * @param {Object} mqttSync - MQTT sync object to listen for log level changes.
   * @param {string} agentPrefix - Topic prefix for logs publishing.
   */
  init(mqttSync, agentPrefix){
    this.mqttSync = mqttSync;
    this.AGENT_PREFIX = agentPrefix;

    this.lastLogTimestamp = this.mqttSync.data.getByTopic(
      `${this.AGENT_PREFIX}/cloudStatus/lastLogTimestamp`
    ) || 0; // Get last log timestamp or default to 0

    this.rotateLogs();
    // rotate all log files once a day at 1am
    new CronJob('0 0 1 * * *', this.rotateLogs.bind(this), null, true);

    this.watchLogs('@transitive-robotics/robot-agent');

    this.mqttSync.data.subscribePath(`${this.AGENT_PREFIX}/info/config`, () => {
      // Update minLogLevel for all watched packages
      _.forEach(this.watchedPackages, (pkgData, packageName) => {
        const minLogLevel = getMinLogLevel(packageName);
        pkgData.minLogLevelValue = getSeverityNumber(minLogLevel);
        log.info(`Setting minLogLevel for ${packageName} to ${minLogLevel} (${
          pkgData.minLogLevelValue})`);
      });
    });
  }

  /** Publish the given message in the given MQTT topic directly using QoS2,
  * bypassing MqttSync. Returns a promise.
  */
  mqttPublishQos2Promise(topic, message) {
    return new Promise((resolve, reject) => {
      this.mqttSync.mqtt.publish(topic, message, { qos: 2 },
        (err) => {
          err && log.warn(`Failed to publish to ${topic}`, err);
          resolve();
        });
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

    // this.clearErrors(packageName);
    // const filePath = `${process.env.HOME}/.transitive/packages/${packageName}/log`;
    const filePath = `packages/${packageName}/log`;

    if (!fs.existsSync(filePath)) {
      log.warn(`Log file ${filePath} for package ${packageName} does not exist`);
      // this can happen in dev
      return;
    }

    const minLogLevel = getMinLogLevel(packageName);
    const minLogLevelValue = getSeverityNumber(minLogLevel);
    this.watchedPackages[packageName].minLogLevelValue = minLogLevelValue;

    log.debug('Watching logs for package:', packageName, 'at path:', filePath,
      ' with: ', { filePath, minLogLevel, minLogLevelValue }, 'since',
      this.lastLogTimestamp
    );

    // First: read file on disk and ingest current lines newer than last sent
    const fileContent = fs.readFileSync(filePath, { encoding: 'utf8' });
    const lines = fileContent.split('\n');

    for (const line of lines) {
      const logObject = this.parseLogLine(line, packageName);
      if (!logObject) continue; // skip lines that are not valid log lines
      if (logObject.timestamp < this.lastLogTimestamp) {
        continue; // skip logs older than the last sent log
      }
      this.pendingLogs.push(logObject);
    }

    this.watchedPackages[packageName].initialized = true; // Mark as initialized
    this.uploadPendingLogs(); // Start the log uploading process


    // Second: watch (tail) the file for new lines and ingest those
    const tail = new Tail(filePath);
    this.watchedPackages[packageName].tail = tail;

    tail.on('line', async (line) => {
      const logObject = this.parseLogLine(line, packageName);
      // skip lines that are not valid log lines or below the min level:
      if (!logObject) return;
      this.pendingLogs.push(logObject);
      this.uploadPendingLogs(); // Start uploading process if it's not already running
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

    const levelLower = level.toLowerCase();
    const logLevelValue = getSeverityNumber(levelLower, 'unspecified');
    const minLogLevelValue = this.watchedPackages[packageName].minLogLevelValue;

    // Skip logs below the minimum log level
    if (logLevelValue < minLogLevelValue) return null;
    const logObject = {
      timestamp,
      module: moduleName,
      level: levelLower,
      logLevelValue,
      message,
      package: packageName
    };
    return logObject;
  }

  /**
   * Uploads the next pending logs to the cloud.
   * Retries failed uploads and updates the last log timestamp.
   */
  async uploadPendingLogs() {

    if (this.pendingLogs.length == 0) return; // nothing to do
    if (this.uploading) return; // already running
    this.uploading = true;

    let logCount = 0;
    log.debug('Starting to upload pending logs, count:', this.pendingLogs.length);

    while (this.pendingLogs.length > 0) {
      const logsToUpload = this.pendingLogs.slice(0, MAX_LOGS_PER_BATCH);
      this.pendingLogs = this.pendingLogs.slice(MAX_LOGS_PER_BATCH);

      try {
        await this.publishLogsAsJson(logsToUpload);
        // log.debug('Published logs:', logsToUpload);
        logCount += logsToUpload.length;

      } catch (err) {
        log.debug(`Failed to publish ${logsToUpload.length} logs:`, err.message);
        log.debug(`Will retry uploading this logs in ${WAIT_TIME_IN_CASE_OF_ERROR} ms`);
        // If an error occurs, we want to retry processing this log after a delay
        // Re-add the log to the front of the queue:
        this.pendingLogs = logsToUpload.concat(this.pendingLogs);

        setTimeout(() => this.uploadPendingLogs(), WAIT_TIME_IN_CASE_OF_ERROR);
        this.uploading = false;
        return;
      }
    }
    log.debug('Uploaded', logCount, 'logs successfully.');

    // now wait before releasing the `uploading` token, to ensure we don't upload
    // logs more than so often in regular operation
    await wait(WAIT_BETWEEN_BATCHES);
    this.uploading = false;

    // if during the wait more logs arrived, call us back:
    if (this.pendingLogs.length > 0) this.uploadPendingLogs();
    // #TODO: use _.debounce on uploadPendingLogs instead
  }

  /**
   * Publishes logs as JSON to the MQTT broker.
   * @param {Array} logs - Array of log objects to publish.
   * @returns {Promise} - Resolves when the log is published.
   */
  async publishLogsAsJson(logs) {
    // const strMsg = JSON.stringify(logs);
    const zipMsg = zlib.gzipSync(JSON.stringify(logs));

    await this.mqttPublishQos2Promise(`${this.AGENT_PREFIX}/status/logs/live`, zipMsg);
  }

  /** Rotate logs and indicate to cloud to clear error log counts */
  rotateLogs() {
    // Signal the cloud that we've rotated the logs and the error count should be
    // reset to 0 for all packages.
    log.debug('rotating logs');
    utils.rotateAllLogs();
    this.mqttPublishQos2Promise(`${this.AGENT_PREFIX}/status/logs/reset`, null);
  }
}

const logMonitor = new LogMonitor();
module.exports = logMonitor;
