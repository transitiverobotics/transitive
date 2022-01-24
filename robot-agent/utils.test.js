const assert = require('assert');
const { getInstalledPackages } = require('./utils');

describe('utils', function() {
  // currently only used for its output (manually inspected test)
  it('should get installed packages', function() {
    const list = getInstalledPackages();
    console.log(list);
  });
});
