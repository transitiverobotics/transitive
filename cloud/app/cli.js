#!/usr/bin/env node

/**
  A simple CLI tool for Transitive. For now just to create new accounts.
*/

const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

const prompt = require('prompt');
const bcrypt = require('bcrypt');

const Mongo = require('@transitive-sdk/utils/mongo');
const {randomId} = require('@transitive-sdk/utils');

const SALT_ROUNDS = 10;

process.on('unhandledRejection', (reason, promise) => {
  console.error(reason.message);
  process.exit(3);
});

yargs(hideBin(process.argv))

  .command('createaccount name', 'create a new account with the given name',
  (yargs) => yargs.positional('name', {describe: 'name of the new account'}),
  (argv) => {
    if (argv.verbose) console.info(`adding new account: ${argv.name}`);

    Mongo.init(async () => {
      const accounts = Mongo.db.collection('accounts');
      const existing = await accounts.findOne({_id: argv.name});
      if (existing) {
        console.error('An account with that name already exists');
        process.exit(1);
      } else {

        // prompt for password
        prompt.start();
        prompt.message = '';
        const {password} = await prompt.get([{
          name: 'password',
          hidden: true,
          pattern: /^.{8}.*$/,
          message: 'Invalid password (must be at least 8 characters)',
        }]);

        // bcrypt the password
        const bcryptPassword = await bcrypt.hash(password, SALT_ROUNDS);

        // generate random JWT secret
        const jwtSecret = randomId(16);
        const robotToken = randomId(12);

        const newAccount = {
          _id: argv.name,
          bcryptPassword,
          jwtSecret,
          robotToken
        };

        await accounts.insertOne(newAccount);
        console.log(`New account created. JWT Secret: ${jwtSecret}`);
        process.exit(0);
      }
    });
  })

  .command('chpass name', 'change password',
  (yargs) => yargs.positional('name', {describe: 'name of the account'}),
  (argv) => {
    if (argv.verbose) console.info(`changing password for account: ${argv.name}`);

    Mongo.init(async () => {
      const accounts = Mongo.db.collection('accounts');
      const existing = await accounts.findOne({_id: argv.name});
      if (!existing) {
        console.error('No such account');
        process.exit(1);
      } else {

        // prompt for password
        prompt.start();
        prompt.message = '';
        const {password} = await prompt.get([{
          name: 'password',
          hidden: true,
          pattern: /^.{8}.*$/,
          message: 'Invalid password (must be at least 8 characters)',
        }]);

        // bcrypt the password
        const bcryptPassword = await bcrypt.hash(password, SALT_ROUNDS);

        await accounts.updateOne({_id: existing._id}, {$set: {bcryptPassword}});
        console.log('Password updated');
        process.exit(0);
      }
    });
  })

  .demandCommand(1, 'Please specify a command.')
  .option('verbose', {
  alias: 'v',
  type: 'boolean',
  description: 'Run with verbose logging'
})
  .argv;
