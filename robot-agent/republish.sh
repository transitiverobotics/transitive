#!/bin/bash

# sym-link and run inside a npm package folder

rm -f .npmrc
if [[ -z $TR_BOT_TOKEN ]]; then
  echo "Missing TR_BOT_TOKEN"
  exit 1;
fi;

echo "//registry:6000/:_authToken=$TR_BOT_TOKEN" > .npmrc
REGISTRY=http://registry:6000
echo "wrote ~/.npmrc file with token"
echo "@transitive-robotics:registry=$REGISTRY" >> .npmrc

echo "using config: $(npm config ls)"
echo "fetching latest version from registry; $REGISTRY"
NAME=$(npm pkg get name | xargs)
LOCAL=$(npm pkg get version | xargs)
REMOTE=$(npm show $NAME version)
if [[ $LOCAL == $REMOTE ]]; then
  echo "$NAME: no new version, not republishing"
else
  npm publish
fi;
