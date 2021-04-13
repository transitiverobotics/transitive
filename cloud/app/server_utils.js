const crypto = require('crypto')

const sharedUtils = require('./utils');

const randomId = (bytes = 16) =>
  crypto.randomBytes(bytes).toString('base64');


/** COPIED from portal utils: TODO: merge such utils somewhere */
const parseMQTTTopic = (topic) => {
  const parts = topic.split('/');
  return {
    organization: parts[1],
    device: parts[2],
    capability: parts[3],
    sub: parts.slice(4)
  }
};

module.exports = Object.assign({
    randomId,
    parseMQTTTopic
  }, sharedUtils);
