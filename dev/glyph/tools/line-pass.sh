#!/bin/sh
# line-pass.sh [dry]: six seconds of the rail's status lines in the real window, to see what
# only it can show: beads sliding to a new place when a tab changes state (once while the
# rail is drawn again every 45 ms), the glint on one at work, a bead growing under a pretended
# pointer with its row lit, and the lines of a folded machine and a folded project. A
# stand-in rail.js gives the tabs there are made-up states, on timers. It can run no
# command, open nothing and keep nothing: no fold and no time it shows is written down.
# The stand-in needs this checkout's ui.js and data.js, so those are installed with it. All
# three files are put back as they were installed, byte for byte, not as glyph/ has them,
# and only where the installed file is still the one this script put there.
# The three run beside the mod's other installed files. Where one of those is not this
# checkout's, the film would mix two builds: the script says which file and films nothing.
# Frames land in .local/shots/line-*.png. `dry` only checks that the stand-in loads.
S=$(cd "$(dirname "$0")/.." && pwd)
L=$(cd "$S/../../glyph" && pwd)
H="$HOME/.config/herdr-app"
W="$S/.local/line-pass"
mkdir -p "$S/.local/shots" "$W/was" "$W/demo"
python3 -I - "$L" "$W" <<'PY' || exit 1
import sys
L, W = sys.argv[1], sys.argv[2]
s = open(L + "/mods/glyph/rail.js").read()
def sub(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)
# Nothing this stand-in does can reach the app or outlast it.
sub('import { theme, run, layout, settings, window as win, openOverlay, agents, setAgentOrder, updates, checking } from "herdr";',
    'import { theme, layout, settings, window as win, agents, updates, checking } from "herdr";\nconst run = () => null, openOverlay = () => null, setAgentOrder = () => null;')
sub('here as hereName, goTab, goSub, lineUp,', 'here as hereName, lineUp,')
sub(' find, tabMenu, says } from "./data.js";', ' find, says } from "./data.js";\nconst goTab = () => null, goSub = () => null, tabMenu = () => null;')
assert s.count("localStorage.setItem(") == 3
s = s.replace("localStorage.setItem(", "(() => null)(")
sub("    this.track(m, now);\n", "    this.act(m, now);\n")
# The play. Step by step: made-up states, then one tab goes to work, needs you, finishes,
# is pointed at, and comes to rest. A machine and a project are folded meanwhile.
sub("    this.refreshMachines(cx);\n    cx.timer.every(20000,", """    this.step = 0;
    this.cast = null;
    for (const [ms, step] of [[900, 1], [1700, 2], [2500, 3], [3300, 4], [3900, 5], [4500, 6]]) cx.timer.after(ms, (cx) => { this.step = step; cx.notify(); });
    // While the bead of step 2 slides, the rail is drawn again every 45 ms, as a pointer
    // crossing its rows would have it drawn: the slide must go on all the same.
    const born = Date.now();
    cx.timer.every(45, (cx) => { const at = Date.now() - born; if (at > 1750 && at < 2300) cx.notify(); });
    this.refreshMachines(cx);
    cx.timer.every(20000,""")
sub("  // The pointer came to a tab's bead or to its row, or left it.", """  act(m, now) {
    const all = m.flat.filter((c) => c.status);
    if (!this.cast) {
      // Who plays: the tab that moves, one more to point at, and what is folded.
      const rest = all.filter((c) => !c.shown);
      const big = [...m.groups].filter((g) => g.name !== null).sort((a, b) => b.spaces.flatMap((x) => x.tabs).length - a.spaces.flatMap((x) => x.tabs).length)[0];
      const roomy = m.spaces.filter((x) => x.machine !== (big?.name ?? "")).sort((a, b) => b.tabs.length - a.tabs.length)[0];
      this.cast = { mover: rest[Math.floor(rest.length / 2)]?.id, other: rest[1]?.id, at: now };
      if (big) this.folded = { ...this.folded, [big.name]: true };
      if (roomy) this.tucked = { ...this.tucked, [roomy.id]: true };
    }
    const k = this.cast;
    all.forEach((c, i) => {
      if (c.id === k.mover || c.shown) return;
      const made = i % 7 === 2 ? "working" : i % 9 === 5 ? "done" : i % 11 === 3 ? "blocked" : c.status;
      if (made !== c.status) { c.status = made; c.changedAt = k.at - (i + 1) * 60000; c.workingSince = made === "working" ? c.changedAt : null; }
    });
    const mover = all.find((c) => c.id === k.mover);
    if (mover) {
      const to = [mover.status, "working", "blocked", "done", "done", "done", "idle"][this.step];
      mover.status = to;
      mover.changedAt = this.step ? k.at + this.step : mover.changedAt;
      mover.workingSince = to === "working" ? mover.changedAt : null;
    }
    this.point = this.step === 4 ? k.mover : this.step === 5 ? k.other : null;
  }

  // The pointer came to a tab's bead or to its row, or left it.""")
