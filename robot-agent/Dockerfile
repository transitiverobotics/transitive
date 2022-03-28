# All this does is publish the package
FROM node:16

RUN npm install -g npm@8.5.5
COPY . /app
WORKDIR /app
#RUN npm ci --omit dev --ignore-scripts

#CMD npm publish --registry=http://registry:6000 --_auth=${TR_BOT_TOKEN}
CMD ./republish.sh
