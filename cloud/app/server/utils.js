const semver = require('semver');

const { parseMQTTTopic } = require('@transitive-sdk/utils');

/** given a list of used numbers, find the next contiguous range of ports in the
* given range that is not yet used */
const getNextInRange = (allUsed, range, count = 1) => {

  if (!allUsed?.length) {
    return {min: range[0], max: range[0] + count - 1}
  }

  const used = allUsed.sort((a, b) => a - b);
  const rtv = {min: range[0], max: null};
  for (let i = 0; i < used.length; i++) {
    const port = used[i];
    if (port >= rtv.min + count) {
      // There is enough space before this used port
      rtv.max = rtv.min + (count - 1);
      if (rtv.max > range[1]) return null;
      return rtv;
    } else {
      rtv.min = Math.max(port + 1, rtv.min);
    }
  }

  // no allocation found before or between existing used ports, try behind:
  const next = Math.max(used.at(-1) + 1, range[0]);
  if (next + count - 1 <= range[1]) {
    return {min: next, max: next + count - 1};
  }

  // no allocation possible
  return null;
};

/** Given a semver and a release type (version namespace), generate the version
*  range for it. Example: getVersionRange('1.2.3', 'minor') => 1.2.x
*/
const getVersionRange = (version, type) => {
  const range = semver.parse(version);
  const releaseTypes = ['major', 'minor', 'patch'];
  for (let i = releaseTypes.length - 1; releaseTypes[i] != type; i-- ) {
    const releaseType = releaseTypes[i];
    range[releaseType] &&= 'x';
  }
  return range.format();
};

module.exports = { getNextInRange, getVersionRange };
