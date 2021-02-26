#!/bin/bash

if [[ $# > 0 ]]; then
  HOST=$1
else
  HOST=http://localhost:6000
fi;

if (node -e "x = `npm show --json`; y = `cat package.json`; if (x.version == y.version) process.exit(1)"); then
  npm publish --registry=$HOST
else
  echo "no new version, not republishing"
fi;
