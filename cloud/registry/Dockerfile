FROM node:24.22.1

WORKDIR /app
COPY package.json package-lock.json /app/
RUN npm ci --omit dev

COPY . /app

EXPOSE 6000

CMD ["npm", "start"]
