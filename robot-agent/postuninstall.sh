#!/bin/sh

echo running postuninstall

# cleanup
systemctl --user stop transitive-robot.service
systemctl --user disable transitive-robot.service
rm $HOME/.config/systemd/user/transitive-robot.service
systemctl --user daemon-reload

echo uninstall done!
