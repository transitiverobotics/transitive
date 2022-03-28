FROM node:16

RUN npm install -g npm@8.5.5
COPY . /app
WORKDIR /app
RUN npm ci --omit dev

EXPOSE 6000

CMD npm start
