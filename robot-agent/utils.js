const fs = require('fs');
const constants = require('./constants');

/** given a path, list all sub-directories by name */
const getSubDirs = (path) => fs.readdirSync(path, {withFileTypes: true})
    .filter(f => f.isDirectory())
    .map(f => f.name);

module.exports = {
  getInstalledPackages: () => {
    const basePath = `${constants.TRANSITIVE_DIR}/packages`;
    const list = getSubDirs(basePath);

    const lists = list.map(dir => {
      if (dir.startsWith('@')) {
        // it's a scope, not a package, list packages in that scope
        const sublist = getSubDirs(`${basePath}/${dir}`);
        return sublist.map(subdir => `${dir}/${subdir}`);
      } else {
        return [dir];
      }
    });
    return [].concat(...lists); // flatten
  }
};
