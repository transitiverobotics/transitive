const http = require('http');

const authURL = 'http://localhost:3000/accounts/checkPassword';

/** read result from HTTP get request */
const readResult = (res, cb) => {
  res.setEncoding('utf8');
  let rawData = '';
  res.on('data', (chunk) => { rawData += chunk; });
  res.on('end', () => cb(rawData));
};

/**
 * Custom Verdaccio Authenticate Plugin.
 */
class AuthCustomPlugin {

  constructor(config, options) {
    return this;
  }

  /** Authenticate an user. Asks our authentication server (currently the portal)
  to verify username (email address) and password. */
  authenticate(user, password, cb) {
    http.get(`${authURL}?username=${user}&password=${password}`, (res) => {
      const { statusCode } = res;
      if (statusCode == 200) {
        console.log('authenticate: welcome', user);
        cb(null, ['bot']);
      } else {
        console.log('authenticate: error', user, statusCode);
        readResult(res, cb);
      }
    });
  }

  /** check read-access for such user. */
  allow_access(user, pkg, callback) {
    console.log('granting read-access:', user.name, pkg.name);
    callback(null, true);
  }

  /** check grants to publish */
  allow_publish(user, pkg, callback) {
    // in cass to check if has permission to publish
    if (user && user.name != 'bot') {
      console.log('not allowed to publish!', user.name, pkg.name);
      callback('sorry, you are not allowed to publish!', false);
    } else {
      console.log('welcome, bot, you may publish', pkg.name);
      callback(null, true);
    }
  }
}

module.exports = (config, options) => {
  return new AuthCustomPlugin(config, options);
};
