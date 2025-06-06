#!/bin/bash

DIR=~/.transitive
NODE=$DIR/usr/bin/node
NPM="$NODE $DIR/usr/bin/npm"

export PATH=$DIR/usr/sbin:$DIR/usr/bin:$DIR/sbin:$DIR/bin:$PATH

# for n in $(cat $DIR/.env | grep -v "^#"); do export $n; done
# if [[ -f $DIR/.env_user ]]; then
#   for n in $(cat $DIR/.env_user | grep -v "^#"); do export $n; done
# fi;

# export PATH=$PATH:$DIR/usr/sbin:$DIR/usr/bin:$DIR/sbin:$DIR/bin
# export NO_SYSTEMD=1
while (true); do
  cd $DIR
  # The `rm` here is to clear out old npm folders from a potentially failed
  # update (or whatever else leaves these beind, see
  # https://docs.npmjs.com/common-errors#many-enoent--enotempty-errors-in-output.
  rm -rf node_modules/.*-* node_modules/@*/.*-*
  $NPM update --no-save

  ./generate_certs.sh

  cd $DIR/node_modules/@transitive-robotics/robot-agent
  $NPM start | tee -a $DIR/agent.log;
  sleep 2;
  echo "Restarting the agent"
done
