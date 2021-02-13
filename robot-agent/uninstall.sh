#!/bin/sh

echo uninstall!

if [ $PWD != ~/.transitive/node_modules/@transitive-robotics/robot-agent ]; then
  echo "refusing to run uninstall; not installed in correct directory";
  exit 1;
fi

# cleanup
systemctl --user stop transitive-robot.service
systemctl --user disable transitive-robot.service
rm $HOME/.config/systemd/user/transitive-robot.service
systemctl --user daemon-reload

echo uninstall done!
