const crypto = require('crypto')

const sharedUtils = require('./utils');

const randomId = (bytes = 16) =>
  crypto.randomBytes(bytes).toString('base64');

module.exports = Object.assign({ randomId }, sharedUtils);
