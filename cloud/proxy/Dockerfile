FROM node:16.14.2

COPY . /app
WORKDIR /app
RUN npm ci --omit dev

VOLUME /app/greenlock.d
EXPOSE 8000

CMD ["npm", "start"]
