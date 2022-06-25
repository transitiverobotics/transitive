#!/bin/bash

set -e

TAGNAME=transitive_u16

docker build -t $TAGNAME .

# the .transitive folder inside the docker container need to persist, hence
# creating a folder outside of the container, which will be bind-mounted below
DIR=~/.transitive_docker
mkdir -p $DIR
echo "TR_LABELS=docker" > $DIR/.env_user

docker run -it --rm --privileged --hostname transitive -v $DIR:/home/transitive/.transitive --name transitive --network=host $TAGNAME bash
