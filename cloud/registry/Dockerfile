FROM node:20.12.2

WORKDIR /app
COPY package.json package-lock.json /app/
RUN npm ci --omit dev

COPY . /app

EXPOSE 6000

CMD ["npm", "start"]
