const fs = require('fs');
const constants = require('./constants');

module.exports = {
  /** parse topic name used in MQTT */
  parseMQTTTopic: (topic) => {
    const parts = topic.split('/');
    return {
      organization: parts[1],
      device: parts[2],
      capability: parts[3],
      sub: parts.slice(4)
    }
  },

  getInstalledPackages: () =>
  fs.readdirSync(`${constants.TRANSITIVE_DIR}/packages`,
    {withFileTypes: true}).filter(f => f.isDirectory()).map(f => f.name)
};
