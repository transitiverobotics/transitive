const {getNextInRange, getVersionRange, isAuthorized} = require('./utils');

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


test('getVersionRange', () => {
  expect(getVersionRange('1.2.3', 'minor')).toEqual('1.2.x');
  expect(getVersionRange('1.2.3', 'patch')).toEqual('1.2.3');
  expect(getVersionRange('1.2.3', 'major')).toEqual('1.x.x');
});


describe('isAuthorized', () => {
  test('simple', () => {
    expect(isAuthorized('/user1/dev1/@scope/capName/0.1.2/myfield', 'user1', {
      id: 'user1',
      device: 'dev1',
      capability: '@scope/capName',
      validity: 1000,
      iat: Date.now() / 1000,
    })).toBeTruthy();
  });

  test('simple fleet permission', () => {
    expect(isAuthorized('/user1/dev1/@scope/capName/0.1.2/myfield', 'user1', {
      id: 'user1',
      device: '_fleet',
      capability: '@scope/capName',
      validity: 1000,
      iat: Date.now() / 1000,
    })).toBeTruthy();
  });

  // False ones
  test('wrong user', () => {
    expect(isAuthorized('/user1/dev1/@scope/capName/0.1.2/myfield', 'user2', {
      id: 'user1',
      device: 'dev1',
      capability: '@scope/capName',
      validity: 1000,
      iat: Date.now() / 1000,
    })).toBeFalsy();
    expect(isAuthorized('/user1/dev1/@scope/capName/0.1.2/myfield', 'user1', {
      id: 'user2',
      device: 'dev1',
      capability: '@scope/capName',
      validity: 1000,
      iat: Date.now() / 1000,
    })).toBeFalsy();
    expect(isAuthorized('/user2/dev1/@scope/capName/0.1.2/myfield', 'user1', {
      id: 'user1',
      device: 'dev1',
      capability: '@scope/capName',
      validity: 1000,
      iat: Date.now() / 1000,
    })).toBeFalsy();
  });

  test('wrong capability', () => {
    expect(isAuthorized('/user1/dev1/@scope/capName/0.1.2/myfield', 'user1', {
      id: 'user1',
      device: 'dev1',
      capability: '@scope/capNameWrong',
      validity: 1000,
      iat: Date.now() / 1000,
    })).toBeFalsy();
  });

  test('wrong device', () => {
    expect(isAuthorized('/user1/dev1/@scope/capName/0.1.2/myfield', 'user1', {
      id: 'user1',
      device: 'dev2',
      capability: '@scope/capName',
      validity: 1000,
      iat: Date.now() / 1000,
    })).toBeFalsy();

    expect(isAuthorized('/user1/_fleet/@scope/capName/0.1.2/myfield', 'user1', {
      id: 'user1',
      device: 'dev1',
      capability: '@scope/capName',
      validity: 1000,
      iat: Date.now() / 1000,
    })).toBeFalsy();
  });

  test('expired', () => {
    expect(isAuthorized('/user1/dev1/@scope/capName/0.1.2/myfield', 'user1', {
      id: 'user1',
      device: 'dev1',
      capability: '@scope/capName',
      validity: 10,
      iat: Date.now() / 1000 - 20,
    })).toBeFalsy();
  });

  test('permitted topics', () => {
    expect(isAuthorized('/user1/dev1/@scope/capName/0.1.2/myfield', 'user1', {
      id: 'user1',
      device: 'dev1',
      capability: '@scope/capName',
      validity: 1000,
      iat: Date.now() / 1000,
      topics: ['myfield', 'myfield2']
    })).toBeTruthy();

    expect(isAuthorized('/user1/dev1/@scope/capName/0.1.2/myfield', 'user1', {
      id: 'user1',
      device: 'dev1',
      capability: '@scope/capName',
      validity: 1000,
      iat: Date.now() / 1000,
      topics: ['myfield3']
    })).toBeFalsy();
  });

  describe('robot-agent', () => {
    test('any device token gives read-access only', () => {
      expect(isAuthorized('/user1/dev1/@transitive-robotics/_robot-agent/0.1.2/myfield', 'user1', {
        id: 'user1',
        device: 'dev1',
        capability: '@scope/capName',
        validity: 1000,
        iat: Date.now() / 1000,
      })).toBeFalsy();

      expect(isAuthorized('/user1/dev1/@transitive-robotics/_robot-agent/0.1.2/myfield', 'user1', {
        id: 'user1',
        device: 'dev1',
        capability: '@scope/capName',
        validity: 1000,
        iat: Date.now() / 1000,
      }, true)).toBeTruthy();

      expect(isAuthorized('/user1/dev1/@transitive-robotics/_robot-agent/0.1.2/myfield', 'user1', {
        id: 'user2',
        device: 'dev1',
        capability: '@scope/capName',
        validity: 1000,
        iat: Date.now() / 1000,
      }, true)).toBeFalsy();
    });

    test('any _fleet token gives read-access only', () => {
      expect(isAuthorized('/user1/dev1/@transitive-robotics/_robot-agent/0.1.2/myfield', 'user1', {
        id: 'user1',
        device: '_fleet',
        capability: '@scope/capName',
        validity: 1000,
        iat: Date.now() / 1000,
      })).toBeFalsy();

      expect(isAuthorized('/user1/dev1/@transitive-robotics/_robot-agent/0.1.2/myfield', 'user1', {
        id: 'user1',
        device: '_fleet',
        capability: '@scope/capName',
        validity: 1000,
        iat: Date.now() / 1000,
      }, true)).toBeTruthy();
    });

  });
});