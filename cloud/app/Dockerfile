FROM node:16.14.2 as builder

ARG TR_HOST
ENV TR_HOST=${TR_HOST:-localhost}

COPY . /app
WORKDIR /app
RUN npm ci
RUN npm run build

FROM node:16.14.2

COPY . /app
COPY --from=builder /app/dist /app/dist
WORKDIR /app
RUN rm -rf web_components src
RUN npm ci --omit dev

EXPOSE 9000

CMD npm start
