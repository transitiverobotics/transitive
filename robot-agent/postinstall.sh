#!/bin/sh

echo "robot-agent postinstall!"

set -e

if [ $PWD != ~/.transitive/node_modules/@transitive-robotics/robot-agent ] && [ ! -e DEVMODE ]; then
  echo "refusing to run postinstall; not installed in correct directory";
  echo $PWD;
  exit 1;
fi

# install systemd user service
mkdir -p $HOME/.config/systemd/user/
cp *.service $HOME/.config/systemd/user/

mkdir -p ~/.transitive/packages

cp unshare*.sh ~/.transitive

# allow service to run on boot without user logging in
loginctl enable-linger $USER
systemctl --user daemon-reload
systemctl --user enable transitive-robot.service
systemctl --user restart transitive-robot.service

echo robot-agent postinstall done!
