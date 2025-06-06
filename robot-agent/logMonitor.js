const Tail = require('tail').Tail;

const { getLogger } = require('@transitive-sdk/utils');
const log = getLogger('logMonitor.js');
log.setLevel('debug');

// Maintain a set of files being tailed
const tailedFiles = new Set();

const uploadLogsFromFile = (filePath, topicSuffix) => {
  if (tailedFiles.has(filePath)) {
    log.warn('File is already being tailed:', filePath);
    return;
  }

  tailedFiles.add(filePath);

  const tail = new Tail(filePath);

  tail.on('line', async (line) => {
    const logRegex = /^\[(?<timestamp>[^\]]+)\s(?<module>[^\s]+)\s(?<level>[^\s]+)\] (?<message>.+)$/;
    const match = line.match(logRegex);

    if (match && match.groups) {
      const logObject = {
        timestamp: match.groups.timestamp,
        module: match.groups.module,
        level: match.groups.level,
        message: match.groups.message,
      };
      // Ignore logs produced by this module
      if (logObject.module === 'logMonitor.js') {
        return;
      }
      if (global.mqttClient && global.mqttClient.connected && global.AGENT_PREFIX) {
        await publishLogAsJson(logObject, topicSuffix);
      } else {
        log.warn('MQTT client not initialized or AGENT_PREFIX not defined, skipping log publishing:', logObject);
      }
    }
  });

  tail.on('error', (error) => {
    log.error('Error tailing log file:', filePath, error.message);
    tailedFiles.delete(filePath); // Remove from set on error
  });

  tail.on('close', () => {
    log.info('Stopped tailing log file:', filePath);
    tailedFiles.delete(filePath); // Remove from set on close
  });

  log.info('Started tailing log file:', filePath);
};

const publishLogAsJson = async (logObject, topicSuffix) => {
  const LOG_TOPIC = `${global.AGENT_PREFIX}/logs${topicSuffix}`;
  const logJson = JSON.stringify(logObject);
  return new Promise((resolve, reject) => {
    global.mqttClient.publish(LOG_TOPIC, logJson, { qos: 2 }, (err) => {
      if (err) {
        log.error('Failed to publish log to MQTT on topic', LOG_TOPIC, ':', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

module.exports = { uploadLogsFromFile };