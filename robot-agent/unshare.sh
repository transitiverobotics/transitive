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
elif (sudo -k -n whoami >/dev/null 2>/dev/null); then
  # we have passwordless sudo
  echo "using sudo for $USER"
  # we need to preserve the environment
  sudo -E unshare -m $PWD/unshared.sh $@
else
  # we have neither: use a fake root shell. Note that in this case the
  # `mount -t overlay` in unshared will fail on some OSs (seen, e.g., in docker
  # on buildroot 2020.05)
  echo "using unshare -r"
  # save the real user's id in the environment
  env REALUID=$(id -u) REALGID=$(id -g) unshare -rm $PWD/unshared.sh $@
fi
