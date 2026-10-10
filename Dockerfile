FROM node:22-alpine
WORKDIR /app
COPY package.json server.js pocketbase.js ./
COPY public ./public
RUN mkdir -p data
EXPOSE 3000
CMD ["npm", "start"]
