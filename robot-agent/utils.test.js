const assert = require('assert');
const { getInstalledPackages, toPrecision } = require('./utils');

describe('utils', function() {
  // currently only used for its output (manually inspected test)
  it('should get installed packages', function() {
    const list = getInstalledPackages();
    console.log(list);
  });

  describe('toPrecision', function() {
    it('should be correct', function() {
      assert.equal( toPrecision(3.1234, 0), 3);
      assert.equal( toPrecision(3.1234, 1), 3.1);
      assert.equal( toPrecision(3.1234, 2), 3.12);
      assert.equal( toPrecision(3.1234, 6), 3.1234);

      assert.equal( toPrecision(312.34, -1), 310);
    });
  });

});
