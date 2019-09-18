#!/bin/bash
# This script runs Dgraph for integration tests

DGRAPH_CMD=$(which dgraph)
REQUIRED_DGRAPH_VERSION="v1.0.17"

if [ -z "$DGRAPH_CMD" ]; then
  echo "Dgraph not found path. Please check your install."
  exit 1
fi

dgraph_version=$($DGRAPH_CMD version | grep "Dgraph version" | sed 's/.* \(.*\)/\1/')

if [ "$dgraph_version" != "$REQUIRED_DGRAPH_VERSION" ]; then
  echo "Unsupported version $dgraph_version. Please get Dgraph $REQUIRED_DGRAPH_VERSION"
  exit 1
fi

# script's path
SOURCE_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# folder for saving dgraph data files
DATA_PATH="${SOURCE_PATH}/../tmp/dgraph"

# reset the folder
mkdir -p $DATA_PATH
rm -rf $DATA_PATH/*

# start dgraph
echo -e "\n\nStarting Dgraph server for integration testing. Press Ctrl/Cmd+C to terminate.\n"
$DGRAPH_CMD zero --wal $DATA_PATH/zw >$DATA_PATH/zero.log &
$DGRAPH_CMD alpha --zero localhost:5080 --lru_mb 2048 --postings $DATA_PATH/p --wal $DATA_PATH/w >$DATA_PATH/alpha.log
