const pidusageTree = require('pidusage-tree');
const pidusage = require('pidusage');
const _ = require('lodash');
const si = require('systeminformation');

const { getLogger } = require('@transitive-sdk/utils');
const log = getLogger('resourceMonitor');
log.setLevel('info');

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
      this.mqttSync.publish(
        `${this.agentPrefix}/status/metrics`,        
        { atomic: true }
      );
      this.initialized = true; // Set initialized state
    });

    // Start the periodic sampling and publishing of resource usage metrics
    setInterval(async () => {
      _.forEach(this.monitoredPackages, async (pkgData, pkgName) => {    
        const {pid} = pkgData; 
        try {
          if (pkgName === 'robot-agent') {
            // For the robot-agent, we use pidusage directly
            const stats = await pidusage(pid);

            // Sample system metrics when monitoring robot-agent
            const [systemCpuLoad, systemMemInfo] = await Promise.all([
              si.currentLoad(),
              si.mem()
            ]);
            pkgData.samples.push({
              cpu: stats.cpu, // CPU usage percentage
              memory: stats.memory, // Memory usage in bytes
              system: {
                cpu: systemCpuLoad.currentLoad, // Overall CPU usage percentage
                memory: systemMemInfo.used
              }
            });
          } else {
            // For other packages, we use pidusage-tree to include subprocesses
            const stats = await pidusageTree(pid); 

            const nonNullStats = _.filter(stats, stat => stat !== null && stat !== undefined);
    
            pkgData.samples.push({
              cpu: _.reduce(nonNullStats, (sum, stat) => sum + (stat ? stat.cpu : 0), 0), // CPU usage percentage (aggregated)
              memory: _.reduce(nonNullStats, (sum, stat) => sum + (stat ? stat.memory : 0), 0), // Memory usage in bytes (aggregated)
            });
          }
        } catch (err) {
          log.error(`Failed to get resource usage for ${pkgName} (PID: ${pid}):`, err);
          return;
        }
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
                system: pkgName === 'robot-agent' ? { cpu: 0, memory: 0 } : undefined
              });
            }
            
            // Convert to new schema format: separate arrays for cpu and memory
            const cpuSamples = pkgData.samples.map(sample => sample.cpu);
            const memorySamples = pkgData.samples.map(sample => sample.memory);
            
            allSamples[pkgName] = {
              cpu: cpuSamples,
              memory: memorySamples
            };
            
            // Add system metrics for robot-agent
            if (pkgName === 'robot-agent') {
              allSamples[pkgName].system = {
                cpu: pkgData.samples.map(sample => sample.system?.cpu || 0),
                memory: pkgData.samples.map(sample => sample.system?.memory || 0)
              };
            }
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
