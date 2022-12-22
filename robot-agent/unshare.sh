#!/bin/bash

# CWD=$PWD
#
# mkdir -p /tmp/root
# cd /tmp/root

if [[ $(id -u) == 0 ]]; then
  # we are root
  echo "we are root"
  # make sure the USER is set
  env USER=root unshare -m $PWD/unshared.sh $@
elif (sudo -n whoami >/dev/null 2>/dev/null); then
  # we have passwordless sudo
  echo "using sudo for $USER"
  # we need to set USER and HOME back to the outside user inside the sudo:
  sudo unshare -m env USER=$USER HOME=$HOME TRPACKAGE=$TRPACKAGE TR_HOST=$TR_HOST TR_USERID=$TR_USERID TR_DEVICEID=$TR_DEVICEID TRCONFIG=$TRCONFIG $PWD/unshared.sh $@
else
  # we have neither: use a fake root shell. Note that in this case the
  # `mount -t overlay` in unshared will fail on some OSs (seen, e.g., in docker
  # on buildroot 2020.05)
  echo "using unshare -r"
  unshare -rm $PWD/unshared.sh $@
fi
