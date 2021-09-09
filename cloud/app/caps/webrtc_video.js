const crypto = require('crypto');

const Capability = require('./capability');
// const { parseMQTTTopic } = require('@transitive-robotics/utils/server');

const SECRET = 'iuh38047uiaef';

/** Create short-term credentials valid for `duration` seconds
  from https://stackoverflow.com/a/35767224/1087119 */
const getTURNCredentials = (name, secret, duration = 24 * 3600) => {
  const unixTimeStamp = parseInt(Date.now() / 1000) + duration;
  const username = `${unixTimeStamp}:${name}`;
  const hmac = crypto.createHmac('sha1', secret);
  hmac.setEncoding('base64');
  hmac.write(username);
  hmac.end();
  const password = hmac.read();
  return { username, password };
}


class WebrtcVideo extends Capability {

  constructor() {
    super();

    // TODO: create a utility function in Capability for this? (publishUp?
    // with retain flag parameter)
    this.dataCache.subscribePath(`+org.+deviceId.${this.name}.+sessionId.client.+type`,
      (value, key, {org, deviceId, sessionId, type}) => {

        console.log('publish client data to device', key, value);

        if (type == 'request') {
          // generate short-term TURN credentials for this user and session:
          const {username, password} =
            getTURNCredentials(`${org}.${deviceId}.${sessionId}`, SECRET);
          // attach them to the request to the server:
          const parsed = JSON.parse(value);
          parsed.turnCredentials = {username, password};
          value = JSON.stringify(parsed);
          // change key to indicate that this was not just pass-through
          key += 'WithTURNCredentials';
          // this.mqtt.publish(
          //   `/${org}/${deviceId}/${this.name}/${sessionId}/TURNcredentials`,
          //   JSON.stringify(JSON.stringify({username, password})),
          //   {retain: false});
        }

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
