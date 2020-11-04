FROM node:12-alpine

WORKDIR /usr/gverse

ENV COMPOSE_TLS_VERSION=TLSv1_2
COPY ./package.json .
COPY ./tsconfig.json .
COPY ./jest.integration.config.js .
RUN yarn install

COPY ./src ./src