FROM node:16 as builder

COPY . /app
WORKDIR /app
RUN npm ci
RUN npm run build


FROM node:16

COPY . /app
COPY --from=builder /app/dist /app
WORKDIR /app
RUN rm -rf web_components src
RUN npm ci --omit dev

CMD npm start
