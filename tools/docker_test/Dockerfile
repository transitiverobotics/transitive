FROM ubuntu:18.04

RUN apt-get update && apt-get install -y iputils-ping curl git lsb-release

RUN hostname > /etc/machine-id

COPY . /docker
WORKDIR /docker
ENTRYPOINT ["./entrypoint.sh"]
