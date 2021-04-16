#!/bin/bash

# script to run when initializing a new lxc instance (fake robot)

set -e

apt install -y lm-sensors

# generate a new machine-id
# see https://unix.stackexchange.com/questions/402999/is-it-ok-to-change-etc-machine-id
rm -f /etc/machine-id
rm -f /var/lib/dbus/machine-id
dbus-uuidgen --ensure=/etc/machine-id
dbus-uuidgen --ensure
