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
    console.log('class', packet);
    // #HERE: reimplement using the new DataCache

    // const modifier = {[packet.topic]: packet.payload.toString('utf-8')};
    // updateObject(this.store, modifier);
    //
    // const {organization, device} = parseMQTTTopic(packet.topic);
    // const reportingTopic = `/${organization}/${device}/${this.name}/reporting`;
    // const reporting = {
    //   level: 0, // TODO: use threshold
    //   msg: 'ok',
    //   values: [{key: 'lastUpdate', value: new Date()}]
    // };
    // updateObject(this.store, {[reportingTopic]: reporting});
    // this.sendToPermitted(reportingTopic, JSON.stringify(reporting));
    //
    // this.updateAggregate(organization);
    // // publish aggregate
    // const aggTopic = `/${organization}/_fleet/${this.name}`;
    // const json = JSON.stringify(this.aggregate[organization]);
    // this.sendToPermitted(aggTopic, json);
    // this.store(aggTopic, this.aggregate[organization]);
  }

  /** Update the aggregate information (per device/customer, later also groups).
    For now this is "dumb", does a full aggregate each time. Later: only
    bubble up from the modified records (with some logic to be able to reduce levels,
  not just increase).
  */
  updateAggregate(organization) {
    // #HERE: reimplement using the new DataCache

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
      this.aggregate[organization].devices[deviceId].reporting =
        data[this.name].reporting;
    });

    // roll up devices to user ID
    this.aggregate[organization].level = 0;
    this.aggregate[organization].msgs = [];
    _.each(this.aggregate[organization].devices, ({level, msgs}, deviceId) => {
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
