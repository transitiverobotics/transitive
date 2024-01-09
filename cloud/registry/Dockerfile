FROM node:16.14.2

WORKDIR /app
COPY package.json package-lock.json /app/
RUN npm ci --omit dev

COPY . /app

EXPOSE 6000

CMD ["npm", "start"]
