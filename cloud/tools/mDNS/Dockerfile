FROM node:20.8

COPY . /app
WORKDIR /app
RUN npm ci --omit dev

EXPOSE 5353

CMD ["npm", "start"]
