const pidusage = require('pidusage');
const _ = require('lodash');

const { getLogger } = require('@transitive-sdk/utils');
const log = getLogger('resourceMonitor');
log.setLevel('debug');

const SAMPLE_RATE = 5000; // Sample every 5 seconds
const SAMPLES_PER_BATCH = 10; // Number of samples to collect before publishing


/** CPU and Memory monitoring class */
class ResourceMonitor {
  constructor() {
    this.monitoredPackages = {};
    this.mqttSync = null;
    this.agentPrefix = null;
    this.initialized = false;
  }

  init(mqttSync, agentPrefix) {
    this.mqttSync = mqttSync;
    this.agentPrefix = agentPrefix;
    log.debug('Starting resource monitoring for all monitored packages');
    this.mqttSync.waitForHeartbeatOnce(() => {
      log.info('ResourceMonitor heartbeat received, initializing...');
      
      this.initialized = true; // Set initialized state
      log.info('Starting watching logs for packages registered before initialization');
      // Publish on MQTT for all packages monitored before initialization
      _.forEach(this.monitoredPackages, (pkgData, pkgName) => {
        log.debug(`Setting up publication for package ${pkgName} on topic ${this.agentPrefix}/status/metrics/${pkgName}`);
        this.mqttSync.publish(
          `${this.agentPrefix}/status/metrics/${pkgName}`,        
          { atomic: true }
        );
      });
    });
  }

  startMonitoring(packageName, pid) {
    if (!this.monitoredPackages[packageName]) {
      this.monitoredPackages[packageName] = {
        pid: pid,
        samples: [],
        interval: null,
      }
    } else {
      log.warn(`Already monitoring package ${packageName}, skipping startMonitoring`);
      return;
    }
    if (this.initialized) {
      log.debug(`Setting up publication for package ${packageName} on topic ${this.agentPrefix}/status/metrics/${packageName}`);
      this.mqttSync.publish(
        `${this.agentPrefix}/status/metrics/${packageName}`,
        { atomic: true }
      );
    }
    log.debug(`Starting resource monitoring for ${packageName} (PID: ${pid})`);
    this.monitoredPackages[packageName].interval = setInterval(async () => {
      let stats = null;
      try {
        stats = await pidusage(pid);
      } catch (err) {
        log.error(`Failed to get resource usage for ${packageName} (PID: ${pid}):`, err);
        return;
      }
      const cpuUsage = stats.cpu; // CPU usage percentage
      const memoryUsage = stats.memory; // Memory usage in bytes

      this.monitoredPackages[packageName].samples.push({
        timestamp: Date.now(),
        cpu: cpuUsage,
        memory: memoryUsage,
      });
      
      if (this.monitoredPackages[packageName].samples.length >= SAMPLES_PER_BATCH) {
        if (this.initialized) {
          log.debug(`Publishing resource usage for ${packageName} on MqttSync`);
          this.monitoredPackages[packageName].samples = this.monitoredPackages[packageName].samples.slice(-SAMPLES_PER_BATCH);
          this.mqttSync.data.update(
            `${this.agentPrefix}/status/metrics/${packageName}`,
            this.monitoredPackages[packageName].samples
          );
          this.monitoredPackages[packageName].samples = [];
          log.debug(`Published resource usage for ${packageName} on MqttSync`);
        }
      }
    }, SAMPLE_RATE);
  }

  stopMonitoring(packageName) {
    if (this.monitoredPackages[packageName]) {
      clearInterval(this.monitoredPackages[packageName].interval);
      delete this.monitoredPackages[packageName];
      log.debug(`Stopped resource monitoring for ${packageName}`);
    }
  }
}

const resourceMonitor = new ResourceMonitor();
module.exports = resourceMonitor;
