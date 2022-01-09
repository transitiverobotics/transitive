const localStorage = require('@verdaccio/local-storage');
const fs = require('fs');

class EventedLocalDatabase extends localStorage.LocalDatabase {

  add(name, cb) {
    if (this.data.list.indexOf(name) === -1) {
      this.data.list.push(name);
      this.config.onNew && this.config.onNew(name);
      cb(this._sync());
    } else {
      cb(null);
    }
    this.config.onAdd && this.config.onAdd(name);
  }

  getPackageStorage(packageName) {
    const localFs = super.getPackageStorage(packageName);

    // monkey-patch the updatePackage function
    localFs._original_updatePackage = localFs.updatePackage;
    localFs.updatePackage =
      (name, updateHandler, onWrite, transformPackage, onEnd) => {
        localFs._original_updatePackage(name, updateHandler, onWrite, transformPackage,
          (...args) => {
            console.log('onEnd!', packageName, ...args);
            this.config.onUpdatePackage && this.config.onUpdatePackage(packageName);
            onEnd(...args);
          });
      };

    return localFs;
  }
  //
  // search(a, ...args) {
  //   console.log('my search', this, a.toString(), args);
  // }
};

module.exports = {
  LocalDatabase: EventedLocalDatabase,
  default: EventedLocalDatabase
};
