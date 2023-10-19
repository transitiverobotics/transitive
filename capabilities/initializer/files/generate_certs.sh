#!/bin/bash

# generate client certificate for mqtt broker for the package of the current folder

set -e

CN=$(npm pkg get name)  # get package name
CN=${CN//\"}            # remove the quotes
CN=${CN/\//\\/}         # escape the slash

if [ ! -e client.crt ]; then
  TR_VAR_DIR=$(curl -sf http://install.localhost/var-folder-location)
  VARDIR=${TR_VAR_DIR:-~/transitive}
  echo "Generating cloud certs using CA certs in $VARDIR"

  openssl genrsa -out client.key 2048
  echo using "CN=cap:$CN"
  openssl req -out client.csr -key client.key -new -subj="/CN=cap:$CN"
  openssl x509 -req -in client.csr -CA $VARDIR/certs/ca.crt \
  -CAkey $VARDIR/certs/ca.key -CAcreateserial -out client.crt -days 36500

  echo "certificate generated (client.crt):"
  openssl x509 -in client.crt -text | grep CN
else
  echo "certificates already exist, not overwriting"
fi
