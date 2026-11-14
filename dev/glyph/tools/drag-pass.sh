#!/bin/sh
# drag-pass.sh: a few seconds of a pretended tab drag in the real strip, to see what only the
# real window can show: tabs standing aside, the slide, and the strip afterwards. The
# stand-in bar.js can run no command and open nothing; the real one is put back on exit.
S=$(cd "$(dirname "$0")/.." && pwd)
L=$(cd "$S/../../glyph" && pwd)
mkdir -p "$S/.local/shots" "$S/.local/harness"
H="$HOME/.config/herdr-app"
restore() { cmp -s "$L/mods/glyph/bar.js" "$H/mods/glyph/bar.js" || cp "$L/mods/glyph/bar.js" "$H/mods/glyph/bar.js"; }
trap restore EXIT
python3 -I - "$S" "$L" <<'PY' || exit 1
import sys
S, L = sys.argv[1], sys.argv[2]
s = open(L + "/mods/glyph/bar.js").read()
def sub(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:60])
    s = s.replace(old, new)
# Nothing this stand-in does can reach the app: no commands, no overlays.
sub('import { theme, run, layout, settings, spaces, panes, focused, machines, shared, setShared, notify, window as win, openOverlay, knownAgents, nextCommand } from "herdr";',
    'import { theme, layout, settings, spaces, panes, focused, machines, shared, window as win, knownAgents } from "herdr";\nconst run = () => null, openOverlay = () => null, setShared = () => null, notify = () => null, nextCommand = () => new Promise(() => {});')
sub('import { model, jump, tabTip, find, tabMenu, renameTab, newTab, shell, keyFor, withKey, BLANK, SHUT, ARM } from "./data.js";',
    'import { model, tabTip, find, shell, keyFor, withKey, BLANK, SHUT, ARM } from "./data.js";\nconst jump = () => null, tabMenu = () => null, renameTab = () => null, newTab = () => null;')
# It shows the project with the most tabs, whichever is open.
sub("    const s = m.active;\n    const w = win();\n", "    const s = [...m.spaces].sort((a, b) => b.tabs.length - a.tabs.length)[0] ?? m.active;\n    const w = win();\n")
sub("    this.learn(cx);\n    cx.timer.every(3000, (cx) => this.learn(cx));\n", """    this.learn(cx);
    cx.timer.every(3000, (cx) => this.learn(cx));
    const hold = (i) => this.press([...model().spaces].sort((a, b) => b.tabs.length - a.tabs.length)[0].tabs, i, { position: { x: 0 } });
    const at = (ms, fn) => cx.timer.after(ms, (cx) => { fn(); cx.notify(); });
    at(600, () => { hold(0); if (this.drag) this.drag.moved = true; });
    at(800, () => { if (this.drag) this.drag.to = 3; });
    at(1400, () => { if (this.drag) this.drag.to = 1; });
    at(2000, () => { this.drag = null; });
""")
open(S + "/.local/harness/bar-demo.js", "w").write(s)
PY
rm -rf "$S/.local/harness/run/demo"; mkdir -p "$S/.local/harness/run/demo"
cp "$L"/mods/glyph/*.js "$L"/mods/glyph/mod.json "$S/.local/harness/run/demo/" && cp "$S/.local/harness/bar-demo.js" "$S/.local/harness/run/demo/bar.js"
cp -R "$L/mods/glyph/icons" "$S/.local/harness/run/demo/icons"
herdr-app check "$S/.local/harness/run/demo" 2>&1 | tail -1 | cut -c1-300 | grep -q "check passed" || { echo "stand-in does not pass the check: not tried"; herdr-app check "$S/.local/harness/run/demo" 2>&1 | tail -3 | cut -c1-400; exit 1; }
[ "$1" = "dry" ] && { echo "dry run: stand-in passes the check"; exit 0; }
rm -f "$S"/.local/shots/drag-*.png
cp "$S/.local/harness/bar-demo.js" "$H/mods/glyph/bar.js"
python3 -I - "$S" <<'PY'
import subprocess, sys, time
S = sys.argv[1]; t0 = time.time(); n = 0
while time.time() - t0 < 3.4:
    ms = int((time.time() - t0) * 1000)
    subprocess.run(["herdr-app", "shot", f"{S}/.local/shots/drag-{ms:05d}.png"], capture_output=True)
    n += 1
print("frames", n)
PY
restore
sleep 1.2
herdr-app shot "$S/.local/shots/drag-after.png" >/dev/null 2>&1
herdr-app status | python3 -c 'import json,sys; d=json.load(sys.stdin); print("layout", d["layout"], "errors", json.dumps(d["errors"])[:1500])'
cmp -s "$L/mods/glyph/bar.js" "$H/mods/glyph/bar.js" && echo "real bar.js is back"
