const Capability = require('./capability');
const { parseMQTTTopic } = require('@transitive-robotics/utils/server');

class RemoteAccess extends Capability {

  dbCollection = null;

  constructor({dbCollection}) {
    super();
    this.dbCollection = dbCollection;
  }

  onMessage(packet) {
    console.log(this.name, packet.payload.toString());

    const parsed = parseMQTTTopic(packet.topic);

    if (parsed.sub[0] == 'ssh_key') {
      // receive ssh key, write to database
      this.updateDevice(parsed, JSON.parse(packet.payload.toString()));
    }
  }

  async updateDevice({organization, device}, publicKey) {
    const topic = `/${organization}/${device}/${this.name}/port`;
    const _id = device;

    await this.dbCollection.updateOne({_id}, {
        $set: {'remote_access.publicKey': publicKey}
      }, {upsert: true});

    const current = await this.dbCollection.findOne({_id},
      {projection: {'remote_access.port': 1}});
    if (current && current.remote_access && current.remote_access.port) {
      // device already has an assigned port: publish it
      this.mqtt.publish(topic, JSON.stringify(current.remote_access.port));
      return;
    }

    // find first available reverse proxy port
    const all = await this.dbCollection.find({'remote_access.port': {$exists: true}},
        {projection: {'remote_access.port': 1}}).toArray();

    const ports = all.map(device => device.remote_access.port).sort();

    let candidate = 10000;
    for (let i = 0;
    i < ports.length && candidate == ports[i];
    candidate = ports[i] + 1, i++) {
      (candidate == 27000) && (candidate = 28000);
    }

    if (!isUsable(candidate)) {
      console.warn('remote-access: no usable port found!');
      return;
    }

    // assign and publish port
    this.dbCollection.updateOne({_id}, {$set: {'remote_access.port': candidate}});
    this.mqtt.publish(topic, JSON.stringify(candidate));
  }
};

// Test whether port number is usable for our purposes. These ports
// need to be open in the firewall (on AWS).
const isUsable = port => port >= 10000
  && (port < 27000 || port > 28000)
  && port < 65000;

module.exports = RemoteAccess;
