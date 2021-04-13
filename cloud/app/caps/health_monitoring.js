const Capability = require('./capability');

const NS = 'health-monitoring';

class HealthMonitoring extends Capability {

  constructor() {
    super(NS);
    const subscription = this.mqtt.subscribe('/+/+/health-monitoring/#', (text) => {
      console.log(text);
    });
  }
};

module.exports = HealthMonitoring;
