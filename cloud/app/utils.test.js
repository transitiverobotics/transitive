const {getNextInRange} = require('./utils');

test('getNextInRange', () => {
  expect(getNextInRange([1,4,6,20,200], [5, 10])).toBe(5);
  expect(getNextInRange([1,4,5,6,20,200], [5, 10])).toBe(7);
});
