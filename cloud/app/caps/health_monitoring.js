const Capability = require('./capability');
const { unset, updateObject, parseMQTTTopic } = require('../server_utils');
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

  store = {};
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
    // console.log('class', packet.topic);

    const modifier = {[packet.topic]: packet.payload.toString('utf-8')};
    updateObject(this.store, modifier);

    const {organization} = parseMQTTTopic(packet.topic);
    this.updateAggregate(organization);
    const aggTopic = `/${organization}/_fleet/${this.name}`;
    const json = JSON.stringify(this.aggregate[organization]);
    this.sendToPermitted(aggTopic, json);
    this.cache({
      retain: true,
      topic: aggTopic,
      payload: Buffer.from(json)
    });
  }

  /** Update the aggregate information (per device/customer, later also groups).
    For now this is "dumb", does a full aggregate each time. Later: only
    bubble up from the modified records (with some logic to be able to reduce levels,
  not just increase).
  */
  updateAggregate(organization) {

    // for each device: roll up into diagnostics level
    _.each(this.store[organization], (data, deviceId) => {
      const max = getMaxLevel(data[this.name].diagnostics);
      max && _.set(this.aggregate, `${organization}.devices.${deviceId}`, max);

      const infoBuffer = Capability.lookup('_robot-agent')
          .getFromCache(`/${organization}/${deviceId}/_robot-agent/info`);
      const info = infoBuffer && JSON.parse(infoBuffer.toString('utf-8'));
      this.aggregate[organization].devices[deviceId].hostname =
        info && info.os && info.os.hostname;
      // might be better to use _robot-agent heartbeat in the future,
      // but getting that updated here in the code is not straightforward right now
      this.aggregate[organization].devices[deviceId].lastUpdate = new Date();
    });

    // roll up devices to user ID
    this.aggregate[organization].level = 0;
    this.aggregate[organization].msgs = [];
    _.each(this.aggregate[organization].devices,
      ({level, msgs}, deviceId) => {
        if (level > this.aggregate[organization].level) {
          this.aggregate[organization].level = level;
        }
        if (level > 0) {
          this.aggregate[organization].msgs.push(`${deviceId}: ${msgs.join(', ')}`);
        }
      });
  }
};


module.exports = HealthMonitoring;
