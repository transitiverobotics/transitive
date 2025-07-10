const pidusageTree = require('pidusage-tree');
const pidusage = require('pidusage');
const _ = require('lodash');

const { getLogger } = require('@transitive-sdk/utils');
const log = getLogger('resourceMonitor');
log.setLevel('debug');

const SAMPLE_RATE = 5000; // Sample every 5 seconds
const SAMPLES_PER_BATCH = 12; // Publish metrics every 60 seconds


/** CPU and Memory monitoring class with subprocess tracking */
class ResourceMonitor {
  constructor() {
    this.mqttSync = null;
    this.agentPrefix = null;
    this.initialized = false;
    this.monitoredPackages = {};
  }

  init(mqttSync, agentPrefix) {
    this.mqttSync = mqttSync;
    this.agentPrefix = agentPrefix;
    log.debug('Starting resource monitoring for all monitored packages');
    this.mqttSync.waitForHeartbeatOnce(() => {
      log.info('ResourceMonitor heartbeat received, initializing...');      
      this.initialized = true; // Set initialized state
      this.mqttSync.publish(
        `${this.agentPrefix}/status/metrics`,        
        { atomic: true }
      );
    });

    // Start the periodic sampling and publishing of resource usage metrics
    setInterval(() => {
      _.forEach(this.monitoredPackages, async (pkgData, pkgName) => {    
        const {pid} = pkgData; 
        let stats = null;
        try {
          if (pkgName === 'robot-agent') {
            // For the robot-agent, we use pidusage directly
            stats = await pidusage(pid);
          } else {
            // For other packages, we use pidusage-tree to include subprocesses
            stats = await pidusageTree(pid);
          }
        } catch (err) {
          log.error(`Failed to get resource usage for ${pkgName} (PID: ${pid}):`, err);
          return;
        }
        
        let cpuUsage, memoryUsage;
        if (pkgName === 'robot-agent') {
          // For the robot-agent, we use pidusage directly
          cpuUsage = stats.cpu; // CPU usage percentage
          memoryUsage = stats.memory; // Memory usage in bytes
        } else {
          const nonNullStats = _.filter(stats, stat => stat !== null && stat !== undefined);
          // pidusage-tree returns aggregated stats for the process tree
          cpuUsage = _.reduce(nonNullStats, (sum, stat) => sum + (stat ? stat.cpu : 0), 0); // CPU usage percentage (aggregated)
          memoryUsage = _.reduce(nonNullStats, (sum, stat) => sum + (stat ? stat.memory : 0), 0); // Memory usage in bytes (aggregated)     
        }
        pkgData.samples.push({
          cpu: cpuUsage,
          memory: memoryUsage,
        });
      });
      // If first package has enough samples, publish all
      const firstPkg = Object.keys(this.monitoredPackages)[0];
      if (this.initialized) {
        if (this.monitoredPackages[firstPkg].samples.length >= SAMPLES_PER_BATCH) {
          log.debug(`Publishing resource usage for all monitored packages on MqttSync`);
          const allSamples = {};
          _.map(this.monitoredPackages, (pkgData, pkgName) => {
            pkgData.samples = pkgData.samples.slice(-SAMPLES_PER_BATCH);
            // complete samples with 0 on the left side if needed
            while (pkgData.samples.length < SAMPLES_PER_BATCH) {
              pkgData.samples.unshift({
                cpu: 0,
                memory: 0,
              });
            }
            // publish each package's samples under its name
            allSamples[pkgName] = pkgData.samples;
          });
          this.mqttSync.data.update(
            `${this.agentPrefix}/status/metrics`,
            allSamples
          );
          // Clear samples after publishing
          _.forEach(this.monitoredPackages, pkgData => {
            pkgData.samples = [];
          });
        }
      }
    }, SAMPLE_RATE);
  }

  startMonitoring(packageName, pid) {
    if (!this.monitoredPackages[packageName]) {
      this.monitoredPackages[packageName] = {
        pid: pid,
        samples: [],
      }
    } else {
      log.warn(`Already monitoring package ${packageName}, skipping startMonitoring`);
      return;
    }
  }

  stopMonitoring(packageName) {
    if (this.monitoredPackages[packageName]) {
      delete this.monitoredPackages[packageName];
      log.debug(`Stopped resource monitoring for ${packageName}`);
    }
  }
}

const resourceMonitor = new ResourceMonitor();
module.exports = resourceMonitor;
