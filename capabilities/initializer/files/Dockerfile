FROM node:16

WORKDIR /app
ENV TRANSITIVE_IS_CLOUD=1
ENV TR_DEVMODE=1
ENV EXTERNAL_IP=127.0.0.1
RUN apt-get update && apt-get install -y vim

COPY . /app/
ENV npm_config_userconfig=/app/.npmrc
RUN npm --prefix cloud install

# CMD cp -a dist /app/run && npm run cloud
CMD ["npm","run","cloud"]

