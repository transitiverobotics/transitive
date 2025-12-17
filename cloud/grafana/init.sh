#!/bin/bash

HOST=http://admin:${GRAFANA_ADMIN_PASSWORD}@localhost:3000

while (! curl -sf http://admin:${GRAFANA_ADMIN_PASSWORD}@localhost:3000/api/org); do
  echo 'Waiting for Grafana API to be up..';
  sleep 2;
done

# Init script to provision the mqtt-history org
ORGID=$(curl -sf -X POST ${HOST}/api/orgs \
  -H "Content-Type: application/json" \
  -d '{"name":"mqtt-history"}' | jq .orgId)

if [[ -z $ORGID ]]; then
  echo Org already existed, not updating provisioning;

  # fetch org by name to get ID
  ORGID=$(curl -s http://admin:${GRAFANA_ADMIN_PASSWORD}@localhost:3000/api/orgs/name/mqtt-history \
  -H "Content-Type: application/json" | jq .id)
fi;

echo OrgId: $ORGID

# Set orgid in provisioning files
for n in $(find /to_be_provisioned -type f -name *.template); do
  env ORGID=$ORGID envsubst < $n > ${n//.template/}
done

# now move the provisioning files into place so they get picked up and trigger a
# reload so we don't need to wait
cp -r /to_be_provisioned/dashboards/* /etc/grafana/provisioning/dashboards
cp -r /to_be_provisioned/datasources/* /etc/grafana/provisioning/datasources

curl -s -X POST ${HOST}/api/admin/provisioning/datasources/reload
echo

sleep 0.2
curl -s -X POST ${HOST}/api/admin/provisioning/dashboards/reload
