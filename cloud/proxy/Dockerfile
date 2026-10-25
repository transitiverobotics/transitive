FROM node:24.22.1

COPY . /app
WORKDIR /app
RUN npm ci --omit dev

VOLUME /app/greenlock.d
EXPOSE 80
EXPOSE 443

CMD ["npm", "start"]
