FROM node:12-alpine

WORKDIR /usr/gverse

COPY ./package.json .
COPY ./tsconfig.json .
COPY ./jest.integration.config.js .
RUN yarn install

COPY ./src ./src