open(W + "/rail-demo.js", "w").write(s)
PY
# The stand-in must load before it goes anywhere near the window.
rm -rf "$W/demo"; mkdir -p "$W/demo"
cp "$L"/mods/glyph/*.js "$L"/mods/glyph/mod.json "$W/demo/" && cp "$W/rail-demo.js" "$W/demo/rail.js"
cp -R "$L/mods/glyph/icons" "$W/demo/icons"
herdr-app check "$W/demo" 2>&1 | grep -q "^check passed" || { echo "stand-in does not pass the check: not tried"; herdr-app check "$W/demo" 2>&1 | tail -3 | cut -c1-400; exit 1; }
[ "$1" = "dry" ] && { echo "dry run: stand-in passes the check"; exit 0; }
# The stand-in, ui.js and data.js will run beside every other installed file of the mod.
for f in "$L"/mods/glyph/*.js; do
  n=$(basename "$f")
  case "$n" in rail.js|ui.js|data.js) continue ;; esac
  cmp -s "$f" "$H/mods/glyph/$n" || { echo "the installed $n is not this checkout's: not filmed. Install this checkout first (tools/sync.sh), or film from the checkout that is installed"; exit 1; }
done
# What is installed now is what goes back, and only over a file that is still ours.
for n in ui.js data.js rail.js; do cp "$H/mods/glyph/$n" "$W/was/$n" || exit 1; done
PUT=""
restore() {
  for n in $PUT; do
    if cmp -s "$H/mods/glyph/$n" "$W/put-$n"; then cp "$W/was/$n" "$H/mods/glyph/$n"
    else echo "$n was changed by someone else meanwhile: left as it is"; fi
  done
  PUT=""
}
trap restore EXIT
put() { cp "$1" "$W/put-$2" && cp "$1" "$H/mods/glyph/$2" && PUT="$2 $PUT"; }
before=$(herdr-app shot "$S/.local/shots/.before.png" >/dev/null 2>&1; md5 -q "$S/.local/shots/.before.png")
rm -f "$S"/.local/shots/line-*.png
# Leaves first, and back in the other order: the app reloads at every save.
cmp -s "$L/mods/glyph/ui.js" "$H/mods/glyph/ui.js" || put "$L/mods/glyph/ui.js" ui.js
cmp -s "$L/mods/glyph/data.js" "$H/mods/glyph/data.js" || put "$L/mods/glyph/data.js" data.js
put "$W/rail-demo.js" rail.js
python3 -I - "$S" <<'PY'
import subprocess, sys, time
S = sys.argv[1]; t0 = time.time(); n = 0
while time.time() - t0 < 6.0:
    ms = int((time.time() - t0) * 1000)
    subprocess.run(["herdr-app", "shot", f"{S}/.local/shots/line-{ms:05d}.png"], capture_output=True)
    n += 1
print("frames", n)
PY
herdr-app status | python3 -c 'import json,sys; d=json.load(sys.stdin); print("layout", d["layout"], "errors while the stand-in ran", json.dumps(d["errors"])[:1500])'
restore
sleep 1.5
herdr-app shot "$S/.local/shots/line-after.png" >/dev/null 2>&1
[ "$(md5 -q "$S/.local/shots/line-after.png")" = "$before" ] && echo "STALE: the window was not drawing"
herdr-app status | python3 -c 'import json,sys; d=json.load(sys.stdin); print("layout", d["layout"], "errors", json.dumps(d["errors"])[:1500])'
ok=1; for n in ui.js data.js rail.js; do cmp -s "$H/mods/glyph/$n" "$W/was/$n" || ok=0; done
[ $ok = 1 ] && echo "ui.js, data.js and rail.js are back as they were installed"
