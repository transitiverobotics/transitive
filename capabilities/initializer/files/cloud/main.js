const { Capability, getLogger } = require('@transitive-sdk/utils');
const log = getLogger('test');
log.setLevel('debug');

class CloudCapability extends Capability {

  constructor() {
    super(() => {
      log.debug(`starting cloud cap ${this.fullName}`);

      // subscribe to changes published by device
      this.mqttSync.subscribe(`/+/+/${this.fullName}/device`);

      // publish a path
      this.mqttSync.publish(`/+/+/${this.fullName}/cloud`);

      // for demonstration only: print all updates from devices
      this.data.subscribePath(
        `/+org/+deviceId/${this.fullName}/device/+field`,
        (value, key, {org, deviceId, field}) => {
          log.debug('update from device:', key, value);
          // for demonstration only: update a published field
          this.data.update(`/${org}/${deviceId}/${this.fullName}/cloud/date`, new Date());
        });
    });
  }
};

new CloudCapability();
