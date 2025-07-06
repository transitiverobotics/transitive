const bcrypt = require('bcrypt');
const {randomId, getLogger} = require('@transitive-sdk/utils');
const Mongo = require('@transitive-sdk/mongo');

const {sendEmail} = require('./email');

const log = getLogger('accounts');
log.setLevel('debug');

const SALT_ROUNDS = 10;

/** Create a new account */
const createAccount = async ({name, password, email, admin, verified}, cb) => {
  if (name == 'bot') {
    log.error('Sorry, the account name "bot" is reserved');
    return;
  }

  const accounts = Mongo.db.collection('accounts');
  const existing = await accounts.findOne({_id: name});
  if (existing) {
    log.warn('An account with that name already exists');
    cb && cb('An account with that name already exists');
  } else {

    const bcryptPassword = password && await bcrypt.hash(password, SALT_ROUNDS);
    const newAccount = {
      _id: name,
      bcryptPassword,
      email,
      created: new Date(),
      // if admin, i.e., auto-created internally:
      ...admin && {
        admin: true,
        verified: true,
        free: true,
        jwtSecret: randomId(48),
        robotToken: randomId(12),
      },
        // if already verified, e.g., from Google Login
      ...verified && {
        verified,
        jwtSecret: randomId(48),
        robotToken: randomId(12),
      }
    };

    await accounts.insertOne(newAccount);
    log.info(`New account created: ${name}`);
    cb && cb(null, newAccount);
    return newAccount;
  }
};

const changePassword = async (name, password, cb = undefined) => {
  if (name == 'bot') {
    log.error('Sorry, the password of the reserved "bot" account cannot be changed');
    return;
  }

  const accounts = Mongo.db.collection('accounts');
  const existing = await accounts.findOne({_id: name});
  if (!existing) {
    log.warn('No such account');
    cb && cb('No such account');
  } else {

    // bcrypt the password
    const bcryptPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // set new password and unset reset requests (if any)
    await accounts.updateOne({_id: existing._id},
      {$set: {bcryptPassword}, $unset: {reset: 1}});
    log.info('Password updated for', name);
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
    const protocol = JSON.parse(process.env.PRODUCTION || false) ? 'https' : 'http';
    const link = `${protocol}://portal.${process.env.TR_HOST
      }/@transitive-robotics/_robot-agent/verify?id=${userId}&code=${
      encodeURIComponent(code)}`;

    await accounts.updateOne({_id: userId}, {$set: {verificationCode: code}});

    sendEmail({
      to: account.email,
      subject: 'Verify your email address',
      html: `Click this link to verify your email address: <a href='${link
      }'>Verify ${account.email}</a>`
    });
  }
};

const sendResetPasswordEmail = async (account) => {

  if (!account) {
    log.error('No such account');
  } else {
    if (!account.verified) {
      log.error('Account has no verified email address');
      return;
    }
    const userId = account._id;

    const code = randomId(24);
    const protocol = JSON.parse(process.env.PRODUCTION || false) ? 'https' : 'http';
    const link = `${protocol}://portal.${process.env.TR_HOST
      }/reset?id=${userId}&code=${encodeURIComponent(code)}`;

    const accounts = Mongo.db.collection('accounts');
    await accounts.updateOne({_id: userId},
      {$set: {reset: {code, sent: Date.now()}}});

    sendEmail({
      to: account.verified,
      subject: 'Your Transitive login',
      html: `Your username is <b>${account._id
      }</b>. If you forgot your password you can <a href='${link
      }'>reset it</a>.`
    });
  }
};

/** Verify email verification code. Return error if any, else `false` to
* indicate success. */
const verifyCode = async (userId, code) => {
  const accounts = Mongo.db.collection('accounts');
  const account = await accounts.findOne({_id: userId});

  if (!account) {
    return {error: 'account does not exists'};
  }

  if (code != account.verificationCode) {
    return {error: 'wrong code'};
  }

  await accounts.updateOne({_id: userId}, {
    $set: {
      verified: account.email,
      // generate secrets
      jwtSecret: randomId(48),
      robotToken: randomId(12),
    },
    $unset: {verificationCode: code}
  });

  const updatedAccount = await accounts.findOne({_id: userId});

  return {account: updatedAccount};
};

module.exports = {createAccount, changePassword, sendVerificationEmail,
  verifyCode, sendResetPasswordEmail};
