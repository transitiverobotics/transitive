# FROM clickhouse/clickhouse-server:24-alpine
FROM clickhouse:25.7

COPY etc/ /etc/

# ----------------------------
# mqtt2clickhouse service

# Install node.js

# set by Docker:
ARG TARGETARCH

ADD https://deb.nodesource.com/node_24.x/pool/main/n/nodejs/nodejs_24.13.0-1nodesource1_${TARGETARCH}.deb /tmp/nodejs.deb
RUN apt update && DEBIAN_FRONTEND=noninteractive apt install -y /tmp/nodejs.deb

WORKDIR /service/
COPY service/package* .
RUN npm ci
COPY service/. /service

ENTRYPOINT ["/service/entrypoint.sh"]

