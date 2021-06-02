const fs = require('fs');
const constants = require('./constants');

module.exports = {
  getInstalledPackages: () => fs.readdirSync(
    `${constants.TRANSITIVE_DIR}/packages`, {withFileTypes: true}
  ).filter(f => f.isDirectory()).map(f => f.name),
};
