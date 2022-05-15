
/** given a list of used numbers, find the next in the given range that is not
  yet used */
const getNextInRange = (allUsed, range) => {
  const used = allUsed.filter(port => port >= range[0] && port <= range[1])
      .sort();

  let i = 0;
  for (let p = range[0]; p <= range[1]; p++, i++) {
    if (p != used[i]) {
      return p;
    }
  }
};

module.exports = {getNextInRange};
