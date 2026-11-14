#!/bin/sh
# transfer-pass.sh MACHINE [MB]: the transfer window in the real app, filmed while it makes
# one real copy. For about twenty seconds a stand-in transfer.js opens the window on two
# throwaway folders (one beside this script's output, one on MACHINE, a name from
# `hc machine ls`), picks a file of MB megabytes (150) and presses the arrow by itself.
# Frames land in .local/shots/transfer-*.png: read, picked, copying, landed. The window does
# not take the keyboard. On exit, whatever happens, the window is closed, the real
# transfer.js put back and both folders removed. Run tools/sync.sh first, with the sandbox off.
S=$(cd "$(dirname "$0")/.." && pwd)
L=$(cd "$S/../../glyph" && pwd)
H="$HOME/.config/herdr-app"
M=$1; MB=${2:-150}
[ -n "$M" ] || { echo "usage: transfer-pass.sh MACHINE [MB]"; exit 2; }
cmp -s "$L/mods/glyph/transfer.js" "$H/mods/glyph/transfer.js" || { echo "the installed transfer.js is not the repo's: run tools/sync.sh first"; exit 1; }
W=$S/.local/transfer-pass
R=/tmp/glyph-transfer-pass-$$
SHOTS=$S/.local/shots
mkdir -p "$SHOTS"
before=$(hc ls --all --json --label glyph.copy=1 | python3 -c 'import json,sys; print(" ".join(t["address"] for t in json.load(sys.stdin)["terminals"]))')
mine() { hc ls --all --json --label glyph.copy=1 | python3 -c 'import json,sys; old=set(sys.argv[1].split()); print(" ".join(t["address"] for t in json.load(sys.stdin)["terminals"] if t["address"] not in old and (len(sys.argv) < 3 or t["state"] == sys.argv[2])))' "$before" "$@"; }
restore() {
  # A window closes only from inside (the app's overlay.close takes dialogs and popups, and
  # `herdr-app status` gives no id): a stand-in that closes itself as it starts, for a
  # moment, then the real file.
  python3 - "$L/mods/glyph/transfer.js" "$H/mods/glyph/transfer.js" <<'PY'
import sys
s = open(sys.argv[1]).read()
head = "  constructor(cx) {\n"
if s.count(head) == 1: open(sys.argv[2], "w").write(s.replace(head, head + "    closeOverlay(props()?.overlay);\n"))
PY
  sleep 1.5
  cp "$L/mods/glyph/transfer.js" "$H/mods/glyph/transfer.js"
  # A copy of this pass that is still there is ended; the bar forgets one hc no longer has.
  for id in $(mine); do hc kill "$id" >/dev/null 2>&1; hc rm "$id" >/dev/null 2>&1; done
  hc exec --on "$M" -- rm -rf "$R" >/dev/null 2>&1
  rm -rf "$W"
  sleep 1
  herdr-app status | python3 -c 'import json,sys; d=json.load(sys.stdin); print("after: overlays", json.dumps(d["overlays"]), "errors", json.dumps(d["errors"])[:600])'
  cmp -s "$L/mods/glyph/transfer.js" "$H/mods/glyph/transfer.js" && echo "the real transfer.js is back"
}
trap restore EXIT
rm -rf "$W"; mkdir -p "$W/from"
dd if=/dev/urandom of="$W/from/sample-archive.bin" bs=1048576 count="$MB" 2>/dev/null
echo "nothing here matters" > "$W/from/notes.txt"
hc exec --on "$M" -- mkdir -p "$R/landing" || { echo "can't make a folder on $M"; exit 1; }
hc exec --on "$M" -- sh -c "echo old > '$R/landing/notes.txt'"
python3 - "$L/mods/glyph/transfer.js" "$W/transfer-pass.js" "$W/from" "$M" "$R/landing" <<'PY'
import json, sys
src, out, frm, machine, to = sys.argv[1:6]
s = open(src).read()
tick = "    cx.timer.every(1500, (cx) => this.tick(cx));\n"
keep = "        if (i === 1 && (was?.on !== s.on || was?.path !== s.path)) setShared(SIDE, { on: s.on, path: s.path });\n"
assert s.count(tick) == 1 and s.count(keep) == 1
# The pass's own folders on the two sides, never remembered; then a pick and a press.
play = """    Object.assign(this.sides[0], { on: null, path: %s, lenient: false });
    Object.assign(this.sides[1], { on: %s, path: %s, lenient: false });
    this.load(0, cx);
    this.load(1, cx);
    cx.timer.after(3000, (cx) => this.pick(0, "sample-archive.bin", cx));
    cx.timer.after(5000, (cx) => this.send(cx));
""" % (json.dumps(frm), json.dumps(machine), json.dumps(to))
open(out, "w").write(s.replace(keep, "").replace(tick, tick + play))
PY
[ -s "$W/transfer-pass.js" ] || { echo "could not make the stand-in"; exit 1; }
first=$(herdr-app shot "$SHOTS/.before.png" >/dev/null 2>&1; md5 -q "$SHOTS/.before.png")
cp "$W/transfer-pass.js" "$H/mods/glyph/transfer.js"
sleep 0.8
herdr-app do glyph.transfer >/dev/null 2>&1
sleep 2
herdr-app shot "$SHOTS/transfer-read.png" >/dev/null 2>&1
[ "$(md5 -q "$SHOTS/transfer-read.png")" = "$first" ] && { echo "STALE: window not on screen, nothing more tried"; exit 1; }
herdr-app status | python3 -c 'import json,sys; d=json.load(sys.stdin); print("overlays", json.dumps(d["overlays"])[:300], "errors", json.dumps(d["errors"])[:600])'
sleep 2
herdr-app shot "$SHOTS/transfer-picked.png" >/dev/null 2>&1
sleep 2.2
i=0
while [ $i -lt 90 ]; do
  i=$((i + 1))
  herdr-app shot "$SHOTS/transfer-copying-$i.png" >/dev/null 2>&1
  [ $i -ge 2 ] && [ -z "$(mine live)" ] && break
  sleep 1
done
echo "the copy was live for about $i s; terminals of this pass left: [$(mine)]"
sleep 2.5
herdr-app shot "$SHOTS/transfer-landed.png" >/dev/null 2>&1
echo "on $M: $(hc exec --on "$M" -- ls -l "$R/landing" | tail -n +2 | awk '{print $5, $NF}' | tr '\n' ';')"
herdr-app status | python3 -c 'import json,sys; d=json.load(sys.stdin); print("layout", d["layout"], "errors", json.dumps(d["errors"])[:600])'
python3 -c 'import json,sys; print("shared glyph.copies:", json.dumps(json.load(open(sys.argv[1])).get("glyph.copies")))' "$H/shared.json"
echo "frames: $SHOTS/transfer-{read,picked,copying-N,landed}.png"
