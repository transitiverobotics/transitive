#!/bin/bash

# script to preinstall a apackage during docker_install.js
# this does *not* run in a sandbox

# run in the package folder

getROSRelease() {
  case $(lsb_release -sc) in
    xenial) echo kinetic;;
    bionic) echo melodic;;
    focal) echo noetic;;
    *) echo noetic;;
  esac
}

tryToSourceROS() {
  ROS_RELEASE=$1
  if [ -e /opt/ros/$ROS_RELEASE/setup.bash ]; then
    echo "found ROS $ROS_RELEASE, sourcing it";
    . /opt/ros/$ROS_RELEASE/setup.bash;
  fi
}

if [ "$TR_ROS_RELEASES" ]; then
  for release in $TR_ROS_RELEASES; do
    . /opt/ros/$release/setup.bash;
  done;
else
  # automatically decide which ROS1 release to source based on OS
  tryToSourceROS $(getROSRelease)

  # ROS 2:
  tryToSourceROS foxy
  tryToSourceROS galactic
  tryToSourceROS humble
  tryToSourceROS iron
fi

TRANSITIVE_DIR=$HOME/.transitive

PATH=$TRANSITIVE_DIR/usr/bin:$PATH
. $TRANSITIVE_DIR/etc/env_local

export TRANSITIVE_IS_ROBOT=1

# Required in order to install indirect dependencies from the @transitive-robotics scope
export npm_config_userconfig=$PWD/.npmrc

npm install --no-save

# record the used node modules version, since this may be the first install
node -e "console.log(process.versions.modules)" > .compiled_modules_version
