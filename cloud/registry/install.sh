#!/bin/bash
# script to run on install, i.e., after being checked out on the cloud via
# github action

echo running registry install

set -e

# this script executes in the cloud/registry folder of the checkout
DIR=$PWD

# install systemd user service
mkdir -p $HOME/.config/systemd/user/
cp *.service $HOME/.config/systemd/user/

# copy code in place (note, we are not cleaning anything existing):
mkdir -p $HOME/opt/registry
cp index.js package*.json $HOME/opt/registry

# run npm install
cd $HOME/opt/registry
npm install


# make sure linger is enabled (allows service to run on boot without user logging in)
loginctl enable-linger $USER
# reload daemon
systemctl --user daemon-reload

# restart services
for service in $DIR/*.service; do
  systemctl --user enable $(basename $service)
  systemctl --user restart $(basename $service)
done;

echo registry install done!
