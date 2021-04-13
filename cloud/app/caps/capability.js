const _ = require('lodash');

const registry = {};

let mqttClient;

/** check whether `permissions` grant access to `topic` */
const permitted = (topic, permissions) => {
  const [_, transitiveUserId, device, capability] = topic.split('/');
  return (permissions.transitiveUserId == transitiveUserId
    && permissions.device == device
    && permissions.capability == capability);
};

/** get capability name from provided class constructor name */
const getCapName = (name) => {
  const parts = name.match(/[A-Z][^A-Z]*/g);
  return parts && parts.join('-').toLowerCase();
};

/** super class for all capabilities */
class Capability {

  /** cache of retained messages, see `cache` method */
  #cache = {};

  #clients = [];

  constructor() {
    const name = getCapName(this.constructor.name);
    if (!name) {
      throw new Error('Invalid capability name',
        'Capability class names need to be camel case');
    }
    this.name = name;

    if (!mqttClient) {
      throw new Error('Capabilities not yet initialized',
        'please call Capability.init(mqttClient) first.');
    }

    if (registry[name]) {
      console.warn(`Capability with name ${name} already exists! Ignoring,`);
    } else {
      registry[name] = this;

      // subscribe to all messages for this capability
      this.subscription = this.mqtt.subscribe(`/+/+/${name}/#`, (packet) => {
        this.cache(packet);
        this.sendToPermitted(packet.topic, packet.payload.toString('utf-8'));
        // if sub-class has a special handler, call it; this is common
        this.onMessage && this.onMessage(packet);
      });
    }
  }

  static init(_mqttClient) {
    mqttClient = _mqttClient;
  }

  static lookup(name) {
    return registry[name];
  }

  /** used by capabilities (sub-classes) to contact mqtt Manager */
  get mqtt() {
    return mqttClient;
  }

  /** cache the package if retain flag is set; or clear cache if empty */
  cache({retain, topic, payload}) {
    if (retain) {
      if (!payload.length) {
        // empty message: clear cache
        delete this.#cache[topic];
      } else {
        this.#cache[topic] = payload;
      }
    }
  }

  /** return from the cache all those retained messages that the given permission
  grants access to */
  getPermittedCached(permission) {
    return _.pickBy(this.#cache, (pl, topic) => permitted(topic, permission));
  }

  /** add client to list of clients */
  addClient({ws, permission}) {
    console.log('added client', permission);
    this.#clients.push({ws, permission});

    // send any messages that we already have in cache for these permissions
    // (device)
    _.each(this.getPermittedCached(permission),
      (payload, topic) => ws.send(`{ "${topic}": ${payload.toString('utf-8')} }`));
  }

  /** send topic + text to permitted clients */
  sendToPermitted(topic, text) {
    _.each(this.#clients, ({ws, permission}) =>
      permitted(topic, permission) && ws.send(`{ "${topic}": ${text} }`));
  }
}

module.exports = Capability;
