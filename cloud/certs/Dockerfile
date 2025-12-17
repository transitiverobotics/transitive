FROM node:24

RUN apt-get update && apt-get install -y openssl
COPY . /app

WORKDIR /
CMD sh ../app/generate.sh
