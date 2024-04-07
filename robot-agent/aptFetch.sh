#!/usr/bin/env bash

# Script to fetch and unpack a named apt package. Uses the same sources as
# aptLocal.

set -e

. $(dirname $0)/aptCommon.sh

# -------------------------------------------------------------------------

if [[ $# < 1 ]]; then
  echo "no package specified";
  exit 1;
fi;

setupSources

printStep "Running apt-get update"
apt-get update || echo "Ignoring apt-get update errors"


TMP=$(mktemp -d)
cd $TMP
echo "Running in $TMP"

printStep "Fetching package $1"
apt-get download $1

printStep "Unpacking package"
dpkg -x *.deb $DIR
NAME=$(dpkg-deb -f *.deb package)
echo $NAME
dpkg-deb -e *.deb $DIR/var/lib/dpkg/status.d/$NAME
# add status installed
echo "Status: install ok installed" >> $DIR/var/lib/dpkg/status.d/$NAME/control
# add empty line at the end, will become separator in merge
echo "" >> $DIR/var/lib/dpkg/status.d/$NAME/control
