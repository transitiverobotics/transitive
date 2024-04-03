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
    xenial) echo kinetic;;
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
mkdir -p $DIR/etc/apt/{apt.conf.d,sources.list.d,preferences.d,trusted.gpg.d,keyrings}
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
# ROS
cp {,$DIR}/etc/apt/sources.list
echo "deb http://packages.ros.org/ros/ubuntu $(lsb_release -sc) main" > $DIR/etc/apt/sources.list.d/ros-latest.list

if [[ -e /etc/apt/trusted.gpg ]]; then cp {,$DIR}/etc/apt/trusted.gpg; fi
cp /etc/apt/trusted.gpg.d/* $DIR/etc/apt/trusted.gpg.d || true
# For now, always get latest ROS repo keys, to mitigate stuff like:
# https://discourse.ros.org/t/ros-gpg-key-expiration-incident/20669
printStep "Import ROS repo keys"
curl -s https://raw.githubusercontent.com/ros/rosdistro/master/ros.asc | unshare -rm apt-key --keyring $DIR/etc/apt/trusted.gpg.d/ros.gpg add -

# node.js:
echo "deb [arch=amd64,arm64 signed-by=$DIR/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_16.x nodistro main" > $DIR/etc/apt/sources.list.d/nodesource.list
echo "deb [arch=amd64,arm64 signed-by=$DIR/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" >> $DIR/etc/apt/sources.list.d/nodesource.list
rm -f $DIR/etc/apt/keyrings/nodesource.gpg
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o $DIR/etc/apt/keyrings/nodesource.gpg


printStep "Running apt-get update"
apt-get update | indent


printStep "Fetching packages"
for PACKAGE in $*; do
  if [[ $PACKAGE == -* ]]; then
    # not a package but an option to give to apt-get
    OPTIONS="$OPTIONS $PACKAGE"
  elif [[ $PACKAGE == *.deb ]]; then
    NAME=$(basename $PACKAGE .deb)
    FILENAME=$DIR/var/cache/apt/archives/${NAME}.deb
    if [[ $PACKAGE == http* ]]; then
      # it's a remote .deb file, fetch it
      echo "fetching from remote: $PACKAGE" | indent
      curl -L -s -o "$FILENAME" "$PACKAGE" | indent
    else
      # it's a .deb file, copy it
      cp $PACKAGE "$FILENAME"
    fi;
    # get its dependencies and fetch them
    DEPS=$(dpkg-deb -f "$FILENAME" depends | sed 's/, /\n/g' | cut -d ' ' -f 1 | xargs)
    apt-get -y -d install $OPTIONS $DEPS | indent
  else
    echo "downloading $PACKAGE" | indent
    apt-get -y -d install $OPTIONS $PACKAGE | indent
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


# Replace `/usr/bin/python` with `/usr/bin/env python` in locally installed packages
if [[ -e $DIR/opt/ros ]]; then
  for n in $(grep -Rl "/usr/bin/python" $DIR/opt/ros | xargs); do
    sed -i 's/\/usr\/bin\/python/\/usr\/bin\/env python/' $n;
  done
fi;
for n in $(find $DIR/usr/bin -name 'ros*'); do
  sed -i 's/\/usr\/bin\/python/\/usr\/bin\/env python/' $n;
done


# Generate env file for using these locally installed packages

# ROS_RELEASE=$(ls -1 --color=never ~/.transitive/opt/ros | head -n 1)
# ^^ would fail if no ros packages were yet installed
ROS_RELEASE=$(getROSRelease)
cat > $DIR/etc/env_local << EOF
# environment variables for using debian packages installed via aptLocal.sh
# i.e., locally in ~/.transitive

export LD_LIBRARY_PATH=\$LD_LIBRARY_PATH:$DIR/lib/$(uname -m)-linux-gnu:$DIR/usr/lib/$(uname -m)-linux-gnu/:$DIR/usr/lib/:$DIR/opt/ros/$ROS_RELEASE/lib/

export ROS_PACKAGE_PATH=\$ROS_PACKAGE_PATH:$DIR/opt/ros/$ROS_RELEASE/share

export CMAKE_PREFIX_PATH=\$CMAKE_PREFIX_PATH:$DIR/opt/ros/$ROS_RELEASE

export PYTHONPATH=\$PYTHONPATH:$DIR/usr/lib/python2.7/dist-packages:$DIR/usr/lib/python3/dist-packages

export PATH=\$PATH:$DIR/usr/sbin:$DIR/usr/bin:$DIR/sbin:$DIR/bin

export PKG_CONFIG_PATH=\$PKG_CONFIG_PATH:$DIR/usr/lib/$(uname -m)-linux-gnu/pkgconfig
EOF
