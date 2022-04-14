ARG BASE_IMAGE
# FROM ubuntu:18.04
FROM ${BASE_IMAGE:-'ros:melodic'}

RUN apt-get update
RUN apt-get install -y iputils-ping curl git lsb-release gnupg

COPY . /docker
WORKDIR /docker
ENTRYPOINT ["./entrypoint.sh"]
