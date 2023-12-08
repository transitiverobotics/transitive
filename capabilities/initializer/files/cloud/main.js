const { Capability, getLogger } = require('@transitive-sdk/utils');
const log = getLogger('test');
log.setLevel('debug');

class CloudCapability extends Capability {

  constructor() {
    super(() => {
      log.debug(`starting cloud cap ${this.fullName}`);
      // The member this.fullName is set to scope/capName/version by Capability

      // subscribe to changes published by device
      this.mqttSync.subscribe(`/+/+/${this.fullName}/device`);

      // publish a path
      this.mqttSync.publish(`/+/+/${this.fullName}/cloud`);

      // Example of subscribing to changes from device
      this.data.subscribePath(`/+org/+deviceId/${this.fullName}/device/+field`,
        (value, key, {org, deviceId, field}) => {
          // value is the value at that path
          // key is the full path
          // {org, deviceId, field} are the matched fields from the wildcards

          log.debug('update from device:', key, value);

          // Example of how to add data from the cloud
          this.data.update(`/${org}/${deviceId}/${this.fullName}/cloud/date`,
            new Date());
        });
    });
  }
};

new CloudCapability();
