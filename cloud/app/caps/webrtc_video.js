const Capability = require('./capability');
// const { parseMQTTTopic } = require('@transitive-robotics/utils/server');

class WebrtcVideo extends Capability {

  constructor() {
    super();
    console.log('webrtc-video started');

    // TODO: create a utility function in Capability for this? (publishUp?
    // with retain flag parameter)
    this.dataCache.subscribePath(`+org.+deviceId.${this.name}.+sessionId.client`,
      (value, key) => {
        console.log('publish client data to device', key, value);
        this.mqtt.publish('/' + key.replace(/\./g, '/'),
          value == null ? value : JSON.stringify(value),
          {retain: false});
      });
  }

  //   this.dataCache.subscribePath(`+org.+deviceId.${this.name}.imageTopics`,
  //     (value, key) => {
  //       console.log('forwarding image topics to ws clients', key, value);
  //       this.sendToPermitted(key, value);
  //     });
  // }
  //
  // onMessage(packet) {
  //   // console.log(this.name, packet.payload.toString());
  //   const parsed = parseMQTTTopic(packet.topic);
  //   if (parsed.sub[0] == 'ssh_key') {
  //     // receive ssh key, write to database
  //     this.updateDevice(parsed, JSON.parse(packet.payload.toString()));
  //   }
  // }
  //
  // async updateDevice({organization, device}, publicKey) {
  //   await this.dbCollection.updateOne({_id: device}, {
  //       $set: {'video_streaming.publicKey': publicKey}
  //     }, {upsert: true});
  //   this.mqtt.publish(`/${organization}/${device}/${this.name}/ready`, "true");
  // }
};

module.exports = WebrtcVideo;
