#!/bin/bash

# Run Grafana's own entrypoint in the background
/run.sh &
GRAFANA_PID=$!

sleep 2

HOST=http://admin:${GRAFANA_ADMIN_PASSWORD}@localhost:3000

while (! curl -sf http://admin:${GRAFANA_ADMIN_PASSWORD}@localhost:3000/api/org); do
  echo 'Waiting for Grafana API to be up..';
  sleep 2;
done

FIRST_START=1

# Init script to provision the mqtt-history org
ORGID=$(curl -sf -X POST ${HOST}/api/orgs \
  -H "Content-Type: application/json" \
  -d '{"name":"mqtt-history"}' | jq .orgId)

if [[ -z $ORGID ]]; then
  echo Org already existed, not updating provisioning;

  FIRST_START=0

  # fetch org by name to get ID
  ORGID=$(curl -s http://admin:${GRAFANA_ADMIN_PASSWORD}@localhost:3000/api/orgs/name/mqtt-history \
  -H "Content-Type: application/json" | jq .id)
fi;

echo OrgId: $ORGID

# Set orgid in provisioning files
for n in $(find /to_be_provisioned -type f -name *.template.*); do
  env ORGID=$ORGID envsubst < $n > ${n//.template/}
  # remove the template, in order not to confuse Grafana
  rm $n
done

# now move the provisioning files into place so they get picked up and trigger a
# reload so we don't need to wait
cp -r /to_be_provisioned/. /etc/grafana/provisioning/
for l in $(ls /to_be_provisioned); do
  curl -s -X POST ${HOST}/api/admin/provisioning/$l/reload;
  echo;
  sleep 0.2;
done

# Only now that the mqtt-history org exists does the org_mapping in grafana.ini
# take effect (i.e., once the mqtt-history org we are mapping to exists). Hence
# need to restart Grafana if the org was created.
if [[ $FIRST_START == 1 ]]; then
  echo "Restarting Grafana"

  # On first start (first provisioning of org) we need to
  kill $GRAFANA_PID;
  sleep 1

  /run.sh &
  GRAFANA_PID=$!

fi;

# # Wait for Grafana server to finish (hopefully never)
# wait $GRAFANA_PID

# only start service if no docker command given
if [[ $# -lt 1 ]] || [[ "$1" == "--"* ]]; then
  echo "Starting Grafana nodejs service";
  (cd /service && npm start)
fi;

