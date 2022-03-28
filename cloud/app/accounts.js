const bcrypt = require('bcrypt');
const Mongo = require('@transitive-sdk/utils/mongo');
const {randomId} = require('@transitive-sdk/utils');

const SALT_ROUNDS = 10;

const createAccount = (name, password, cb) => {
  if (name == 'bot') {
    console.error('Sorry, the account name "bot" is reserved');
    return;
  }

  Mongo.init(async () => {
    const accounts = Mongo.db.collection('accounts');
    const existing = await accounts.findOne({_id: name});
    if (existing) {
      console.error('An account with that name already exists');
      cb && cb('An account with that name already exists');
    } else {

      // bcrypt the password
      const bcryptPassword = await bcrypt.hash(password, SALT_ROUNDS);

      // generate random JWT secret
      const jwtSecret = randomId(16);
      const robotToken = randomId(12);

      const newAccount = {
        _id: name,
        bcryptPassword,
        jwtSecret,
        robotToken
      };

      await accounts.insertOne(newAccount);
      console.log(`New account created: ${name}`);
      cb && cb(null, name);
    }
  });
};

const changePassword = (name, password) => {
  if (name == 'bot') {
    console.error('Sorry, the password of the reserved "bot" account cannot be changed');
    return;
  }

  Mongo.init(async () => {
    const accounts = Mongo.db.collection('accounts');
    const existing = await accounts.findOne({_id: name});
    if (!existing) {
      console.error('No such account');
      cb && cb('No such account');
    } else {

      // bcrypt the password
      const bcryptPassword = await bcrypt.hash(password, SALT_ROUNDS);

      await accounts.updateOne({_id: existing._id}, {$set: {bcryptPassword}});
      console.log('Password updated');
      cb && cb(null, name);
    }
  });
};

module.exports = {createAccount, changePassword};
