FROM ghcr.io/puppeteer/puppeteer:21.6.1

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

CMD ["node", "server.js"]
