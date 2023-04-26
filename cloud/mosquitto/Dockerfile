# Slimmed down from offical mosquitto Dockerfile: just for building plugin
FROM alpine:3.16 as mosq-builder

LABEL maintainer="Roger Light <roger@atchoo.org>" \
    description="Eclipse Mosquitto MQTT Broker"

ENV VERSION=2.0.15 \
    DOWNLOAD_SHA256=4735b1d32e3f91c7a8896741d88a3022e89730a1ee897946decfa0df27039ac6 \
    GPG_KEYS=A0D6EEA1DCAE49A635A3B2F0779B22DFB3E717B7

RUN set -x && \
    apk --no-cache add --virtual build-deps \
        build-base \
        cmake \
        cjson-dev \
        gnupg \
        libressl-dev \
        linux-headers \
        util-linux-dev

RUN wget https://mosquitto.org/files/source/mosquitto-${VERSION}.tar.gz -O /tmp/mosq.tar.gz && \
    echo "$DOWNLOAD_SHA256  /tmp/mosq.tar.gz" | sha256sum -c - && \
    wget https://mosquitto.org/files/source/mosquitto-${VERSION}.tar.gz.asc -O /tmp/mosq.tar.gz.asc && \
    export GNUPGHOME="$(mktemp -d)" && \
    found=''; \
    for server in \
        hkps://keys.openpgp.org \
        hkp://keyserver.ubuntu.com:80 \
        pgp.mit.edu \
    ; do \
        echo "Fetching GPG key $GPG_KEYS from $server"; \
        gpg --keyserver "$server" --keyserver-options timeout=10 --recv-keys "$GPG_KEYS" && found=yes && break; \
    done; \
    test -z "$found" && echo >&2 "error: failed to fetch GPG key $GPG_KEYS" && exit 1; \
    gpg --batch --verify /tmp/mosq.tar.gz.asc /tmp/mosq.tar.gz && \
    gpgconf --kill all && \
    rm -rf "$GNUPGHOME" /tmp/mosq.tar.gz.asc && \
    mkdir -p /build/mosq && \
    tar --strip=1 -xf /tmp/mosq.tar.gz -C /build/mosq && \
    rm /tmp/mosq.tar.gz

# Build the plugin
WORKDIR /build/mosq/plugins/auth-transitive
COPY auth-transitive .
RUN gcc -I../../include -I../.. -fPIC -shared mosquitto_auth_transitive.c -o mosquitto_auth_transitive.so

# for mosquitto_user_data_set:
# WORKDIR /build/mosq
# RUN make
# WORKDIR /build/mosq/plugins/auth-transitive
# COPY auth-transitive .
# RUN gcc -I../../include -I../.. -fPIC -shared mosquitto_auth_transitive.c ../../lib/libmosquitto.so.1 -o mosquitto_auth_transitive.so

# ----------------------------------------------------------------------------

FROM iegomez/mosquitto-go-auth:latest-mosquitto_2.0.15


RUN apt-get install -y musl-dev
RUN ln -s /usr/lib/x86_64-linux-musl/libc.so /lib/libc.musl-x86_64.so.1

# copy our custom auth plugin from builder
COPY --from=mosq-builder /build/mosq/plugins/auth-transitive/mosquitto_auth_transitive.so /mosquitto/mosquitto_auth_transitive.so

COPY mosquitto.conf /mosquitto/mosquitto.conf
# COPY auth /mosquitto/auth/
# RUN cp /mosquitto/go-auth.so /mosquitto/go-auth2.so

# for compatibility with dev setup
RUN ln -s /mosquitto /etc/mosquitto

# make sure to mount certs on /mosquitto/config/certs
EXPOSE 8883/tcp
EXPOSE 9001/tcp
