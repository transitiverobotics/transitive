FROM node:24.16.0 AS base

RUN mkdir -p /app
COPY package*.json /app/
WORKDIR /app
RUN npm ci

COPY . /app
RUN npm run build

RUN ln -s /etc/mosquitto/certs

EXPOSE 9000
ARG TR_HOST
ENV TR_HOST=${TR_HOST:-localhost}

# -----------------------------------------------------------------------------

FROM base AS dev
RUN apt-get update && apt-get install -y tmux
CMD ./tmux.sh && while (true); do echo "tmux running"; sleep 60; date; done

# -----------------------------------------------------------------------------

FROM base AS prod

CMD ["npm", "start"]
