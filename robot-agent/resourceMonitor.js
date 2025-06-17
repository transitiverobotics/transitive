const pidusage = require('pidusage');
const { getLogger } = require('@transitive-sdk/utils');

const log = getLogger('resourceMonitor');
log.setLevel('debug');

/** CPU and Memory monitoring class */
class ResourceMonitor {
  constructor() {
    this.monitoredPackages = {};
    this.mqttClient = null;
    this.AGENT_PREFIX = null;
    this.initialized = false;
    log.debug('++++++++++++++++++++++++++++++++++++ResourceMonitor instance created');
  }

  init(mqttClient, agentPrefix) {
    this.mqttClient = mqttClient;
    this.AGENT_PREFIX = agentPrefix;
    this.initialized = true; // Set initialized state
    log.debug('-------------------------------------ResourceMonitor initialized');
  }

  startMonitoring(packageName, pid) {
    if (this.monitoredPackages[packageName]) {
      log.debug(`Resource monitoring already active for ${packageName}`);
      return;
    }

    log.debug(`Starting resource monitoring for ${packageName} (PID: ${pid})`);
    this.monitoredPackages[packageName] = setInterval(async () => {
      try {
        const stats = await pidusage(pid);
        const cpuUsage = stats.cpu; // CPU usage percentage
        const memoryUsage = stats.memory; // Memory usage in bytes

        log.debug(`Published CPU usage for ${packageName}: ${cpuUsage}%`);
        log.debug(`Published Memory usage for ${packageName}: ${memoryUsage} bytes`);

        if (this.initialized) {
          this.mqttClient.publish(
            `${this.AGENT_PREFIX}/metrics/${packageName}`,
            JSON.stringify({
              cpu: cpuUsage,
              memory: memoryUsage,
            }),
            { qos: 2 },
            (err) => {
              if (err) {
                log.error(`Failed to publish resource usage for ${packageName}:`, err);
              }
              log.debug(`Published resource usage for ${packageName} to MQTT on topic ${this.AGENT_PREFIX}/metrics/${packageName}`);
            }
          );
          log.debug(`Published resource usage for ${packageName} to MQTT`);
        }
      } catch (err) {
        log.error(`Failed to get resource usage for ${packageName} (PID: ${pid}):`, err);
      }
    }, 5000); // Monitor every 5 seconds
  }

  stopMonitoring(packageName) {
    if (this.monitoredPackages[packageName]) {
      clearInterval(this.monitoredPackages[packageName]);
      delete this.monitoredPackages[packageName];
      log.debug(`Stopped resource monitoring for ${packageName}`);
    }
  }
}

const resourceMonitor = new ResourceMonitor();
module.exports = resourceMonitor;
