#!/bin/bash

# Entrypoint to start service and then call original ClickHouse entrypoint.sh

# only start service if no docker command given
if [[ $# -lt 1 ]] || [[ "$1" == "--"* ]]; then
  echo "Starting mqtt2clickhouse service";
  npm start &
fi;

exec /entrypoint.sh "$@"
