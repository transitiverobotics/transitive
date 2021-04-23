const Capability = require('./capability');
const { updateObject, parseMQTTTopic } = require('@transitive-robotics/utils/server');
const _ = require('lodash');


/** get max level and corresponding msg, prefixed by sensor name */
const getMaxLevel = (obj) => {
  let level = 0;
  let msgs = [];
  _.each(obj, (status, sensorName) => {
    const statusLevel = Number(status.level);
    if (statusLevel > level) {
      level = statusLevel;
    }
    if (statusLevel > 0) {
      msgs.push(`${sensorName}: ${status.message}`);
    }
  });
  return {level, msgs};
};


class HealthMonitoring extends Capability {

  // store = {};
  aggregate = {};
  // Example:
  // {
  //   userid: {
  //     level: 1,
  //     msgs: ['deviceID1: warning asdf']
  //     devices: {
  //       deviceID1: {level: 1, msg: 'warning asdf'},
  //       deviceID2: {level: 0, msg: 'ok sdfg'}
  //     }
  //   }
  // }


  onMessage(packet) {
    // console.log('class', packet);
    const {organization, device} = parseMQTTTopic(packet.topic);
    this.updateAggregate(organization);
  }

  /** Update the aggregate information (per device/customer, later also groups).
    For now this is "dumb", does a full aggregate each time. Later: only
    bubble up from the modified records (with some logic to be able to reduce levels,
  not just increase).
  */
  updateAggregate(organization) {
    const devices = {};
    _.forEach(this.getFromCache([organization]), (data, deviceId) => {
      if (deviceId == '_fleet') return;

      const { level, msgs } = getMaxLevel(data[this.name].diagnostics);
      const hostname = Capability.lookup('_robot-agent').getFromCache(
        [organization, deviceId, '_robot-agent', 'info', 'os', 'hostname']) || null;

      const heartbeat = Capability.lookup('_robot-agent').getFromCache(
        [organization, deviceId, '_robot-agent', 'status', 'heartbeat']) || null;

      devices[deviceId] = {level, msgs, hostname, heartbeat};
    });

    // roll up devices to user ID
    let max = 0;
    _.each(devices, ({level}, deviceId) => level > max && (max = level));
    this.store([organization, '_fleet', this.name], {level: max, devices});
  }
};


module.exports = HealthMonitoring;
