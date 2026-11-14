#!/bin/sh
# await-frame.sh [MAX_SECONDS]: the app only draws while its window is on screen. This takes
# the last frame every few seconds and returns once it differs from the first (a new one was
# drawn), leaving it in the repo's .local/shots/fresh.png.
S=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$S/.local/shots"
MAX=${1:-1500}
herdr-app shot "$S/.local/shots/w0.png" >/dev/null 2>&1
first=$(md5 -q "$S/.local/shots/w0.png")
t=0
while [ "$t" -lt "$MAX" ]; do
  sleep 4; t=$((t + 4))
  herdr-app shot "$S/.local/shots/fresh.png" >/dev/null 2>&1 || continue
  [ "$(md5 -q "$S/.local/shots/fresh.png")" != "$first" ] && { echo "fresh frame after ${t}s"; herdr-app status | grep -A6 '"errors"'; exit 0; }
done
echo "no fresh frame in ${MAX}s"
herdr-app status | grep -A6 '"errors"'
