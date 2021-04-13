const crypto = require('crypto')

const randomId = (bytes = 16) =>
  crypto.randomBytes(bytes).toString('base64');

module.exports = { randomId };
