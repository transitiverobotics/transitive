#!/usr/bin/env node

/**
  A simple CLI tool for Transitive. For now just to create new accounts.
*/

const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

const prompt = require('prompt');
const {createAccount, changePassword} = require('./accounts');

const SALT_ROUNDS = 10;

process.on('unhandledRejection', (reason, promise) => {
  console.error(reason.message);
  process.exit(3);
});

yargs(hideBin(process.argv))

  .command('createaccount name', 'create a new account with the given name',
  (yargs) => yargs.positional('name', {describe: 'name of the new account'}),
  async (argv) => {
    if (argv.verbose) console.info(`adding new account: ${argv.name}`);

    // prompt for password
    prompt.start();
    prompt.message = '';
    const {password} = await prompt.get([{
      name: 'password',
      hidden: true,
      pattern: /^.{8}.*$/,
      message: 'Invalid password (must be at least 8 characters)',
    }]);

    createAccount(argv.name, password, () => process.exit(0));
  })

  .command('chpass name', 'change password',
  (yargs) => yargs.positional('name', {describe: 'name of the account'}),
  async (argv) => {
    if (argv.verbose) console.info(`changing password for account: ${argv.name}`);

    // prompt for password
    prompt.start();
    prompt.message = '';
    const {password} = await prompt.get([{
      name: 'password',
      hidden: true,
      pattern: /^.{8}.*$/,
      message: 'Invalid password (must be at least 8 characters)',
    }]);

    changePassword(argv.name, password, () => process.exit(0));
  })

  .demandCommand(1, 'Please specify a command.')
  .option('verbose', {
  alias: 'v',
  type: 'boolean',
  description: 'Run with verbose logging'
})
  .argv;
