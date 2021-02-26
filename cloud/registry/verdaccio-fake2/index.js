/**
 * Custom Verdaccio Authenticate Plugin.
 */
class AuthCustomPlugin {
  constructor(config, options) {
    return this;
  }
  /**
   * Authenticate an user.
   * @param user user to log
   * @param password provided password
   * @param cb callback function
   */
  authenticate(user, password, cb) {
    // here your code
    console.log('yep, come in!');
    cb(null, ['my']);
  }

  /**
   * check grants for such user.
   */
  allow_access(user, pkg, callback) {
    // in case of restrict the access
    console.log('yep, access!');
    callback(null, true);
  }

  /**
   * check grants to publish
   */
  allow_publish(user, pkg, callback) {
    // in cass to check if has permission to publish
    console.log('yep, publish!');
    callback(null, true);
  }
}

module.exports = (config, options) => {
  return new AuthCustomPlugin(config, options);
};
