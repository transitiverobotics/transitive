#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {cp, mv, ls, exec} = require('shelljs');
const chalk = require('chalk');

// Determine folder and ensure it exists
const dir = path.resolve(process.cwd(), process.argv[2] || '');
fs.mkdirSync(dir, {recursive: true});
process.chdir(dir);

// Copy files
cp('-r', path.resolve(__dirname, 'files/{.??,}*'), '.');

// Get name from folder
const capName = path.basename(dir);

console.log('Creating', capName);

// Rename web component files to include cap name
mv(`web/device.jsx`, `web/${capName}-device.jsx`);
mv(`web/fleet.jsx`, `web/${capName}-fleet.jsx`);

// Rename _* to .*. These files need to be prefixed in order to avoid them
// taking effect in the initializer package itself, e.g., .npmignore.
ls('_*').forEach( file => mv(file, file.replace(/^_/, '.')) );

// Write back updated package.json
const package = require(`${dir}/package.json`);
package.name = `@local/${capName}`;
fs.writeFileSync('package.json', JSON.stringify(package, true, 2));

// Run `npm install`, which, in dev, recurses into robot and cloud as well
exec('npm install');

console.log(`
${chalk.blue(Array(80).fill('-').join(''))}

  Done creating ${chalk.yellow(capName)}! 🚀
  Next, you'll typically start it locally by running ${chalk.green('npm start')}
  inside the ${capName} folder.
`);
