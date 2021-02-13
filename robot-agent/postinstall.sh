#!/bin/sh

echo postinstall!

if [ $PWD != ~/.transitive/node_modules/@transitive-robotics/robot-agent ]; then
  echo "refusing to run postinstall; not installed in correct directory";
  exit 1;
fi

# install systemd user service
mkdir -p $HOME/.config/systemd/user/
cp transitive-robot.service $HOME/.config/systemd/user/

# allow service to run on boot without user logging in
loginctl enable-linger $USER
systemctl --user daemon-reload
systemctl --user enable transitive-robot.service
systemctl --user restart transitive-robot.service

echo postinstall done!
