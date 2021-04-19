const _ = {
  set: require('lodash/set'),
  unset: require('lodash/unset'),
  get: require('lodash/get'),
  isEmpty: require('lodash/isEmpty'),
  forEach: require('lodash/forEach'),
};

/** unset the topic in that obj, and clean up parent if empty, recursively */
const unset = (obj, path) => {
  if (!path) return;
  _.unset(obj, path);
  const parentPath = path.slice(0,-1);
  const parent = _.get(obj, parentPath);
  if (_.isEmpty(parent)) {
    unset(obj, parentPath);
  }
};

/** given a modifier {"a/b/c": "xyz"} update the object `obj` such that
  obj.a.b.c = "xyz" */
const updateObject = (obj, modifier) => {
  _.forEach( modifier, (value, topic) => {
    const path = topic.split('/').slice(1);
    if (value == null) {
      unset(obj, path);
    } else {
      _.set(obj, path, value);
    }
  });
  return obj;
}

module.exports = { updateObject };
