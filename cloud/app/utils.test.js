const {getNextInRange} = require('./utils');

test('getNextInRange', () => {
  expect(getNextInRange([1,4,6,20,200], [5, 10])).toStrictEqual({min: 5, max: 5});
  expect(getNextInRange([1,4,5,6,20,200], [5, 10])).toStrictEqual({min: 7, max: 7});
  expect(getNextInRange([20,200], [5, 10])).toStrictEqual({min: 5, max: 5});

  expect(getNextInRange([1,2,3,4,5,8,200], [5, 30], 5))
    .toStrictEqual({min: 9, max: 13});

  expect(getNextInRange([1,2,3,4,5,8,200], [5, 10000], 100))
    .toStrictEqual({min: 9, max: 108});

  expect(getNextInRange([1,2,3,4,5,8,200], [5, 10000], 1000))
    .toStrictEqual({min: 201, max: 1200});

  // range too narrow
  expect(getNextInRange([1,4,6,7,8,20], [5, 10], 4)).toStrictEqual(null);
});
