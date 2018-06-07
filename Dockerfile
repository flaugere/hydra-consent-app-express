FROM node:6-alpine

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY . /usr/src/app
RUN npm install --silent; exit 0

ENTRYPOINT npm start

EXPOSE 3000
