FROM node:20.12.2 AS base

RUN mkdir -p /app
COPY package*.json /app/
WORKDIR /app
RUN npm ci

COPY . /app
RUN npm run build

RUN ln -s /etc/mosquitto/certs

# FROM node:16.14.2
#
# COPY . /app
# COPY --from=builder /app/dist /app/dist
# WORKDIR /app
# RUN rm -rf web_components src
# RUN npm ci --omit dev

EXPOSE 9000
ARG TR_HOST
ENV TR_HOST=${TR_HOST:-localhost}

FROM base as dev
RUN apt-get update && apt-get install -y tmux
CMD ./tmux.sh && while (true); do echo "tmux running"; sleep 60; date; done

FROM base as prod

CMD ["npm", "start"]
