FROM node:16.14.2

COPY . /app
WORKDIR /app
RUN npm ci --omit dev

EXPOSE 6000

CMD npm start
