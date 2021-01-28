#!/bin/bash

set -e

snapcraft
sudo snap install ./rap-soft-joystick_0.1.0_amd64.snap --dangerous
# not like this: /snap/rap-soft-joystick/current/bin/test.sh
# like this:
rap-soft-joystick.test
rap-soft-joystick.health
