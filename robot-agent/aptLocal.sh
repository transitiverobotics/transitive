#!/usr/bin/env bash

set -e

BLACK="\033[30m"
RED="\033[31m"
GREEN="\033[32m"
YELLOW="\033[33m"
BLUE="\033[34m"
PINK="\033[35m"
CYAN="\033[36m"
WHITE="\033[37m"
NORMAL="\033[0;39m"

printStep() {
  printf "\n$GREEN$@$NORMAL\n"
}

indent() {
  sed -u "s/^/  /"
}

getROSRelease() {
  case $(lsb_release -sc) in
    focal) echo noetic;;
    bionic) echo melodic;;
    *) echo melodic;;
  esac
}

BASEDIR=$(dirname $0)
DIR=~/.transitive

# -------------------------------------------------------------------------

printStep "Preparing local folders"
mkdir -p $DIR/var/lib/apt/lists/partial
mkdir -p $DIR/var/cache/apt/archives/partial
mkdir -p $DIR/etc/apt/{apt.conf.d,sources.list.d,preferences.d,trusted.gpg.d}
mkdir -p $DIR/var/log/apt
echo "dir \"$DIR\";" > $DIR/etc/apt/apt.conf
#echo "Dir::State::status \"$DIR/var/lib/dpkg/status\";"
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


printStep "Set apt sources"
cp {,$DIR}/etc/apt/sources.list
echo "deb http://packages.ros.org/ros/ubuntu $(lsb_release -sc) main" > $DIR/etc/apt/sources.list.d/ros-latest.list


cp {,$DIR}/etc/apt/trusted.gpg
cp /etc/apt/trusted.gpg.d/* $DIR/etc/apt/trusted.gpg.d
if [[ ! -e $DIR/etc/apt/trusted.gpg.d/ros.gpg ]]; then
  printStep "Import ROS repo keys"
  apt-key --keyring $DIR/etc/apt/trusted.gpg.d/ros.gpg adv --keyserver 'hkp://keyserver.ubuntu.com:80' --recv-key C1CF6E31E6BADE8868B172B4F42ED6FBAB17C654 | indent
fi;


printStep "Running apt-get update"
apt-get update | indent


printStep "Fetching packages"
for PACKAGE in $*; do
  if [[ $PACKAGE == *.deb ]]; then
    NAME=$(basename $PACKAGE .deb)
    FILENAME=$DIR/var/cache/apt/archives/${NAME}.deb
    if [[ $PACKAGE == http* ]]; then
      # it's a remote .deb file, fetch it
      echo "fetching from remote" | indent
      curl -L -s -o "$FILENAME" "$PACKAGE" | indent
    else
      # it's a .deb file, copy it
      cp $PACKAGE "$FILENAME"
    fi;
    # get its dependencies and fetch them
    DEPS=$(dpkg-deb -f "$FILENAME" depends | sed 's/, /\n/g' | cut -d ' ' -f 1 | xargs)
    apt-get -y -d install $DEPS | indent
  else
    apt-get -y -d install $PACKAGE | indent
  fi
done


printStep "Unpacking packages"
for DEB in $(find $DIR/var/cache/apt/archives/ -name "*deb"); do
  dpkg -x $DEB $DIR
  NAME=$(dpkg-deb -f $DEB package)
  echo $NAME | indent
  dpkg-deb -e $DEB $DIR/var/lib/dpkg/status.d/$NAME
  # add status installed
  echo "Status: install ok installed" >> $DIR/var/lib/dpkg/status.d/$NAME/control
  # add empty line at the end, will become separator in merge
  echo "" >> $DIR/var/lib/dpkg/status.d/$NAME/control
  rm -f $DEB
done


# Generate env file for using these locally installed packages

# ROS_RELEASE=$(ls -1 --color=never ~/.transitive/opt/ros | head -n 1)
# ^^ would fail if no ros packages were yet installed
ROS_RELEASE=$(getROSRelease)
cat > $DIR/etc/env_local << EOF
# environment variables for using debian packages installed via aptLocal.sh
# i.e., locally in ~/.transitive

LD_LIBRARY_PATH=\$LD_LIBRARY_PATH:$DIR/usr/lib/x86_64-linux-gnu/:$DIR/usr/lib/:$DIR/opt/ros/$ROS_RELEASE/lib/

ROS_PACKAGE_PATH=\$ROS_PACKAGE_PATH:$DIR/opt/ros/$ROS_RELEASE/share

CMAKE_PREFIX_PATH=\$CMAKE_PREFIX_PATH:$DIR/opt/ros/$ROS_RELEASE

PATH=\$PATH:$DIR/usr/sbin:$DIR/usr/bin:$DIR/sbin:$DIR/bin
EOF
