#!/bin/bash
# script to run on install, i.e., after being checked out on the cloud via
# github action


set -e

# this script executes in the cloud/app folder of the checkout
DIR=$PWD
MODULE=$(basename $PWD)
CERTDIR=/etc/mosquitto/certs

echo running $MODULE install

# install systemd user service
mkdir -p $HOME/.config/systemd/user/
cp *.service $HOME/.config/systemd/user/

# copy code in place (note, we are not cleaning anything existing):
mkdir -p $HOME/opt/$MODULE
cp -r . $HOME/opt/$MODULE

# run npm install
cd $HOME/opt/$MODULE
npm install
npx webpack --no-watch # for now, later: separate this out from the app

# create mqtt client ssl certificate, requires CA certs in /etc/mosquitto/certs
cd $HOME/opt/$MODULE/certs
./generate_certs.sh


# make sure linger is enabled (allows service to run on boot without user logging in)
loginctl enable-linger $USER
# reload daemon
systemctl --user daemon-reload

# restart services
for service in $DIR/*.service; do
  systemctl --user enable $(basename $service)
  systemctl --user restart $(basename $service)
done;

echo $MODULE install done!
