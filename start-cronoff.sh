#!/bin/sh
# Cronoff on your own computer (made by yehon106). Run:  sh start-cronoff.sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install it from https://nodejs.org (the LTS version), then run this again."
  exit 1
fi
exec node local-server/cronoff-server.js "$@"
