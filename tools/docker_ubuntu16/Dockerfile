FROM ros:kinetic

RUN apt-get update
RUN apt-get install -y iputils-ping curl git lsb-release gnupg
RUN apt-get install -y vim

RUN adduser -q --gecos "transitive" --disabled-password transitive
RUN addgroup transitive sudo
RUN echo "transitive ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

USER transitive

WORKDIR /home/transitive
