const Capability = require('./capability');
const { parseMQTTTopic } = require('@transitive-robotics/utils/server');

class VideoStreaming extends Capability {

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
    await this.dbCollection.updateOne({_id: device}, {
        $set: {'video_streaming.publicKey': publicKey}
      }, {upsert: true});
    this.mqtt.publish(`/${organization}/${device}/${this.name}/ready`, "true");
  }
};

module.exports = VideoStreaming;
