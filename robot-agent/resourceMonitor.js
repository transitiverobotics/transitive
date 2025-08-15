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
    log.info('Starting resource monitoring for all monitored packages');
    
    this.mqttSync.waitForHeartbeatOnce(() => {
      log.info('ResourceMonitor heartbeat received, initializing...');      
      this.initialized = true; // Set initialized state
      
      // Subscribe to package topics to automatically start/stop monitoring
      this.mqttSync.data.subscribePathFlat(`${this.agentPrefix}/status/package`, (value, topic, matched) => {
        const topicParts = topic.split('/');
        // Extract package name from topic like "/agent-xxx/status/package/@scope/name/..."
        const agentPrefixParts = this.agentPrefix.split('/').length;
        if (topicParts.length < agentPrefixParts + 4) return; // Not enough parts for a valid package topic
        
        const packageScope = topicParts[agentPrefixParts + 2];
        const packageName = topicParts[agentPrefixParts + 3];
        const fullPackageName = `${packageScope}/${packageName}`;
        
        // Check if this is a status update (like /status/package/@scope/name/status)
        const isStatusTopic = topicParts[agentPrefixParts + 4] === 'status';
        
        if (isStatusTopic && value === 'started') {
          // Package is running, start monitoring
          log.info('Package started, beginning resource monitoring:', fullPackageName);
          this.startMonitoringFromPackage(fullPackageName);
        } else if (value === null) {
          // Package stopped or removed, stop monitoring
          log.info('Package stopped/removed, stopping resource monitoring:', fullPackageName);
          this.stopMonitoring(fullPackageName);
        }
      });
      
      // Check for existing package statuses at startup
      const packageData = this.mqttSync.data.getByTopic(`${this.agentPrefix}/status/package`);
      if (packageData) {
        Object.keys(packageData).forEach(packageScope => {
          if (typeof packageData[packageScope] === 'object') {
            Object.keys(packageData[packageScope]).forEach(packageName => {
              const packageStatus = packageData[packageScope][packageName];
              if (packageStatus && typeof packageStatus === 'object' && packageStatus.status) {
                const fullPackageName = `${packageScope}/${packageName}`;
                log.info('Found existing running package, beginning resource monitoring:', fullPackageName);
                this.startMonitoringFromPackage(fullPackageName);
              }
            });
          }
        });
      }
      
      // Start monitoring robot-agent immediately (it's not in runningPackages)
      this.startMonitoring('robot-agent', process.pid);
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
              cpu: Number(stats.cpu.toPrecision(3)), // CPU usage percentage (3 significant digits)
              memory: stats.memory, // Memory usage in bytes
              system: {
                cpu: Number(systemCpuLoad.currentLoad.toPrecision(3)), // Overall CPU usage percentage (3 significant digits)
                memory: systemMemInfo.used
              }
            });
          } else {
            // For other packages, we use pidusage-tree to include subprocesses
            const stats = await pidusageTree(pid); 

            const nonNullStats = _.filter(stats, stat => stat !== null && stat !== undefined);
    
            pkgData.samples.push({
              cpu: Number(
                _.reduce(nonNullStats, (sum, stat) => sum + (stat ? stat.cpu : 0), 0)
                .toPrecision(3)
              ), // CPU usage percentage (aggregated)
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

  startMonitoringFromPackage(packageName) {
    if (this.monitoredPackages[packageName]) {
      log.warn(`Already monitoring package ${packageName}, skipping`);
      return;
    }

    // Use pgrep to find the PID of the running package
    const { spawn } = require('child_process');
    const pgrep = spawn('pgrep', ['-nf', `startPackage.sh ${packageName}`, '-U', process.getuid()]);
    
    let packagePid = null;
    
    pgrep.stdout.on('data', (data) => {
      packagePid = parseInt(data.toString().trim());
      log.debug(`Found running package ${packageName} with PID: ${packagePid}`);
    });

    pgrep.on('exit', (code) => {
      if (code === 0 && packagePid) {
        // Package is running, start monitoring
        this.startMonitoring(packageName, packagePid);
      } else {
        log.debug(`Package ${packageName} not found running (exit code: ${code})`);
      }
    });

    pgrep.on('error', (err) => {
      log.error(`Error searching for package ${packageName}:`, err);
    });
  }

  startMonitoring(packageName, pid) {
    if (!this.monitoredPackages[packageName]) {
      log.info(`Starting resource monitoring for ${packageName} (PID: ${pid})`);
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
