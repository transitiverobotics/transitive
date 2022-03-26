FROM alpine:latest

RUN apk add openssl
VOLUME certs
WORKDIR /certs

CMD sh generate.sh
