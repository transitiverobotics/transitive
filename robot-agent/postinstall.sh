#!/bin/sh

echo "robot-agent postinstall!"

set -e

if [ $PWD != ~/.transitive/node_modules/@transitive-robotics/robot-agent ] &&
[ ! -e DEVMODE ]; then
  echo "refusing to run postinstall; not installed in correct directory";
  echo $PWD;
  exit 1;
fi

# TODO: replace all this with a tar-ball?
mkdir -p ~/.transitive/packages
mkdir -p ~/.transitive/etc
mkdir -p ~/.transitive/run
mkdir -p ~/.transitive/usr/bin
mkdir -p ~/.transitive/bin

[ ! -e ~/.transitive/etc/env_local ] && touch ~/.transitive/etc/env_local
cp uninstall.sh startPackage.sh ~/.transitive/bin
cp unshare*.sh start_agent.sh generate_certs.sh ~/.transitive/

if [ -d /run/systemd/system ]; then
  # install systemd user service
  mkdir -p $HOME/.config/systemd/user/
  cp *.service $HOME/.config/systemd/user/

  # allow service to run on boot without user logging in
  loginctl enable-linger $USER
  systemctl --user daemon-reload
  systemctl --user enable transitive-robot.service
  systemctl --user start transitive-robot.service

  echo robot-agent postinstall done!
fi;
# else: no systemd, the install script will take care of starting the agent right away manually
