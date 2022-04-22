ARG BASE_IMAGE
FROM ${BASE_IMAGE:-'ros:melodic'}

RUN apt-get update
RUN apt-get install -y iputils-ping curl git lsb-release gnupg
RUN apt-get install -y vim

WORKDIR /root
