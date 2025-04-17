#!/bin/bash

# Run the local robot-agent source code in a docker container. Allows testing
# changes. Restart agent from portal after editing local robot-agent files for
# the changes to take effect.

source ../cloud/.env

docker build -f Dockerfile-dev -t tr-robot-agent-dev .

echo "Looking up robot token"
TOKEN=$(docker exec cloud-mongodb-1 mongosh transitive --quiet --eval "db.accounts.findOne({_id: '${TR_USER}'}).robotToken")

if [[ ! -e $PWD/tr_docker ]]; then
  echo "Create docker container to populate tr_docker";
  timeout 20 docker run --rm --privileged -v $PWD/tr_docker:/root/.transitive \
  --name tr-robot-source \
  --hostname robot-source \
  tr-robot-agent-dev $TR_USER ${TOKEN} http://install.$TR_HOST
fi;

echo "Now start container with existing installation, but use local agent source"
docker run -it --rm --privileged \
  -v $PWD/tr_docker:/root/.transitive \
  -v $PWD:/root/.transitive/node_modules/@transitive-robotics/robot-agent \
  -v /run/udev:/run/udev \
  -v /var/run/dbus:/var/run/dbus \
  -v /var/run/avahi-daemon/socket:/var/run/avahi-daemon/socket \
  --name tr-robot-source \
  --hostname robot-source \
  tr-robot-agent-dev $TR_USER ${TOKEN} http://install.$TR_HOST

