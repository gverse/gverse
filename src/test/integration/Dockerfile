FROM node:8-alpine

WORKDIR /usr/app

COPY ./package.json .
COPY ./tsconfig.json .
COPY ./jest.config.js .
COPY ./jest.integration..config.js .
RUN yarn install

COPY ./src ./src