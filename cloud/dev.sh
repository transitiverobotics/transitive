#!/bin/bash

# "source" .env
export $(cat .env | grep -v ^\# | xargs)

# We need to create the certs folder to make sure the generated certs have the
# right owner (see certs/generate.sh).
mkdir -p TR_VAR_DIR/certs

# Enable lines commented out with #DEV and remove those marked #NODEV.
# This allows us to use slightly different setups in dev than in prod.
COMPOSE=$(sed -e 's/#DEV//' -e 's/.*#NODEV//' docker-compose.yaml)

function compose() {
  echo "$COMPOSE" | docker-compose -f - $@
}

compose build && compose up -d
