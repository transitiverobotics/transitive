ARG BASE_IMAGE
FROM ${BASE_IMAGE:-'ros:melodic'}

RUN apt-get update
RUN apt-get install -y iputils-ping curl git lsb-release gnupg
RUN apt-get install -y vim

RUN adduser -q --gecos "testuser" --disabled-password testuser
RUN addgroup testuser sudo
RUN echo "testuser ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

USER testuser

WORKDIR /root
