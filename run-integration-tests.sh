#!/bin/sh

if [ "$(which docker-compose)" = "" ]; then
  echo Docker and Docker Compose are required to run integration tests.
  echo Visit https://docs.docker.com/compose/install/ for details.
else
  docker-compose -f src/test/integration/docker-compose.yml up --build --exit-code-from gverse --abort-on-container-exit
fi
