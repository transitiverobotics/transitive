FROM node:16.14.2 as builder

COPY . /app
WORKDIR /app
RUN npm ci
RUN npm run build

RUN apt-get update && apt-get install -y brotli
RUN cd /app/build/assets/js && brotli *

FROM node:16.14.2

COPY deploy /app
WORKDIR /app
RUN npm ci
COPY --from=builder /app/build /app

CMD ["npx", "http-server", "-p", "3000", "-g", "-b"]
