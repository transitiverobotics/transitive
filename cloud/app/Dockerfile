# This file is for creating containers for the cloud-component of capabilities
FROM node:16

WORKDIR /app
# these files are generated on-the-fly by the cloud agent prior to docker build
COPY certs/ /app/certs
COPY package.json /app
COPY .npmrc /app

RUN npm install

CMD npm start
