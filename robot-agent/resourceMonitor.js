const pidusageTree = require('pidusage-tree');
const _ = require('lodash');
const si = require('systeminformation');

const { getLogger } = require('@transitive-sdk/utils');

const { toPrecision } = require('./utils.js');

const log = getLogger('resourceMonitor');
log.setLevel('debug');

const SAMPLE_RATE = 5000; // Sample every X ms
const SAMPLES_PER_BATCH = 12; // Publish metrics once we have X samples


/** CPU and Memory monitoring class with subprocess tracking */
class ResourceMonitor {

  mqttSync = null;
  metricsTopic = null;
  monitoredPackages = {};
  samples = { time: [], system: {cpu: [], mem: []}, packages: {} };

  init(mqttSync, metricsTopic) {
    this.mqttSync = mqttSync;
    this.metricsTopic = metricsTopic;

    log.info('Starting resource monitoring for all monitored packages');

    // Start the periodic sampling and publishing of resource usage metrics
    setInterval(this.collectAndPublish.bind(this), SAMPLE_RATE);
  }

  /** Do one pass of collecting the metrics and adding them to mqttsync. */
  async collectAndPublish() {

    // this.sampleTimestamps.push(Date.now());
    this.samples.time.push(Date.now());

    // Always get system metrics
    const [systemCpuLoad, systemMemInfo] =
      await Promise.all([ si.currentLoad(), si.mem() ]);

    // Overall CPU usage percentage
    this.samples.system.cpu.push(toPrecision(systemCpuLoad.currentLoad, 1));
    // overall used memory percentage (excluding buffer)
    this.samples.system.mem.push(
      toPrecision(systemMemInfo.active * 100 / systemMemInfo.total, 1));


    // collect metrics for all monitored packages
    await Promise.all(_.map(this.monitoredPackages, async (pkgData, pkgName) => {
      const {pid} = pkgData;

      let stats;
      try {
        // We use pidusage-tree to include subprocesses
        stats = await pidusageTree(pid);
      } catch (err) {
        log.warn(`Failed to get resource usage for ${pkgName} (PID: ${pid}):`);
        return;
      }

      const nonNullStats = _.filter(stats, Boolean);

      // Sum the CPU usage of the process and all its sub-processes
      const cpu = toPrecision(_.sumBy(nonNullStats, stat => stat?.cpu || 0), 1);

      this.samples.packages[pkgName] ||= [];
      this.samples.packages[pkgName].push(cpu);
    }));

    if (this.samples.system.cpu.length >= SAMPLES_PER_BATCH) {
      this.publish();
    }
  }

  /** Publish the batch of samples  */
  publish() {

    _.forEach(this.samples.packages, (pkgData, pkgName) => {
      if (!this.monitoredPackages[pkgName]) {
        // package stopped during batch
        delete this.samples.packages[pkgName];
        return;
      }

      // complete samples with 0 in the front if needed
      pkgData.splice(0, 0,
        ...Array(Math.max(SAMPLES_PER_BATCH - pkgData.length, 0)).fill(0))
    });

    // publish!
    this.mqttSync.data.update(this.metricsTopic, structuredClone(this.samples));

    // Clear samples after publishing
    this.samples.time = [];
    this.samples.system.cpu = [];
    this.samples.system.mem = [];

    // for packages we clear the entire object, so that stopped packages are removed
    this.samples.packages = {};
  }


  /** Add the named package and pi to the list of packages to monitor resource
  * of. */
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

  /** Remove package from the list of packages to monitor. */
  stopMonitoring(packageName) {
    if (this.monitoredPackages[packageName]) {
      delete this.monitoredPackages[packageName];
      log.info(`Stopped resource monitoring for ${packageName}`);
    }
  }
}

const resourceMonitor = new ResourceMonitor();
module.exports = resourceMonitor;
