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

  // range is beyond range of currently used
  expect(getNextInRange([1,4,6,20,200], [10000, 20000]))
    .toStrictEqual({min: 10000, max: 10000});
  expect(getNextInRange([1,4,6,20,200], [10000, 20000], 20))
    .toStrictEqual({min: 10000, max: 10019});

  // range is below all used ports
  expect(getNextInRange([1001,1004,1006,1020,1200], [100, 200]))
    .toStrictEqual({min: 100, max: 100});

  // list of used ports is empty
  expect(getNextInRange([], [100, 200]))
    .toStrictEqual({min: 100, max: 100});
  expect(getNextInRange([], [100, 200], 20))
    .toStrictEqual({min: 100, max: 119});

  // range is empty
  expect(getNextInRange([1,4,6,20,200], [10000, 9000], 20))
    .toStrictEqual(null);

});
