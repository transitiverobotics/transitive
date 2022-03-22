FROM node:16 as builder

COPY . /app
WORKDIR /app
RUN npm ci
RUN npm run build



FROM node:16

COPY deploy /app
WORKDIR /app
RUN npm ci
COPY --from=builder /app/build /app

CMD npx http-server -p 3000
