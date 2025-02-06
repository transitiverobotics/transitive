#!/bin/bash

set -e

DIR=~/.transitive
NODE=$DIR/usr/bin/node
NPM="$NODE $DIR/usr/bin/npm"

echo "Generating SSL certificate"

if [[ -e $DIR/certs/client.crt ]]; then
  echo "  certificate already exists, not replacing";

else
  cd $DIR
  . .env
  . .token

  # HASH=${TR_INSTALL_HASH//[^a-zA-Z0-9\-\_]/} # see #580
  HASH=${TR_INSTALL_HASH//[^a-zA-Z0-9]/}
  if [[ -z $HASH ]]; then
    echo "  computing hashed machine-id"
    DEVICEID=$(cat /etc/machine-id)
    # if machine has no id yet, create a random one
    [[ -z $DEVICEID ]] && DEVICEID=$(openssl rand -base64 20)

    # compute sha256sum of machine-id (or random id), take first 10 chars of it's
    # base64 encoding, with special characters removed; The d_ ensures that the id
    # is not a decimal number, to avoid #164.
    HASH=$(echo $DEVICEID | sha256sum | cut -c -10)
    echo "  using device hash: $HASH"
  else
    echo "  using (sanitized) hash provided in env var: $HASH"
  fi;

  ID=d_$HASH
  echo "TR_DEVICEID=$ID" >> .env

  # generate certificate signing request for MQTT broker
  echo "  generating CSR"
  mkdir -p $DIR/certs
  # openssl rand -out .rnd -writerand ~/.rnd # seems to be required on some systems
  openssl rand 2048 > $HOME/.rnd
  # openssl genrsa -out $DIR/certs/client.key -rand $DIR/.rnd 2048 2>/dev/null
  openssl genrsa -out $DIR/certs/client.key 2048 2>/dev/null
  openssl req -out $DIR/certs/client.csr -key $DIR/certs/client.key -new -subj "/CN=$TR_USERID:$ID"

  # send certificate signing request to cloud
  echo "  sending CSR to $TR_INSTALL_HOST"
  # url-encode token: https://stackoverflow.com/a/10797966/1087119
  url=$(curl -s -o /dev/null -w %{url_effective} --get --data-urlencode "token=$TR_ROBOT_TOKEN" "$TR_INSTALL_HOST/csr")
  curl -sf --data-binary @$DIR/certs/client.csr $url -o $DIR/certs/client.crt

  rm .token
  echo "  done generating certificates"
fi;
