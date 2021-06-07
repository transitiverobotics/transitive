const _ = require('lodash');

const { DataCache, toFlatObject, pathToTopic }
  = require('@transitive-robotics/utils/server');

const registry = {};

let mqttClient;

/** check whether `permissions` grant access to `topic` */
const permitted = (path, permissions) => {
  const [transitiveUserId, device, capability] = path.split('.');
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
        // share changes to out DataCache with subscribers
        for (let path in changes) {
          this.sendToPermitted(path, changes[path]);
        }
      });

      // subscribe to all messages for this capability
      this.subscription = this.mqtt.subscribe(`/+/+/${name}/#`, (packet) => {
        if (packet.payload.length == 0) {
          this.store(packet.topic, null);
        } else {
          const json = JSON.parse(packet.payload.toString('utf-8'));
          this.store(packet.topic, json);
        }
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

  get dataCache() {
    return this.#data;
  }

  /** update the data-cache, this also triggers any subscribers to its changes */
  store(topicOrPath, obj) {
    if (topicOrPath instanceof Array) {
      this.#data.update(topicOrPath, obj);
    } else {
      this.#data.updateFromTopic(topicOrPath, obj);
    }
  }

  clearFromStore(path) {
    this.#data.update(path, null);
  }

  /** get a cached value: TODO, this needs to be secured against abuse by
  third-party caps */
  getFromCache(topicOrPath) {
    if (topicOrPath instanceof Array) {
      return this.#data.get(topicOrPath);
    } else {
      return this.#data.getByTopic(topicOrPath);
    }
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
    // console.log('send permitted cached', cached);
    const flat = toFlatObject(cached);
    _.forEach(flat, (value, path) => {
      ws.send(`{ "${pathToTopic(path)}": ${JSON.stringify(value)} }`)
    });

    const {transitiveUserId, device, capability} = permission;
    ws.on('message', (message) => {
      // message received from this specific client (with specific permissions)
      const changes = JSON.parse(message);
      // console.log(this.name, permission, 'received', changes);

      for (let path in changes) {
        // verify permission for the changed path
        const [changeUserId, changeDevice, changeCapability] = path.split('.');
        if (changeUserId == transitiveUserId && changeDevice == device
          && changeCapability == capability) {

          console.log('updating cache', path, changes[path]);
          this.store(path, changes[path]);
        } else {
          console.log('denied ws client with permission', permission,
            'to change', path);
        }
      }
    });
  }

  /** send path + text to permitted clients */
  sendToPermitted(path, text) {
    // console.log('Capability: sendToPermitted', path);
    _.forEach(this.#clients, ({ws, permission}) => {
      permitted(path, permission) &&
        ws.send(`{ "${pathToTopic(path)}": ${JSON.stringify(text)} }`)
    });
  }
};


module.exports = Capability;
