# Slimmed down from offical mosquitto Dockerfile: just for building plugin
# FROM alpine:3.16 as mosq-builder
FROM eclipse-mosquitto:2.0.18

ENV VERSION=2.0.18

RUN set -x && \
    apk --no-cache add --virtual build-deps \
        build-base \
        cmake \
        cjson-dev \
        gnupg \
        libressl-dev \
        linux-headers \
        util-linux-dev \
        curl git g++ python3 \
        musl-dev iptables ipset ipset-dev libcap2

RUN wget https://mosquitto.org/files/source/mosquitto-${VERSION}.tar.gz -O /tmp/mosq.tar.gz && \
    mkdir -p /build/mosq && \
    tar --strip=1 -xf /tmp/mosq.tar.gz -C /build/mosq && \
    rm /tmp/mosq.tar.gz

# Build Mongo driver
WORKDIR /tmp
RUN curl -OL https://github.com/mongodb/mongo-cxx-driver/releases/download/r3.10.1/mongo-cxx-driver-r3.10.1.tar.gz && \
    tar -xzf mongo-cxx-driver-r3.10.1.tar.gz
RUN cd mongo-cxx-driver-r3.10.1/build && \
    cmake ..                            \
    -DCMAKE_BUILD_TYPE=Release          \
    -DMONGOCXX_OVERRIDE_DEFAULT_INSTALL_PREFIX=OFF && \
    cmake --build . && \
    cmake --build . --target install

# TODO: move to top when done
RUN apk --no-cache add bash>5

# Get JWT library, headers only
ADD https://github.com/Thalhammer/jwt-cpp/archive/refs/tags/v0.7.0.tar.gz jwt-cpp.tgz
RUN tar xzf jwt-cpp.tgz jwt-cpp-0.7.0/include/

# Install doctest, for testing the auth plugin
ADD https://github.com/doctest/doctest/releases/download/v2.4.11/doctest.h \
    /tmp/doctest/doctest.h

# -----------------------------------------------------------------------------
# Build the plugin
WORKDIR /build/mosq/plugins/auth-transitive
COPY auth-transitive .
# RUN gcc -I../../include -I../.. -fPIC -shared mosquitto_auth_transitive.c \
#   -o /mosquitto/mosquitto_auth_transitive.so -fmax-errors=1
RUN g++ -std=c++2a -Wfatal-errors -fPIC -shared -fmax-errors=1 \
  -I../../include -I../.. -I/tmp/jwt-cpp-0.7.0/include/ \
  mosquitto_auth_transitive.cpp -o /mosquitto/mosquitto_auth_transitive.so \
  $(pkg-config --cflags --libs libmongocxx)

RUN g++ -std=c++2a -Wfatal-errors -fPIC -fmax-errors=1 \
  -I../../include -I../.. -I/tmp/jwt-cpp-0.7.0/include/ -I/tmp/doctest \
  tests.cpp -o tests \
  $(pkg-config --cflags --libs libmongocxx)

RUN ./tests

# We need two copies for the two listeners
# RUN cp /mosquitto/mosquitto_auth_transitive.so /mosquitto/mosquitto_auth_transitive2.so

# RUN gcc -I../../include -I../.. -fPIC -shared mosquitto_meter.c -o mosquitto_meter.so -fmax-errors=1
# RUN g++ -std=c++2a -Wfatal-errors -I../../include -I../.. -fPIC -shared \
#   mosquitto_meter.c -o /mosquitto/mosquitto_meter.so -fmax-errors=1 \
#   $(pkg-config --cflags --libs libmongocxx)

# for mosquitto_user_data_set:
# WORKDIR /build/mosq
# RUN make
# WORKDIR /build/mosq/plugins/auth-transitive
# COPY auth-transitive .
# RUN gcc -I../../include -I../.. -fPIC -shared mosquitto_auth_transitive.c ../../lib/libmosquitto.so.1 -o mosquitto_auth_transitive.so

# ----------------------------------------------------------------------------


# FROM iegomez/mosquitto-go-auth:latest-mosquitto_2.0.15
# RUN apt-get update --allow-releaseinfo-change && apt install -y musl-dev iptables ipset libipset-dev libcap2-bin
# RUN ln -s /usr/lib/x86_64-linux-musl/libc.so /lib/libc.musl-x86_64.so.1

# copy our custom auth plugin from builder
# COPY --from=mosq-builder /build/mosq/plugins/auth-transitive/mosquitto_auth_transitive.so /mosquitto/mosquitto_auth_transitive.so
# COPY --from=mosq-builder /build/mosq/plugins/auth-transitive/mosquitto_meter.so /mosquitto/mosquitto_meter.so

COPY mosquitto.conf /mosquitto/mosquitto.conf

# for compatibility with dev setup
RUN ln -s /mosquitto /etc/mosquitto

# make sure to mount certs on /mosquitto/config/certs
EXPOSE 8883/tcp
EXPOSE 9001/tcp

# grant mosquitto the ability to use ipset (doesn't work; running as root instead)
# RUN setcap 'cap_net_raw=+ep cap_net_admin=+ep' /usr/sbin/mosquitto
COPY entrypoint.sh /
WORKDIR /
ENTRYPOINT sh /entrypoint.sh
