#!/bin/sh
# live-pass.sh: a few seconds of looking at what real work rarely shows at once, in the
# real window: (1) every state on the tabs there are (a stand-in data.js for ~2s, then
# the real one back), (2) the wider rail that names projects (236px, then 160 again).
# Frames land in .local/shots/: demo.png, named-live.png, after.png. Everything is put back on
# exit, whatever happens.
S=$(cd "$(dirname "$0")/.." && pwd)
L=$(cd "$S/../../glyph" && pwd)
mkdir -p "$S/.local/shots" "$S/.local/harness"
H="$HOME/.config/herdr-app"
restore() {
  cmp -s "$L/mods/glyph/data.js" "$H/mods/glyph/data.js" || cp "$L/mods/glyph/data.js" "$H/mods/glyph/data.js"
  cmp -s "$L/mods/glyph/rail.js" "$H/mods/glyph/rail.js" || cp "$L/mods/glyph/rail.js" "$H/mods/glyph/rail.js"
  herdr-app do layout.resize '{"id":"sidebar","px":160}' >/dev/null 2>&1
}
trap restore EXIT
python3 - "$S" "$L" <<'PY'
import sys
S, L = sys.argv[1], sys.argv[2]
s = open(L + "/mods/glyph/data.js").read()
old = "  const counts = { blocked: 0, done: 0, working: 0, idle: 0, total: 0 };"
assert s.count(old) == 1
demo = """  ["blocked", "done", "working", "idle"].forEach((st, k) => flat.forEach((c, i) => { if (i % 4 === k && !c.shown) c.status = st; }));
  flat.forEach((c, i) => { if (i % 6 === 1) c.subs = { count: 2, status: "working" }; });
"""
open(S + "/.local/harness/data-demo.js", "w").write(s.replace(old, demo + old))
# The rail's record of since when each tab has rested must not learn the made-up states.
r = open(L + "/mods/glyph/rail.js").read()
keep = "    this.track(m, now);\n"
assert r.count(keep) == 1
open(S + "/.local/harness/rail-demo.js", "w").write(r.replace(keep, ""))
PY
before=$(herdr-app shot "$S/.local/shots/.before.png" >/dev/null 2>&1; md5 -q "$S/.local/shots/.before.png")
cp "$S/.local/harness/rail-demo.js" "$H/mods/glyph/rail.js"
cp "$S/.local/harness/data-demo.js" "$H/mods/glyph/data.js"
sleep 2.4
herdr-app shot "$S/.local/shots/demo.png" >/dev/null 2>&1
cp "$L/mods/glyph/data.js" "$H/mods/glyph/data.js"
cp "$L/mods/glyph/rail.js" "$H/mods/glyph/rail.js"
[ "$(md5 -q "$S/.local/shots/demo.png")" = "$before" ] && { echo "STALE: window not on screen, nothing more tried"; exit 1; }
sleep 1.2
herdr-app do layout.resize '{"id":"sidebar","px":236}' >/dev/null 2>&1
sleep 1.4
herdr-app shot "$S/.local/shots/named-live.png" >/dev/null 2>&1
herdr-app do layout.resize '{"id":"sidebar","px":160}' >/dev/null 2>&1
sleep 1.2
herdr-app shot "$S/.local/shots/after.png" >/dev/null 2>&1
herdr-app status | python3 -c 'import json,sys; d=json.load(sys.stdin); print("layout", d["layout"], "errors", json.dumps(d["errors"])[:1500])'
cmp -s "$L/mods/glyph/data.js" "$H/mods/glyph/data.js" && cmp -s "$L/mods/glyph/rail.js" "$H/mods/glyph/rail.js" && echo "real data.js and rail.js are back"
echo done
