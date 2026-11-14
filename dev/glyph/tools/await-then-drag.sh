#!/bin/sh
# await-then-drag.sh [MAX_SECONDS]: the app draws only while its window is on screen. Waits
# until two frames taken a moment apart differ (it is drawing), then runs drag-pass.sh once.
S=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$S/.local/shots"
MAX=${1:-420}; t=0
while [ "$t" -lt "$MAX" ]; do
  herdr-app shot "$S/.local/shots/.a.png" >/dev/null 2>&1; sleep 0.3; herdr-app shot "$S/.local/shots/.b.png" >/dev/null 2>&1
  if ! cmp -s "$S/.local/shots/.a.png" "$S/.local/shots/.b.png"; then echo "window drawing after ${t}s"; sh "$S/tools/drag-pass.sh"; exit $?; fi
  sleep 2; t=$((t + 3))
done
echo "window not on screen in ${MAX}s: nothing tried"
