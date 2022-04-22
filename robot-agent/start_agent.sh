#!/bin/bash

DIR=~/.transitive
NODE=$DIR/usr/bin/node
NPM="$NODE $DIR/usr/bin/npm"

# for n in $(cat $DIR/.env | grep -v "^#"); do export $n; done
# if [[ -f $DIR/.env_user ]]; then
#   for n in $(cat $DIR/.env_user | grep -v "^#"); do export $n; done
# fi;

# export PATH=$PATH:$DIR/usr/sbin:$DIR/usr/bin:$DIR/sbin:$DIR/bin
export NO_SYSTEMD=1
while (true); do
  cd $DIR/node_modules/@transitive-robotics/robot-agent
  # Yes this^ needs to be in the loop, because after a self-update we need to
  # re-enter that directory (it gets rewritten during npm update).
  $NPM start;
  sleep 2;
  echo "Restarting the agent"
done
