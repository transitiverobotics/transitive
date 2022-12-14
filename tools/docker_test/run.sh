#!/bin/bash

set -e

if [[ $# > 0 ]]; then
  TAGNAME=robot_${1/:/-}
  BUILDARGS="--build-arg BASE_IMAGE=$1"
else
  TAGNAME=robot
  BUILDARGS=""
fi;

docker build $BUILDARGS -t $TAGNAME .

. ../../cloud/.env
DIR=/tmp/transitive-docker-robot
mkdir -p $DIR
echo "TR_LABELS=docker" > $DIR/.env_user

docker run -it --rm \
--env-file ../../cloud/.env \
--privileged \
--hostname robot_$(date -Iseconds | tr -d ':-' | cut -c -15) \
-v $DIR:/home/testuser/.transitive \
--name robot \
--add-host={,registry.,portal.,data.,auth.,install.,repo.,mqtt.}${HOST}:host-gateway \
$TAGNAME bash
