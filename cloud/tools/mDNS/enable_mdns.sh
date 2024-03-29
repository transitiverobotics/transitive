#!/bin/bash

# https://github.com/transitiverobotics/transitive/blob/main/cloud/tools/mDNS/README.md

# Ensure local subdomains are enabled
cp /host_etc/nsswitch.conf /tmp/nsswitch.conf
# Note that we can't use sed -i inside a docker on a mounted file:
# https://unix.stackexchange.com/a/404356/53593
sed -i 's/mdns4_minimal/mdns4/' /tmp/nsswitch.conf
cp /tmp/nsswitch.conf /host_etc/nsswitch.conf

# Ensure .local domains are allowed
if ( ! grep '\.local\.$' /host_etc/mdns.allow ); then
  echo '.local.' >> /host_etc/mdns.allow
fi
if ( ! grep '\.local$' /host_etc/mdns.allow ); then
  echo '.local' >> /host_etc/mdns.allow
fi
