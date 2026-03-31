FROM grafana/grafana:12.4.2

# used in init script
USER root
RUN apk add jq envsubst nodejs npm

WORKDIR /service
COPY service/package* .
RUN npm ci
COPY service/. /service

COPY grafana.ini /etc/grafana/grafana.ini
COPY provisioning/ /to_be_provisioned
COPY init.sh /

ENTRYPOINT ["/init.sh"]
