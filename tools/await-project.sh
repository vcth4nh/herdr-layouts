#!/bin/sh
# await-project.sh NAME [MAX_SECONDS]: wait until the project NAME is the shown one and the
# window draws, then save that frame as the repo's .local/shots/project.png. Only looks; changes nothing.
S=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$S/.local/shots"
NAME=$1; MAX=${2:-120}; t=0
herdr-app shot "$S/.local/shots/.p0.png" >/dev/null 2>&1; last=$(md5 -q "$S/.local/shots/.p0.png")
while [ "$t" -lt "$MAX" ]; do
  shown=$(herdr-app ls 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print(next((s["name"] for s in d["spaces"] if s["active"]), ""))')
  if [ "$shown" = "$NAME" ]; then
    sleep 1
    herdr-app shot "$S/.local/shots/project.png" >/dev/null 2>&1
    now=$(md5 -q "$S/.local/shots/project.png")
    [ "$now" != "$last" ] && { echo "caught $NAME after ${t}s"; exit 0; }
  fi
  sleep 3; t=$((t + 4))
done
echo "not shown in ${MAX}s (last shown: $shown)"
