#!/usr/bin/env bash

set -e

. $(dirname $0)/aptCommon.sh

# -------------------------------------------------------------------------

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
apt-get update


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
      echo "fetching from remote: $PACKAGE"
      curl -L -s -o "$FILENAME" "$PACKAGE"
    else
      # it's a .deb file, copy it
      cp $PACKAGE "$FILENAME"
    fi;
    # get its dependencies and fetch them
    DEPS=$(dpkg-deb -f "$FILENAME" depends | sed 's/, /\n/g' | cut -d ' ' -f 1 | xargs)
    apt-get -y -d install $OPTIONS $DEPS
  else
    echo "downloading $PACKAGE"
    apt-get -y -d install $OPTIONS $PACKAGE
  fi
done


printStep "Unpacking packages"
for DEB in $(find $DIR/var/cache/apt/archives/ -name "*deb"); do
  dpkg -x $DEB $DIR
  NAME=$(dpkg-deb -f $DEB package)
  echo $NAME
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
M_ARCH=$(uname -m)
cat > $DIR/etc/env_local << EOF
# environment variables for using debian packages installed via aptLocal.sh
# i.e., locally in ~/.transitive

export LD_LIBRARY_PATH=\$LD_LIBRARY_PATH:$DIR/lib/${M_ARCH}-linux-gnu:$DIR/usr/lib/${M_ARCH}-linux-gnu/:$DIR/usr/lib/

export PYTHONPATH=\$PYTHONPATH:$DIR/usr/lib/python2.7/dist-packages:$DIR/usr/lib/python3/dist-packages

export PATH=\$PATH:$DIR/usr/sbin:$DIR/usr/bin:$DIR/sbin:$DIR/bin

export PKG_CONFIG_PATH=\$PKG_CONFIG_PATH:$DIR/usr/lib/${M_ARCH}-linux-gnu/pkgconfig
EOF
