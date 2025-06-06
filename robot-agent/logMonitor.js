const { Tail } = require('tail');
const fs = require('fs');
const _ = require('lodash');

const { getLogger, topicToPath} = require('@transitive-sdk/utils');
const log = getLogger('logMonitor.js');
log.setLevel('info');

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

/** Get the currently configured level of logging we want to forward from the
 * named package (or robot-agent) */
const getMinLogLevel = (packageName) => {
  const globalMinLogLevel = _.get(global.config, 'global.minLogLevel', 'ERROR');
  return (packageName === 'robot-agent' ? globalMinLogLevel
    : _.get(global.config, `${packageName}.minLogLevel`, globalMinLogLevel)
  );
};

/** The log monitor accepts packages to monitor, watches their logs and
* publishes them (filtered) to the cloud via MQTT (not sync). ALso does this
* for the agent log. */
class LogMonitor {

  constructor() {
    this.mqttClient = null;
    this.mqttSync = null;
    this.AGENT_PREFIX = null;
    this.watchedPackages = {}; // Store watched packages and data
    this.pendingLogs = []; // Array to store pending logs
    this.initialized = false;
  }


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
    this.initialized = true; // Set initialized state
    this.processNextPendingLog(); // Start processing pending logs
  }


  watchLogs(packageName) {
    if (_.get(this.watchedPackages, packageName)) {
      log.warn('Package is already being watched:', packageName);
      return;
    }
    let filePath = '';
    let topicSuffix = '';
    let lastLogTimestampFilePath = '';

    if (packageName === 'robot-agent') {
      log.info('Watching logs for robot-agent package');
      filePath = `${process.env.HOME}/.transitive/agent.log`;
      lastLogTimestampFilePath = `${process.env.HOME}/.transitive/lastTimestamp`;
      topicSuffix = '/agent';
    } else {
      log.info('Watching logs for package:', packageName);
      filePath = `${process.env.HOME}/.transitive/packages/${packageName}/log`;
      lastLogTimestampFilePath =
        `${process.env.HOME}/.transitive/packages/${packageName}/lastTimestamp`;
      topicSuffix = `/capabilities/${packageName}`;
    }

    let minLogLevel = getMinLogLevel(packageName);
    let minLogLevelValue = getLogLevelValue(minLogLevel);
    this.watchedPackages[packageName] = {
      filePath,
      lastLogTimestampFilePath,
      topicSuffix,
      minLogLevel,
      minLogLevelValue,
    };
    log.debug('WatchingLogs with', { filePath, topicSuffix, minLogLevel,
      minLogLevelValue });

    // first upload all log lines newer than the last log sent
    const lastLogTimestamp = this.getLastLogTimestamp(packageName);

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
      if (logTimestamp < lastLogTimestamp) {
        continue; // skip logs older than the last sent log
      }
      this.pendingLogs.push({ logObject, packageName });
    }

    const tail = new Tail(filePath);

    tail.on('line', async (line) => {
      const logObject = this.parseLogLine(line, packageName);
      if (!logObject) return; // skip lines that are not valid log lines
      this.pendingLogs.push({ logObject, packageName });
    });

    tail.on('error', (error) => {
      log.error('Error tailing log file:', filePath, error.message);
      // Remove from watched packages on error
      this.watchedPackages[packageName] = null;
    });

    tail.on('close', () => {
      log.info('Stopped tailing log file:', filePath);
      // Remove from watched packages on close
      this.watchedPackages[packageName] = null;
    });

    log.info('Started tailing log file:', filePath);
  }


  getLastLogTimestamp(packageName) {
    const filePath = this.watchedPackages[packageName].lastLogTimestampFilePath;
    let lastLogTimestamp = 0;
    let lastLogContent = '';
    if (fs.existsSync(filePath)) {
      lastLogContent = fs.readFileSync(filePath, { encoding: 'utf8' });
      lastLogTimestamp = new Date(lastLogContent).getTime();
      if (isNaN(lastLogTimestamp)) {
        log.warn('Invalid last log timestamp in file:', filePath);
        lastLogTimestamp = 0; // reset to 0 if invalid
      }
    } else {
      log.info('No last log timestamp file found, starting fresh:', filePath);
    }
    log.info('Last log timestamp for', packageName, 'is', lastLogContent);
    return lastLogTimestamp;
  }


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


  processNextPendingLog() {

    if (this.pendingLogs.length === 0) {
      log.debug('No pending logs to process');
      setTimeout(() => this.processNextPendingLog(), 1000);
      return;
    }

    if (!this.initialized) {
      log.debug('LogMonitor not initialized yet, waiting...');
      setTimeout(() => this.processNextPendingLog(), 1000);
      return;
    }

    const pendingLog = this.pendingLogs.shift(); // Get the first pending log
    const {logObject, packageName} = pendingLog;

    if (_.get(this.watchedPackages, packageName) === null) {
      log.warn('Package is no longer being watched:', packageName,
        'Log will not be processed:', logObject);
      setTimeout(() => this.processNextPendingLog(), 100);
      return;
    }

    try {
      this.publishLogAsJson(logObject, packageName).then(() => {
        // store last log sent timestamp in a file next to the log file
        const lastLogTimestampFilePath =
          this.watchedPackages[packageName].lastLogTimestampFilePath;
        try {
          fs.writeFileSync(lastLogTimestampFilePath, logObject.timestamp,
            { encoding: 'utf8' });
        } catch (writeErr) {
          log.error('Failed to write last log timestamp file:',
            lastLogTimestampFilePath, 'Error:', writeErr.message);
        }
        // Process the next pending log after a short delay
        setTimeout(() => this.processNextPendingLog(), 100);
      }).catch((e) => {
          log.error('Failed to publish log:', logObject, 'Error:', e.message);
          // If an error occurs, we want to retry processing this log after a delay
          // Re-add the log to the front of the queue:
          this.pendingLogs.unshift(pendingLog);
          setTimeout(() => this.processNextPendingLog(), 1000);
        });
    } catch (err) {
      log.error('Failed to publish log:', logObject, 'Error:', err.message);
      // If an error occurs, we want to retry processing this log after a delay
      // Re-add the log to the front of the queue:
      this.pendingLogs.unshift(pendingLog);
      setTimeout(() => this.processNextPendingLog(), 1000);
    }
  }


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

// Create singleton instance and export it
const logMonitor = new LogMonitor();

module.exports = logMonitor;
