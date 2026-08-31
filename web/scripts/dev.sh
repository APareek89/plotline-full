#!/usr/bin/env bash
# `npm run dev` when a dev server is already on :3100.
#
# The old behaviour: predev reports "web :3100 UP", then next dev tries to bind
# the same port and dies with a raw EADDRINUSE stack. Both statements are true
# and together they read as a failure, when the actual situation is "the thing
# you asked for is already running".
#
# Next's dev server hot-reloads, so an existing one is already serving current
# code — restarting it buys nothing and loses the warm build.
set -euo pipefail

PORT=3100

if lsof -ti :$PORT >/dev/null 2>&1; then
  echo ""
  echo "  Dev server is already running → http://localhost:$PORT"
  echo "  It hot-reloads, so it already has your latest edits."
  echo ""
  echo "  To restart it anyway:  npm run dev:restart"
  echo "  To stop the API stack: npm run stack:stop"
  echo ""
  exit 0
fi

exec next dev -p $PORT
