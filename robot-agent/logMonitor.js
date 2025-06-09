const { Tail } = require('tail');

const fs = require('fs');
const { getLogger } = require('@transitive-sdk/utils');
const log = getLogger('logMonitor.js');
log.setLevel('debug');

class LogMonitor {
  constructor() {
    this.mqttClient = null;
    this.mqttSync = null;
    this.AGENT_PREFIX = null;
    this.tailedFiles = new Set(); // Set to keep track of files being tailed
    this.pendingLogs = []; // Array to store pending logs
  }
  init(mqttClient, mqttSync, agentPrefix){
    this.mqttClient = mqttClient;
    this.mqttSync = mqttSync;
    // this.mqttSync.publish(`${this.AGENT_PREFIX}/logs/#`);
    this.AGENT_PREFIX = agentPrefix;
    this.processNextPendingLog();
  }
  async publishLogAsJson(logObject, topicSuffix){
    const LOG_TOPIC = `${this.AGENT_PREFIX}/logs${topicSuffix}`;
    const logJson = JSON.stringify(logObject);
    return new Promise((resolve, reject) => {
      this.mqttClient.publish(LOG_TOPIC, logJson, { qos: 2 }, (err) => {
        if (err) {
          log.error('Failed to publish log to MQTT on topic', LOG_TOPIC, ':', err.message);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
  parseLogLine(line) {
    if (!line.startsWith('[')) return;
    // Remove the leading '[' and split by spaces
    const endBracketIdx = line.indexOf(']');
    if (endBracketIdx === -1) return null;
    const header = line.slice(1, endBracketIdx);
    const message = line.slice(endBracketIdx + 2); // skip "] "
    if (!header || !message) return null; // Ensure both header and message are present
    const parts = header.split(' ');
    if (parts.length < 3) return null; // Ensure there are at least 3 parts (timestamp, module, level)
    const [timestamp, module, level] = parts;
    // Ignore logs produced by this module
    if (module === 'logMonitor.js') return null;
    if (!timestamp || !module || !level) return null; // Ensure all parts are present
    const logObject = { timestamp, module, level, message };
    return logObject;
  }
  processNextPendingLog(){
    if (this.pendingLogs.length === 0) {
      log.debug('No pending logs to process');
      setTimeout(() => this.processNextPendingLog(), 1000);
      return;
    }
    if (!(this.mqttClient && this.mqttClient.connected && this.AGENT_PREFIX)) {
      log.debug('MQTT client not initialized or AGENT_PREFIX not defined, skipping log processing');
      setTimeout(() => this.processNextPendingLog(), 1000);
      return;
    }
    const pendingLog = this.pendingLogs[0];
    const {logObject, filePath, topicSuffix} = pendingLog;

    try {
      this.publishLogAsJson(logObject, topicSuffix)
        .then(() => {
          // store last log sent timestamp in a file next to the log file
          try {
            const lastLogFilePath = `${filePath}.lastLogTimestamp`;
            fs.writeFileSync(lastLogFilePath, logObject.timestamp, { encoding: 'utf8' });
          } catch (writeErr) {
            log.error('Failed to write last log timestamp file:', `${filePath}.lastLogTimestamp`, 'Error:', writeErr.message);
          }
          // Remove the processed log from pending logs
          this.pendingLogs = this.pendingLogs.slice(1); // remove the processed log
          // Process the next pending log after a short delay
          setTimeout(() => this.processNextPendingLog(), 100);
        })
        .catch((e) => {
          setTimeout(() => this.processNextPendingLog(), 1000);
        })
    } catch (err) {
      log.error('Failed to publish log:', logObject, 'Error:', err.message);
      setTimeout(() => this.processNextPendingLog(), 1000);
    }
    
  }
  uploadLogsFromFile(filePath, topicSuffix) {
    if (this.tailedFiles.has(filePath)) {
      log.warn('File is already being tailed:', filePath);
      return;
    }

    this.tailedFiles.add(filePath);

    // first upload all log lines newer than the last log sent
    const lastLogTimestampFilePath = `${filePath}.lastLogTimestamp`;
    let lastLogTimestamp = 0;
    if (fs.existsSync(lastLogTimestampFilePath)) {
      const lastLogContent = fs.readFileSync(lastLogTimestampFilePath, { encoding: 'utf8' });
      lastLogTimestamp = new Date(lastLogContent).getTime();
      if (isNaN(lastLogTimestamp)) {
        log.warn('Invalid last log timestamp in file:', lastLogTimestampFilePath);
        lastLogTimestamp = 0; // reset to 0 if invalid
      }
    } else {
      log.info('No last log timestamp file found, starting fresh:', lastLogTimestampFilePath);
    }
    log.info('Last log timestamp for', filePath, 'is', lastLogTimestamp);
    const fileContent = fs.readFileSync(filePath, { encoding: 'utf8' });
    const lines = fileContent.split('\n');
    for (const line of lines) {
      const logObject = this.parseLogLine(line);
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
      this.pendingLogs.push({ logObject, filePath, topicSuffix });
    }
    
    const tail = new Tail(filePath);

    tail.on('line', async (line) => {
      const logObject = this.parseLogLine(line);
      if (!logObject) return; // skip lines that are not valid log lines
      this.pendingLogs.push({ logObject, filePath, topicSuffix });
    });

    tail.on('error', (error) => {
      log.error('Error tailing log file:', filePath, error.message);
      this.tailedFiles.delete(filePath); // Remove from set on error
    });

    tail.on('close', () => {
      log.info('Stopped tailing log file:', filePath);
      this.tailedFiles.delete(filePath); // Remove from set on close
    });

    log.info('Started tailing log file:', filePath);
  }
}
const logMonitor = new LogMonitor();

module.exports = logMonitor;