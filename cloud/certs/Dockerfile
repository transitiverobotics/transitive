FROM alpine:latest

RUN apk add openssl
COPY . /certs
VOLUME /generated
WORKDIR /generated

CMD sh ../certs/generate.sh
