#!/bin/bash
# script to run on install, i.e., after being checked out on the cloud via
# github action


echo running proxy install

set -e

# make sure config folder exists
mkdir -p $HOME/etc/greenlock.d
if [ ! -e $HOME/etc/greenlock.d/config.json ]; then
  echo "config doesn't exist, creating it"
  cp greenlock.d/config.json $HOME/etc/greenlock.d
fi

# install systemd user service
mkdir -p $HOME/.config/systemd/user/
cp *.service $HOME/.config/systemd/user/

# copy code in place (note, we are not cleaning anything existing):
mkdir -p $HOME/opt/proxy
cp index.js package*.json $HOME/opt/proxy

# run npm install
cd $HOME/opt/proxy
npm install


# make sure linger is enabled (allows service to run on boot without user logging in)
loginctl enable-linger $USER
# reload daemon
systemctl --user daemon-reload

# restart services
for service in *.service; do
  systemctl --user enable $service
  systemctl --user restart $service
done;

echo proxy install done!
