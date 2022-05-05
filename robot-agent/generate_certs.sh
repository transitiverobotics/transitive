#!/bin/bash

set -e

DIR=~/.transitive
NODE=$DIR/usr/bin/node
NPM="$NODE $DIR/usr/bin/npm"

echo "Generating SSL certificates"

if [[ -d $DIR/certs ]]; then
  echo "  certificates already exist, not replacing";

else
  cd $DIR
  . .env
  . .token

  echo "  computing hashed machine-id"
  DEVICEID=$(cat /etc/machine-id)
  # if machine has no id yet, create a random one
  [[ -z $DEVICEID ]] && DEVICEID=$(openssl rand -base64 20)

  # compute sha256sum of machine-id (or random id), take first 10 chars of it's
  # base64 encoding, with special characters removed
  # HASH=$($NODE -e "h = require('crypto').createHash('sha256'); h.update(process.argv[1]); b = Buffer.from(h.digest()); console.log(b.toString('base64').replace(/[/+=]/g, '').slice(0,10));" $DEVICEID)
  HASH=$(echo $DEVICEID | sha256sum | cut -c -10)
  echo "  deterministic device id: $HASH"
  echo "TR_DEVICEID=$HASH" >> .env

  # generate certificate signing request for MQTT broker
  echo "  generating CSR"
  mkdir -p $DIR/certs
  # openssl rand -out .rnd -writerand ~/.rnd # seems to be required on some systems
  openssl rand 2048 > $HOME/.rnd
  # openssl genrsa -out $DIR/certs/client.key -rand $DIR/.rnd 2048 2>/dev/null
  openssl genrsa -out $DIR/certs/client.key 2048 2>/dev/null
  openssl req -out $DIR/certs/client.csr -key $DIR/certs/client.key -new -subj "/CN=$TR_USERID:$HASH"

  # send certificate signing request to cloud
  echo "  sending CSR to $TR_INSTALL_HOST"
  # url-encode token: https://stackoverflow.com/a/10797966/1087119
  url=$(curl -s -o /dev/null -w %{url_effective} --get --data-urlencode "token=$TR_ROBOT_TOKEN" "$TR_INSTALL_HOST/csr")
  curl -sf --data-binary @$DIR/certs/client.csr $url -o $DIR/certs/client.crt

  rm .token
  echo "  done generating certificates"
fi;
