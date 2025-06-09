const { Tail } = require('tail');

const { getLogger } = require('@transitive-sdk/utils');
const log = getLogger('logMonitor.js');
log.setLevel('debug');

class LogMonitor {
  constructor() {
    this.mqttClient = null;
    this.AGENT_PREFIX = null;
    this.tailedFiles = new Set(); // Set to keep track of files being tailed
  }
  init(mqttClient, agentPrefix){
    this.mqttClient = mqttClient;
    this.AGENT_PREFIX = agentPrefix;
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
  uploadLogsFromFile(filePath, topicSuffix) {
    if (this.tailedFiles.has(filePath)) {
      log.warn('File is already being tailed:', filePath);
      return;
    }

    this.tailedFiles.add(filePath);

    const tail = new Tail(filePath);

    tail.on('line', async (line) => {
      if (!line.startsWith('[')) return;
      // Remove the leading '[' and split by spaces
      const endBracketIdx = line.indexOf(']');
      if (endBracketIdx === -1) return;
      const header = line.slice(1, endBracketIdx);
      const message = line.slice(endBracketIdx + 2); // skip "] "
      const [timestamp, module, level] = header.split(' ');

      // Ignore logs produced by this module
      if (module === 'logMonitor.js') {
        return;
      }
      if (this.mqttClient && this.mqttClient.connected && this.AGENT_PREFIX) {
        const logObject = { timestamp, module, level, message };
        await this.publishLogAsJson(logObject, topicSuffix);
      } else {
        log.warn('MQTT client not initialized or AGENT_PREFIX not defined, skipping log publishing:', logObject);
      }
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