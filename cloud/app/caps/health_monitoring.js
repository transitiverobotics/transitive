const Capability = require('./capability');
const { unset, updateObject } = require('../server_utils');

class HealthMonitoring extends Capability {

  store = {};
  aggregate = {};

  onMessage(packet) {
    console.log('class', packet.topic);

    const modifier = {[packet.topic]: packet.payload.toString('utf-8')};
    updateObject(this.store, modifier);

    // now: update aggregate
    // const exampleOfWhatItShouldBe = {
    //   userid: {
    //     level: 1,
    //     devices: {
    //       deviceID1: {level: 1, msg: 'warning asdas'},
    //       deviceID2: {level: 0, msg: 'ok asdas'}
    //     }
    //   }
    // };
  }
};

module.exports = HealthMonitoring;
