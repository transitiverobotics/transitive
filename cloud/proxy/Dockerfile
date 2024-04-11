FROM node:20.12.2

COPY . /app
WORKDIR /app
RUN npm ci --omit dev

VOLUME /app/greenlock.d
EXPOSE 80
EXPOSE 443

CMD ["npm", "start"]
