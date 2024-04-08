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

# -------------------------------------------------------------------
# Functions

printStep() {
  printf "\n$GREEN$@$NORMAL\n"
}

getROSRelease() {
  case $(lsb_release -sc) in
    xenial) echo kinetic;;
    bionic) echo melodic;;
    focal) echo noetic;;
  esac
}

# Set up apt sources
setupSources() {

  printStep "Set apt sources"

  # ROS_RELEASE=$(ls -1 --color=never ~/.transitive/opt/ros | head -n 1)
  # ^^ would fail if no ros packages were yet installed
  ROS_RELEASE=$(getROSRelease)

  cp {,$DIR}/etc/apt/sources.list
  if [[ -z $ROS_RELEASE ]]; then
    echo "No ROS1 release for $(lsb_release -sc)";
    # remove it in case an older version of aptLocal added it:
    rm -rf $DIR/etc/apt/sources.list.d/ros-latest.list
  else
  echo "deb http://packages.ros.org/ros/ubuntu $(lsb_release -sc) main" > $DIR/etc/apt/sources.list.d/ros-latest.list
  fi;

  if [[ -e /etc/apt/trusted.gpg ]]; then cp {,$DIR}/etc/apt/trusted.gpg; fi
  cp /etc/apt/trusted.gpg.d/* $DIR/etc/apt/trusted.gpg.d || true
  # For now, always get latest ROS repo keys, to mitigate stuff like:
  # https://discourse.ros.org/t/ros-gpg-key-expiration-incident/20669



  printStep "Import repo keys"

  curl -s https://raw.githubusercontent.com/ros/rosdistro/master/ros.asc | unshare -rm apt-key --keyring $DIR/etc/apt/trusted.gpg.d/ros.gpg add -

  # node.js:
  ARCH=$(dpkg --print-architecture)
  echo "deb [arch=$ARCH signed-by=$DIR/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_16.x nodistro main" > $DIR/etc/apt/sources.list.d/nodesource.list
  echo "deb [arch=$ARCH signed-by=$DIR/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" >> $DIR/etc/apt/sources.list.d/nodesource.list
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

