#!/bin/bash

set -e

# Ensure we are logged in to the given registry
function ensureAuth() {
  registry=$1
  if ( grep "^//$registry/:_authToken" ~/.npmrc ); then
    echo "We are already logged into registry"
  else
    # get location of local dev's var folder
    TR_VAR_DIR=$(curl -sf http://install.localhost/var-folder-location)
    # "source" the .env file
    set -o allexport
    . $TR_VAR_DIR/.env
    set +o allexport

    echo "Logging in to local npm registry"

    # add npm login authentication using the bot token from local .env file
    echo "//$registry/:_authToken=$TR_BOT_TOKEN" >> ~/.npmrc
  fi;
}

CWD=$PWD

if ( git rev-parse --is-inside-work-tree &>/dev/null ); then
  # We are inside a git repo.
  # Refuse to run if git working directory has unstaged changes. Untracked files
  # are OK. See https://unix.stackexchange.com/a/155077/53593
  git diff --quiet --exit-code || (echo 'Not clean, refusing to publish' && exit 1);
else
  if [[ $1 = "prod" ]]; then
    echo 'Need to be inside a clean git working directory to publish to prod'
    exit 2
  fi;
fi;

NAME=$(npm pkg get name | tr -d '"');
VERSION=$(npm pkg get version | tr -d '"');
TAG="${NAME/*\//}@$VERSION"

TMPDIR=$(mktemp -d)

echo "copying to $TMPDIR"
cp -aL . $TMPDIR
cd $TMPDIR

echo "Transpiling front-end components"
rm -rf dist
npm run prepare

npm install --no-save javascript-obfuscator@4.0.0

FILES=$(find . -name "*.js" -not -path "**/hi-perf/*" -not -path "**/node_modules/*" -not -path "./dist/*")
for f in $FILES; do
   npx javascript-obfuscator --split-strings true --split-strings-chunk-length 8 --string-array-encoding base64 --ignore-imports true --output $f $f
   # Maybe add later: --self-defending true
done

rm -f .npmrc

if [[ $1 = "prod" ]]; then
  echo "publishing $TAG to production"
  npm publish --registry=https://registry.transitiverobotics.com
  echo
  cd $CWD
  echo 'tagging'
  git tag $TAG
  git push --tags
else
  ensureAuth registry.localhost
  echo "publishing $TAG to development"
  npm publish --registry=http://registry.localhost
fi;

echo 'done'
