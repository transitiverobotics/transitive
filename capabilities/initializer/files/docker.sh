#!/bin/bash


# Script to run cloud caps in docker. This tries to replicate what we do in
# cloud/app/docker.js, just for dev.
# Usage: sym-link into cap folder, run there.

set -e

BASE_PORT=1234

# find an available port we can use
function findOffset() {
  local PORT=$BASE_PORT
  local OFFSET=0
  while (nc -z 127.0.0.1 $PORT); do
    OFFSET=$(( $OFFSET + 1 ));
    PORT=$(( $BASE_PORT + $OFFSET ));
  done
  echo $OFFSET
}

OFFSET=$(findOffset)
PORT=$(( $BASE_PORT + $OFFSET ))
MIN_PORT=$((30000 + $OFFSET * 100))
MAX_PORT=$((30080 + $OFFSET * 100))

echo "using port offset $OFFSET, i.e., port $PORT and port range $MIN_PORT-$MAX_PORT"

CAP_NAME=$(npm pkg get name)
VERSION=$(npm pkg get version)
FULL_NAME=${CAP_NAME/\//.}.${VERSION}
FULL_NAME2=${FULL_NAME//\"/}
CONTAINER_NAME=${FULL_NAME2//@/}
TAG="transitive-robotics/$(basename $PWD):${VERSION//\"/}"
TMP=${CAP_NAME//[\"@]/};
SAFE_NAME=${TMP//\//_} # e.g., transitive-robotics-webrtc-video

echo Building $TAG and running as $CONTAINER_NAME

./generate_certs.sh
mkdir -p cloud/certs
mv client.* cloud/certs

# copy with -L (symlink resolution) into tmp dir for building
TMPDIR=/tmp/_tr_build/$TAG
mkdir -p $TMPDIR
echo "copying to $TMPDIR"
cp -aLu . $TMPDIR

# docker build -f $SCRIPT_PATH/Dockerfile -t $TAG \
docker build -f Dockerfile -t $TAG \
--add-host=registry.homedesk.local:host-gateway \
$TMPDIR

mkdir -p /tmp/pers/common
mkdir -p /tmp/pers/$TAG

docker run -it --rm --init \
--env MQTT_URL=mqtts://mosquitto \
--env PUBLIC_PORT=$PORT \
--env MIN_PORT=$MIN_PORT \
--env MAX_PORT=$MAX_PORT \
--env MONGO_DB="cap_$SAFE_NAME" \
--env MONGO_URL="mongodb://mongodb" \
-p $PORT:1000 -p $PORT:1000/udp \
-p $MIN_PORT-$MAX_PORT:$MIN_PORT-$MAX_PORT -p $MIN_PORT-$MAX_PORT:$MIN_PORT-$MAX_PORT/udp \
-v /tmp/pers/common:/persistent/common \
-v /tmp/pers/${TAG//:/.}:/persistent/self \
--network=cloud_caps \
--name $CONTAINER_NAME \
$TAG $@
# -v $PWD/cloud:/app/cloud \

# doesn't yet work: when using this, the npm script runs as the owning user,
# "node", because it has the same uid (1000) as us. But we want root.
# -v $PWD:/app \

rm -rf $TMPDIR