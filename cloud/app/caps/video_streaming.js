const Capability = require('./capability');
const { parseMQTTTopic } = require('@transitive-robotics/utils/server');

class VideoStreaming extends Capability {

  dbCollection = null;

  constructor({dbCollection}) {
    super();
    this.dbCollection = dbCollection;

    this.dataCache.subscribePath(`+org.+deviceId.${this.name}.video_source`,
      (value, key) => {
        console.log('publish config to device', key, value);
        this.mqtt.publish('/' + key.replace(/\./g, '/'),
          value == null ? value : JSON.stringify(value), {retain: true});
      });

    this.dataCache.subscribePath(`+org.+deviceId.${this.name}.imageTopics`,
      (value, key) => {
        console.log('forwarding image topics to ws clients', key, value);
        this.sendToPermitted(key, value);
      });
  }

  onMessage(packet) {
    // console.log(this.name, packet.payload.toString());
    const parsed = parseMQTTTopic(packet.topic);
    if (parsed.sub[0] == 'ssh_key') {
      // receive ssh key, write to database
      this.updateDevice(parsed, JSON.parse(packet.payload.toString()));
    }
  }

  async updateDevice({organization, device}, publicKey) {
    await this.dbCollection.updateOne({_id: device}, {
        $set: {'video_streaming.publicKey': publicKey}
      }, {upsert: true});
    this.mqtt.publish(`/${organization}/${device}/${this.name}/ready`, "true");
  }
};

module.exports = VideoStreaming;
