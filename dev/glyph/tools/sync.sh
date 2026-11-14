#!/bin/sh
# sync.sh [NAME] [layout]: copy what changed in glyph/ into the app's home (it reloads on save),
# check the mod, print the app's errors, then save a frame as .local/shots/NAME.png.
# The frame is only new while the window is on screen: "STALE" says it was not.
S=$(cd "$(dirname "$0")/.." && pwd)
L=$(cd "$S/../../glyph" && pwd)
mkdir -p "$S/.local/shots"
H="$HOME/.config/herdr-app"
NAME=${1:-live}
before=$(herdr-app shot "$S/.local/shots/.before.png" >/dev/null 2>&1; md5 -q "$S/.local/shots/.before.png")
put() { cmp -s "$1" "$2" || { cp "$1" "$2" && echo "updated ${2#$H/}"; }; }
for f in "$L"/mods/glyph/icons/*.svg; do put "$f" "$H/mods/glyph/icons/$(basename "$f")"; done
# Leaves first, so the app never reloads a file whose imports are not there yet.
for n in mod.json ui.js data.js menu.js pane.js rail.js bar.js blank.js main.js; do put "$L/mods/glyph/$n" "$H/mods/glyph/$n"; done
for f in "$L"/mods/glyph/*.js; do put "$f" "$H/mods/glyph/$(basename "$f")"; done
put "$L/themes/glyph.json" "$H/themes/glyph.json"
put "$L/layouts/glyph.svg" "$H/layouts/glyph.svg"
[ "$2" = "layout" ] && put "$L/layouts/glyph.json" "$H/layouts/glyph.json"
herdr-app check "$H/mods/glyph" 2>&1 | tail -2 | cut -c1-400
sleep 1.5
herdr-app status | python3 -c 'import json,sys; d=json.load(sys.stdin); print("layout", d["layout"], "errors", json.dumps(d["errors"])[:1500])'
herdr-app shot "$S/.local/shots/$NAME.png" >/dev/null 2>&1
[ "$(md5 -q "$S/.local/shots/$NAME.png")" = "$before" ] && echo "STALE frame (window not on screen)" || echo "fresh frame: $S/.local/shots/$NAME.png"
