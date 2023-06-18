const bcrypt = require('bcrypt');
const Mongo = require('@transitive-sdk/utils/mongo');
const {randomId, getLogger} = require('@transitive-sdk/utils');

const {sendEmail} = require('./email');

const log = getLogger('accounts');
log.setLevel('debug');

const SALT_ROUNDS = 10;

const createAccount = async ({name, password, email}, cb) => {
  if (name == 'bot') {
    console.error('Sorry, the account name "bot" is reserved');
    return;
  }

  const accounts = Mongo.db.collection('accounts');
  const existing = await accounts.findOne({_id: name});
  if (existing) {
    console.error('An account with that name already exists');
    cb && cb('An account with that name already exists');
  } else {

    const bcryptPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const newAccount = {
      _id: name,
      bcryptPassword,
      email,
    };

    await accounts.insertOne(newAccount);
    console.log(`New account created: ${name}`);
    cb && cb(null, newAccount);
  }
};

const changePassword = async (name, password) => {
  if (name == 'bot') {
    console.error('Sorry, the password of the reserved "bot" account cannot be changed');
    return;
  }

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
};


/** send email verification email to the named account */
const sendVerificationEmail = async (userId) => {

  const accounts = Mongo.db.collection('accounts');
  const account = await accounts.findOne({_id: userId});

  if (!account) {
    log.error('No such account');
  } else {
    log.debug('verify', account.email);
    if (!account.email) {
      log.error('Account has no email address');
      return;
    }

    const code = randomId(24);
    const protocol = JSON.parse(process.env.TR_SECURE) ? 'https' : 'http';
    const link = `${protocol}://portal.${process.env.TR_HOST
      }/@transitive-robotics/_robot-agent/verify?id=${userId}&code=${code}`;

    await accounts.updateOne({_id: userId}, {$set: {verificationCode: code}});

    sendEmail({
      to: account.email,
      subject: 'Verify your email address',
      body: `Click this link to verify your email address: <a href='${link
      }'>Verify ${account.email}</a>`
    });
  }
};

/** Verify email verification code. Return error if any, else `false` to
* indicate success. */
const verifyCode = async (userId, code) => {
  const accounts = Mongo.db.collection('accounts');
  const account = await accounts.findOne({_id: userId});

  if (!account) {
    return 'account does not exists';
  }

  if (code != account.verificationCode) {
    return 'wrong code';
  }

  await accounts.updateOne({_id: userId}, {
    $set: {
      verified: account.email,
      // generate secrets
      jwtSecret: randomId(16),
      robotToken: randomId(12),
    },
    $unset: {verificationCode: code}
  });

  return false;
};

module.exports = {createAccount, changePassword, sendVerificationEmail, verifyCode};
