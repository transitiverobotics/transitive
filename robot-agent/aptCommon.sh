#!/usr/bin/env bash

# Common functions and definitions used by aptLocal and aptFetch.

set -e

# -------------------------------------------------------------------
# Colors
BLACK="\033[30m"
RED="\033[31m"
GREEN="\033[32m"
YELLOW="\033[33m"
BLUE="\033[34m"
PINK="\033[35m"
CYAN="\033[36m"
WHITE="\033[37m"
NORMAL="\033[0;39m"


# -------------------------------------------------------------------
# Env vars
DIR=~/.transitive
BASEDIR=$(dirname $0)

if (unshare -rm id); then
  UNSHARE="unshare -rm";
else
  # workaround for Ubuntu 24.04+ where
  # kernel.apparmor_restrict_unprivileged_userns = 1 is default
  UNSHARE="aa-exec -p trinity -- unshare -rm";
fi

# -------------------------------------------------------------------
# Functions

printStep() {
  printf "\n$GREEN$@$NORMAL\n"
}

# Set up apt sources
setupSources() {

  printStep "Set apt sources"

  if [[ -e /etc/apt/trusted.gpg ]]; then cp {,$DIR}/etc/apt/trusted.gpg; fi
  cp /etc/apt/trusted.gpg.d/* $DIR/etc/apt/trusted.gpg.d || true

  # node.js:
  ARCH=$(dpkg --print-architecture)
  echo "deb [arch=$ARCH signed-by=$DIR/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" >> $DIR/etc/apt/sources.list.d/nodesource.list
  echo "deb [arch=$ARCH signed-by=$DIR/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" >> $DIR/etc/apt/sources.list.d/nodesource.list
  echo "deb [arch=$ARCH signed-by=$DIR/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_26.x nodistro main" >> $DIR/etc/apt/sources.list.d/nodesource.list
  rm -f $DIR/etc/apt/keyrings/nodesource.gpg
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o $DIR/etc/apt/keyrings/nodesource.gpg
}

# -------------------------------------------------------------------
# Main: always done

printStep "Configuring local apt"
mkdir -p $DIR/var/lib/apt/lists/partial
mkdir -p $DIR/var/cache/apt/archives/partial
mkdir -p $DIR/etc/apt/{apt.conf.d,sources.list.d,preferences.d,trusted.gpg.d,keyrings}
mkdir -p $DIR/var/log/apt
echo "dir \"$DIR\";" > $DIR/etc/apt/apt.conf
export APT_CONFIG=$DIR/etc/apt/apt.conf

# Assemble dpkg status file, including our local additions
printStep "Merging local and system dpkg status"
mkdir -p $DIR/var/lib/dpkg/status.d/.merged # our very own invention, see below
rm -f $DIR/var/lib/dpkg/status.d/.merged/*
# get system dkpg status, separated into individual files
$BASEDIR/dpkgStatus.sh $DIR/var/lib/dpkg/status.d/.merged
# put it back together with our own
for p in $(ls $DIR/var/lib/dpkg/status.d/); do
  cp $DIR/var/lib/dpkg/status.d/${p}/control $DIR/var/lib/dpkg/status.d/.merged/${p}
done
cat $(ls $DIR/var/lib/dpkg/status.d/.merged/* | xargs) > $DIR/var/lib/dpkg/status

setupSources

printStep "Running apt-get update"
apt-get update || echo "Ignoring apt-get update errors"

