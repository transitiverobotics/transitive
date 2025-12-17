FROM grafana/grafana

# used in init script
USER root
RUN apk add jq envsubst

COPY grafana.ini /etc/grafana/grafana.ini
COPY provisioning/ /to_be_provisioned
COPY init.sh /

ENTRYPOINT ["/bin/sh", "-c", "/run.sh & sleep 2 && /init.sh && sleep Infinity"]
