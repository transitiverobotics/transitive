#!/bin/bash

# Run this script to uninstall the Transitive Robotics agent and all installed
# packages from this device.

# TODO: add a prompt

# stop all package services
echo stopping all capabilities
systemctl --user stop transitive-package@*.service

echo deleting robot-agent
cd ~/.transitive
. etc/env_local
# remove robot-agent npm package
npm remove @transitive-robotics/robot-agent

echo stopping and disabling robot-agent service
# disable and remove the systemd service
systemctl --user stop transitive-robot.service
systemctl --user disable transitive-robot.service
rm ~/.config/systemd/user/transitive-robot.service
systemctl --user daemon-reload

# remove the folder
echo removing ~/.transitive
cd ~
rm -rf ~/.transitive
