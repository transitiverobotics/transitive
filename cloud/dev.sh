#!/bin/bash

# Enable lines commented out with #DEV and remove those marked #NODEV.
# This allows us to use slightly different setups in dev than in prod.
COMPOSE=$(sed -e 's/#DEV//' -e 's/.*#NODEV//' docker-compose.yaml)

function compose() {
  echo "$COMPOSE" | docker-compose -f - $@
}

# docker-compose-dev build && docker-compose-dev up -d
compose build && compose up -d
