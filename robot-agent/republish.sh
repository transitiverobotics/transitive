#!/bin/bash

# sym-link and run inside a npm package folder

rm -f .npmrc
if [[ -n $TR_BOT_TOKEN && -n $TR_REGISTRY ]]; then
  echo "//$TR_REGISTRY/:_authToken=$TR_BOT_TOKEN" > .npmrc
  HOST=http://$TR_REGISTRY
  echo "wrote ~/.npmrc file with token"
elif [[ $# > 0 ]]; then
  HOST=$1
else
  HOST=http://registry.localhost:8000
fi;

echo "@transitive-robotics:registry=$HOST" >> .npmrc

echo "using config: $(npm config ls)"
echo "fetching latest version from registry; $HOST"
NAME=$(npm pkg get name | xargs)
LOCAL=$(npm pkg get version | xargs)
REMOTE=$(npm show $NAME version)
if [[ $LOCAL == $REMOTE ]]; then
  echo "$NAME: no new version, not republishing"
else
  npm publish
fi;
