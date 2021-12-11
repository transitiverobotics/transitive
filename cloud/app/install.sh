#!/bin/bash
# script to run on install, i.e., after being checked out on the cloud via
# github action


set -e

# this script executes in the cloud/app folder of the checkout
DIR=$PWD
MODULE=$(basename $PWD)

echo running $MODULE install

# install systemd user service
mkdir -p $HOME/.config/systemd/user/
cp *.service $HOME/.config/systemd/user/

# copy code in place (note, we are not cleaning anything existing, in particular
# we need to ensure the certs stay in place):
mkdir -p $HOME/opt/$MODULE
mkdir -p $HOME/run/
cd $HOME/opt
# unpack the tarball we downloaded from the previous github action step (see deploy_cloud_app.yaml)
tar xf $DIR/app.tgz

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
