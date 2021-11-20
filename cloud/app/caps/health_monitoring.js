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

  constructor() {
    super();
    // should something like this go into the constructor of Capability? for
    // things written by us, rather than coming from mqtt -- which we'd need to
    // distinguish somehow
    this.dataCache.subscribePath('+org._fleet.+ourname', (value, key, matched) => {
      // share changes to DataCache with subscribers
      // this.sendToPermitted(path, changes[path]);
      // console.log(key, matched, value);
      this.mqtt.publish('/' + key.replace(/\./g, '/'),
        value == null ? value : JSON.stringify(value),
        {retain: false});
    });
  }

  /** Update the aggregate information (per device/customer, later also groups).
    For now this is "dumb", does a full aggregate each time. Later: only
    bubble up from the modified records (with some logic to be able to reduce levels,
  not just increase).
  */
  onMessage(packet) {
    // console.log('health_monitoring', packet);
    const {organization, device} = parseMQTTTopic(packet.topic);
    if (device == '_fleet') return;
    const robotAgent = Capability.lookup('_robot-agent');

    const devices = {};
    _.forEach(this.getFromCache([organization]), (data, deviceId) => {
      if (deviceId == '_fleet') return;

      const { level, msgs } = getMaxLevel(data[this.name].diagnostics);

      const hostname = robotAgent.getFromCache(
        [organization, deviceId, '_robot-agent', 'info', 'os', 'hostname']) || null;
      const heartbeat = robotAgent.getFromCache(
        [organization, deviceId, '_robot-agent', 'status', 'heartbeat']) || null;

      devices[deviceId] = {level, msgs, hostname, heartbeat};
    });

    // roll up devices to user ID
    // console.log(`updating aggregate for /${organization}`, devices);
    const max = _.maxBy(Object.values(devices), ({level}) => level);

    this.clearFromStore([organization, '_fleet', this.name]); // TODO can I avoid this?
    max && this.store([organization, '_fleet', this.name], {level: max.level, devices});
  }

};


module.exports = HealthMonitoring;
