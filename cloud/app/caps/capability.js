
const registry = {};

let mqttClient;

/** super class for all capabilities */
class Capability {

  constructor(name) {
    if (!mqttClient) {
      throw new Error('Capabilities not yet initialized',
        'please call Capability.init(mqttClient) first.');
    }

    if (registry[name]) {
      console.warn(`Capability with name ${name} already exists! Ignoring,`);
    } else {
      registry[name] = this;
    }
  }

  /** used by capabilities (sub-classes) to contact mqtt Manager */
  get mqtt() {
    return mqttClient;
  }

  static init(_mqttClient) {
    mqttClient = _mqttClient;
  }

  static lookup(name) {
    return registry[name];
  }
}

module.exports = Capability;
