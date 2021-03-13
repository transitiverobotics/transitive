const TRANSITIVE_DIR = `${process.env.HOME}/.transitive`;
const BINDIR = `${TRANSITIVE_DIR}/usr/bin`;
const NPM = `${BINDIR}/node ${BINDIR}/npm`;

module.exports = {TRANSITIVE_DIR, BINDIR, NPM};
