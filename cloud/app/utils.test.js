
const assert = require('assert');
const { updateObject } = require('./utils');

describe('utils', function() {

  describe('updateObject', function() {
    it('should resolve a/b/c/d', function() {
      assert.deepEqual(
        updateObject({}, {'/a/b/c/d': 1}),
        {a: {b: {c: {d: 1}}}}
      );
    });

    it('should update entire sub-objects', function() {
      assert.deepEqual(
        updateObject({a: {b: {c: {d: 1}}}}, {'/a/b/c': {d: 2, e: 3}}),
        {a: {b: {c: {d: 2, e: 3}}}}
      );
    });

    it('should unset null values', function() {
      assert.deepEqual(
        updateObject({a: {b: 1, c: 2}}, {'/a/b': null}),
        {a: {c: 2}}
      );
    });
  });
});
