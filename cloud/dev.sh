#!/bin/bash

COMPOSE=$(sed -e 's/#DEV//' -e 's/.*#NODEV//' docker-compose.yaml)

function compose() {
  echo "$COMPOSE" | docker-compose -f - $@
}

# docker-compose-dev build && docker-compose-dev up -d
compose build && compose up -d
