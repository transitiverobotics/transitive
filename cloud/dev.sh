#!/bin/bash

# "source" .env
set -o allexport
. .env
set +o allexport

# Detect Docker Compose (standalone or plugin)
if ( docker-compose help > /dev/null 2>&1 ); then
  function compose() {
    docker-compose $@
  }
elif ( docker compose help > /dev/null 2>&1 ); then
  function compose() {
    docker compose $@
  }
else
  echo "** Error: you don't appear to have Docker Compose installed."
  echo "Please see https://docs.docker.com/compose/install/."
  exit 1;
fi;

# We need to create the certs folder to make sure the generated certs have the
# right owner (see certs/generate.sh).
mkdir -p $TR_VAR_DIR/certs

# For dev: create a folder read by cloud-app where capabilities can be updated live
mkdir -p /tmp/caps

compose build && compose up -d $@

if (getent hosts random-subdomain-3245234.$TR_HOST > /dev/null); then
  echo "mDNS verification successful"
else
  echo "mDNS verification failed. Please follow the instructions in"
  echo "https://github.com/transitiverobotics/transitive/blob/main/cloud/tools/mDNS/README.md"
fi;
