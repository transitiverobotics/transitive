#!/bin/bash

# setup ipset and iptables
ipset -exist create limit hash:ip

iptables -A INPUT -p tcp --dport 8883 -m set ! --match-set limit src -j ACCEPT
iptables -A INPUT -p tcp --dport 8883 -m set --match-set limit src -m limit --limit 100/s -j ACCEPT
iptables -A INPUT -p tcp --dport 8883 -j DROP


# start mosquitto
while (true); do
  /usr/sbin/mosquitto -c /etc/mosquitto/mosquitto.conf
  echo "Mosquitto stopped with exit code $?, restarting in 2s"
  sleep 2;
done;
