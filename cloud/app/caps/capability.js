const _ = require('lodash');

const { DataCache, toFlatObject, pathToTopic }
  = require('@transitive-robotics/utils/server');

const registry = {};

let mqttClient;

/** check whether `permissions` grant access to `topic` */
const permitted = (topic, permissions) => {
  const [_ignore, transitiveUserId, device, capability] = topic.split('/');
  return (permissions.transitiveUserId == transitiveUserId
    && (permissions.device == '+' || permissions.device == device)
    && permissions.capability == capability);
};

/** get capability name from provided class constructor name */
const getCapName = (name) => {
  const parts = name.match(/[A-Z_][^A-Z]*/g);
  return parts && parts.join('-').toLowerCase();
};

/** super class for all capabilities */
class Capability {

  /** cache of retained messages, see `cache` method */
  #cache = {};
  #data = new DataCache();

  #clients = [];

  constructor() {
    const name = getCapName(this.constructor.name);
    if (!name) {
      throw new Error('Invalid capability name',
        'Capability class names need to be camel case');
    }
    this.name = name;
    console.log('registered capability', name);

    if (!mqttClient) {
      throw new Error('Capabilities not yet initialized',
        'please call Capability.init(mqttClient) first.');
    }

    if (registry[name]) {
      console.warn(`Capability with name ${name} already exists! Ignoring,`);
    } else {
      registry[name] = this;

      this.#data.subscribe(changes => {
        for (let path in changes) {
          this.sendToPermitted(pathToTopic(path), changes[path]);
        }
      });

      // subscribe to all messages for this capability
      this.subscription = this.mqtt.subscribe(`/+/+/${name}/#`, (packet) => {
        // this.cache(packet);
        this.store(packet.topic, JSON.parse(packet.payload.toString('utf-8')));
        // this.sendToPermitted(packet.topic, packet.payload.toString('utf-8'));
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

  // /** cache the package if retain flag is set; or clear cache if empty */
  // cache({retain, topic, payload}) {
  //   if (retain) {
  //     // if (!payload.length) {
  //     //   // empty message: clear cache
  //     //   delete this.#cache[topic];
  //     // } else {
  //     //   this.#cache[topic] = payload;
  //     // }
  //     this.#data.updateFromTopic(topic, JSON.parse(payload.toString('utf-8')));
  //   }
  // }

  store(topic, obj) {
    this.#data.updateFromTopic(topic, obj);
  }

  /** get a cached value: TODO, this needs to be secured against abuse by
  third-party caps */
  getFromCache(topic) {
    // return this.#cache[topic];
    return this.#data.getByTopic(topic);
  }

  /** return from the cache all those retained messages that the given permission
  grants access to */
  getPermittedCached({transitiveUserId, device, capability}) {
    return this.#data.filter([transitiveUserId, device, capability]);
  }

  /** add client to list of clients */
  addClient({ws, permission}) {
    console.log('added client', permission);
    this.#clients.push({ws, permission});

    // send any messages that we already have in cache for these permissions
    // (device)
    const cached = this.getPermittedCached(permission);
    console.log('send permitted cached', cached);
    // #HERE
    // _.each(this.getPermittedCached(permission), (payload, topic) => {
    //   ws.send(`{ "${topic}": ${payload.toString('utf-8')} }`)
    // });
    const flat = toFlatObject(cached);
    _.forEach(flat, (value, path) => {
      ws.send(`{ "${path.replace(/\./g, '/')}": ${JSON.stringify(value)} }`)
    });
  }

  /** send topic + text to permitted clients */
  sendToPermitted(topic, text) {
    console.log('Capability: sendToPermitted', topic);
    _.each(this.#clients, ({ws, permission}) => {
      permitted(topic, permission) && ws.send(`{ "${topic}": ${text} }`)
    });
  }
};


module.exports = Capability;
