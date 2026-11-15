#!/bin/sh
# transfer-pass.sh MACHINE [MB]: the transfer window in the real app, filmed while it makes
# one real copy. For about twenty seconds a stand-in transfer.js opens the window on two
# throwaway folders (one beside this script's output, one on MACHINE, a name from
# `hc machine ls`), picks a file of MB megabytes (150) and presses the arrow by itself.
# Frames land in .local/shots/transfer-*.png: read, picked, copying, landed. The window does
# not take the keyboard. On exit, whatever happens, the window is closed, the real
# transfer.js put back and both folders removed. Run tools/sync.sh first, with the sandbox off.
#
# transfer-pass.sh direct A B: the same window between two other machines, for what it shows
# of the direct way: asking whether one can log in to the other, the answer with the
# password field, a row picked, the field with a made-up word in it (never sent), and a direct copy
# standing at its password prompt, which the stand-in then ends. No password is typed and
# nothing is copied. Last, a pretend prompt in a terminal on A (a few lines of sh, no scp),
# listed as a direct copy the window holds a made-up word for: the window has to type it
# in, as it would a password. Frames land in .local/shots/direct-*.png.
#
# transfer-pass.sh pick: the same window on two throwaway folders of this computer, for
# what picking shows. No other machine is used. The stand-in calls the window's own press,
# move and release with made-up pointer events: a sweep down three rows, one more row with
# Cmd, the picked rows carried over the other side and let go on a name that is already
# there (the arrow turns red, nothing is copied), then the same carry without that name,
# which copies. Frames land in .local/shots/pick-*.png. The real pointer is never moved,
# so this says nothing about what a real press or drag delivers.
S=$(cd "$(dirname "$0")/.." && pwd)
L=$(cd "$S/../../glyph" && pwd)
H="$HOME/.config/herdr-app"
DIRECT=; A=; PICK=
[ "$1" = direct ] && { DIRECT=1; A=$2; shift 2; }
[ "$1" = pick ] && { PICK=1; shift; }
M=$1; MB=${2:-150}
[ -n "$PICK" ] || { [ -n "$M" ] && { [ -z "$DIRECT" ] || [ -n "$A" ]; }; } || { echo "usage: transfer-pass.sh MACHINE [MB]   or   transfer-pass.sh direct A B   or   transfer-pass.sh pick"; exit 2; }
cmp -s "$L/mods/glyph/transfer.js" "$H/mods/glyph/transfer.js" || { echo "the installed transfer.js is not the repo's: run tools/sync.sh first"; exit 1; }
W=$S/.local/transfer-pass
R=/tmp/glyph-transfer-pass-$$
SHOTS=$S/.local/shots
mkdir -p "$SHOTS"
before=$(hc ls --all --json --label glyph.copy=1 | python3 -c 'import json,sys; print(" ".join(t["address"] for t in json.load(sys.stdin)["terminals"]))')
mine() { hc ls --all --json --label glyph.copy=1 | python3 -c 'import json,sys; old=set(sys.argv[1].split()); print(" ".join(t["address"] for t in json.load(sys.stdin)["terminals"] if t["address"] not in old and (len(sys.argv) < 3 or t["state"] == sys.argv[2])))' "$before" "$@"; }
restore() {
  # The window is closed whatever state the pass left it in: a stand-in that closes itself
  # as it starts, for a moment, then the real file. (The app's overlay.close takes dialogs
  # and popups only, and the bar's command opens the window when it is not on show.)
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
  [ -n "$M" ] && hc exec --on "$M" -- rm -rf "$R" >/dev/null 2>&1
  [ -n "$A" ] && hc exec --on "$A" -- rm -rf "$R" >/dev/null 2>&1
  [ -n "$PRETEND" ] && { hc kill "$PRETEND" >/dev/null 2>&1; hc rm "$PRETEND" >/dev/null 2>&1; }
  rm -rf "$W"
  sleep 1
  herdr-app status | python3 -c 'import json,sys; d=json.load(sys.stdin); print("after: overlays", json.dumps(d["overlays"]), "errors", json.dumps(d["errors"])[:600])'
  cmp -s "$L/mods/glyph/transfer.js" "$H/mods/glyph/transfer.js" && echo "the real transfer.js is back"
}
trap restore EXIT
# Opens the window. Asked for while it shows, the window closes, so it is asked for once
# more when no overlay of the mod is there afterwards.
shown() { herdr-app status | python3 -c 'import json,sys; sys.exit(0 if "glyph" in json.load(sys.stdin)["overlays"] else 1)'; }
open_window() {
  herdr-app do glyph.transfer >/dev/null 2>&1
  sleep 0.6
  shown || { herdr-app do glyph.transfer >/dev/null 2>&1; sleep 0.6; }
}
if [ -n "$PICK" ]; then
  rm -rf "$W"; mkdir -p "$W/from/a-archive" "$W/landing"
  for n in b-notes.txt c-data.bin d-table.csv e-readme.md f-report.md g-last.log; do echo "nothing here matters: $n" > "$W/from/$n"; done
  echo old > "$W/landing/b-notes.txt"
  python3 - "$L/mods/glyph/transfer.js" "$W/transfer-pass.js" "$W/from" "$W/landing" <<'PY'
import json, sys
src, out, frm, to = sys.argv[1:5]
s = open(src).read()
tick = "    cx.timer.every(1500, (cx) => this.tick(cx));\n"
keep = "        if (i === 1 && (was?.on !== s.on || was?.path !== s.path)) setShared(SIDE, { on: s.on, path: s.path });\n"
assert s.count(tick) == 1 and s.count(keep) == 1
# The pass's two folders, never remembered; then the window's own handlers, called with
# made-up pointer events at points of the window.
play = """    Object.assign(this.sides[0], { on: null, path: %(frm)s, lenient: false });
    Object.assign(this.sides[1], { on: null, path: %(to)s, lenient: false });
    this.load(0, cx);
    this.load(1, cx);
    const at = (x, y, keys = {}) => ({ click_count: 1, modifiers: keys, position: { x, y }, local_position: { x, y } });
    const say = (changed, cx) => { if (changed) cx.notify(); };
    cx.timer.after(3000, (cx) => {
      this.press(0, "b-notes.txt", at(200, 300), cx);
      say(this.move(0, "c-data.bin", at(202, 330)), cx);
      say(this.move(0, "d-table.csv", at(203, 356)), cx);
    });
    cx.timer.after(3400, (cx) => this.up(0, cx));
    cx.timer.after(5000, (cx) => { this.press(0, "f-report.md", at(200, 400, { platform: true }), cx); this.up(0, cx); });
    cx.timer.after(7000, (cx) => {
      this.press(0, "c-data.bin", at(200, 330), cx);
      say(this.move(0, "c-data.bin", at(240, 332)), cx);
      say(this.move(null, null, at(330, 250)), cx);
    });
    cx.timer.after(9000, (cx) => { say(this.move(1, null, at(600, 260)), cx); say(this.move(null, null, at(600, 260)), cx); });
    cx.timer.after(11000, (cx) => this.up(1, cx));
    cx.timer.after(15000, (cx) => { this.press(0, "b-notes.txt", at(200, 300, { platform: true }), cx); this.up(0, cx); });
    cx.timer.after(15300, (cx) => {
      this.press(0, "c-data.bin", at(200, 330), cx);
      say(this.move(0, "c-data.bin", at(240, 332)), cx);
      say(this.move(1, null, at(600, 260)), cx);
      say(this.move(null, null, at(600, 260)), cx);
    });
    cx.timer.after(16300, (cx) => this.up(1, cx));
""" % {k: json.dumps(v) for k, v in dict(frm=frm, to=to).items()}
open(out, "w").write(s.replace(keep, "").replace(tick, tick + play))
PY
  [ -s "$W/transfer-pass.js" ] || { echo "could not make the stand-in"; exit 1; }
  first=$(herdr-app shot "$SHOTS/.before.png" >/dev/null 2>&1; md5 -q "$SHOTS/.before.png")
  cp "$W/transfer-pass.js" "$H/mods/glyph/transfer.js"
  sleep 0.8
  open_window
  sleep 0.8
  herdr-app shot "$SHOTS/pick-read.png" >/dev/null 2>&1
  [ "$(md5 -q "$SHOTS/pick-read.png")" = "$first" ] && { echo "STALE: window not on screen, nothing more tried"; exit 1; }
  herdr-app status | python3 -c 'import json,sys; d=json.load(sys.stdin); print("overlays", json.dumps(d["overlays"])[:300], "errors", json.dumps(d["errors"])[:600])'
  sleep 2.2; herdr-app shot "$SHOTS/pick-swept.png" >/dev/null 2>&1
  sleep 1.8; herdr-app shot "$SHOTS/pick-more.png" >/dev/null 2>&1
  sleep 2;   herdr-app shot "$SHOTS/pick-carried.png" >/dev/null 2>&1
  sleep 2;   herdr-app shot "$SHOTS/pick-over.png" >/dev/null 2>&1
  sleep 1.8; herdr-app shot "$SHOTS/pick-armed.png" >/dev/null 2>&1
  echo "after the first carry, in the landing folder: [$(ls "$W/landing" | tr '\n' ';')] b-notes.txt says [$(cat "$W/landing/b-notes.txt")]"
  sleep 4.4; herdr-app shot "$SHOTS/pick-again.png" >/dev/null 2>&1
  sleep 3;   herdr-app shot "$SHOTS/pick-landed.png" >/dev/null 2>&1
  echo "after the second: [$(ls "$W/landing" | tr '\n' ';')] b-notes.txt says [$(cat "$W/landing/b-notes.txt")]"
  herdr-app status | python3 -c 'import json,sys; d=json.load(sys.stdin); print("errors", json.dumps(d["errors"])[:600])'
  python3 -c 'import json,sys; print("shared glyph.copies:", json.dumps(json.load(open(sys.argv[1])).get("glyph.copies")))' "$H/shared.json"
  echo "frames: $SHOTS/pick-{read,swept,more,carried,over,armed,again,landed}.png"
  exit 0
fi
if [ -n "$DIRECT" ]; then
  rm -rf "$W"; mkdir -p "$W"
  hc exec --on "$A" -- sh -c "mkdir -p '$R/from' && echo 'nothing here matters' > '$R/from/notes.txt'" || { echo "can't make a folder on $A"; exit 1; }
  hc exec --on "$M" -- mkdir -p "$R/landing" || { echo "can't make a folder on $M"; exit 1; }
  python3 - "$L/mods/glyph/transfer.js" "$W/transfer-pass.js" "$A" "$R/from" "$M" "$R/landing" <<'PY'
import json, sys
src, out, a, frm, b, to = sys.argv[1:7]
s = open(src).read()
tick = "    cx.timer.every(1500, (cx) => this.tick(cx));\n"
keep = "        if (i === 1 && (was?.on !== s.on || was?.path !== s.path)) setShared(SIDE, { on: s.on, path: s.path });\n"
names = "import { theme, props, run, shared, setShared, notify, closeOverlay } from \"herdr\";\n"
assert s.count(tick) == 1 and s.count(keep) == 1 and s.count(names) == 1
s = s.replace(names, names.replace("{ theme,", "{ hc, theme,"))
# What stands in for scp at a password prompt: it says whether what was typed is the word it was started with.
prompt = 'stty -echo; printf "someone@nowhere\'s password: "; IFS= read -r p; stty echo; echo; [ "$p" = "$0" ] && echo "the same letters" || echo "other letters"; sleep 9'
# The pass's folders on the two machines, never remembered. A pick, a made-up word in the
# field, which is emptied again before a direct copy is started with no password to give
# it: it stands at its prompt until the stand-in forgets and ends it.
play = """    Object.assign(this.sides[0], { on: %(a)s, path: %(frm)s, lenient: false });
    Object.assign(this.sides[1], { on: %(b)s, path: %(to)s, lenient: false });
    this.load(0, cx);
    this.load(1, cx);
    cx.timer.after(7000, (cx) => this.pick(0, "notes.txt", cx));
    cx.timer.after(9000, (cx) => { this.secret.set_value("made-up word"); cx.notify(); });
    cx.timer.after(11000, (cx) => {
      const hop = this.hop();
      this.secret.set_value("");
      if (hop) cx.spawn(async (cx) => { this.passCopy = await startCopy({ from: %(a)s, paths: [%(frm)s + "/notes.txt"], to: %(b)s, dir: %(to)s }, this.machines, true, hop); cx.notify(); });
    });
    cx.timer.after(16500, (cx) => cx.spawn(async (cx) => {
      if (!this.passCopy) return;
      dropCopy(this.passCopy);
      await endCopy(this.passCopy);
      dropCopy(this.passCopy);
      cx.notify();
    }));
    cx.timer.after(19000, (cx) => cx.spawn(async (cx) => {
      const r = await hc(["run", "--on", %(a)s, "--bg", "--no-parent", "--no-notify", "--json", "--label", "glyph.copy=1", "--", "sh", "-c", %(prompt)s, "made-up word"]);
      const id = JSON.parse(r.stdout).address;
      setShared("glyph.copies", [...copies(), { id, from: %(a)s, to: %(b)s, dir: %(to)s, name: "pretend prompt", n: 1, one: true, at: Date.now(), direct: %(b)s }]);
      this.keys.set(id, { secret: "made-up word", armed: true, left: 1 });
      this.hurry(id, 0, cx);
      cx.notify();
      // Forgotten before it ends, so the bar says nothing of it.
      cx.timer.after(7000, (cx) => { dropCopy(id); cx.notify(); });
    }));
""" % {k: json.dumps(v) for k, v in dict(a=a, frm=frm, b=b, to=to, prompt=prompt).items()}
open(out, "w").write(s.replace(keep, "").replace(tick, tick + play))
PY
  [ -s "$W/transfer-pass.js" ] || { echo "could not make the stand-in"; exit 1; }
  first=$(herdr-app shot "$SHOTS/.before.png" >/dev/null 2>&1; md5 -q "$SHOTS/.before.png")
  cp "$W/transfer-pass.js" "$H/mods/glyph/transfer.js"
  sleep 0.8
  open_window
  sleep 1
  herdr-app shot "$SHOTS/direct-asking.png" >/dev/null 2>&1
  [ "$(md5 -q "$SHOTS/direct-asking.png")" = "$first" ] && { echo "STALE: window not on screen, nothing more tried"; exit 1; }
  herdr-app status | python3 -c 'import json,sys; d=json.load(sys.stdin); print("overlays", json.dumps(d["overlays"])[:300], "errors", json.dumps(d["errors"])[:600])'
  sleep 4.4; herdr-app shot "$SHOTS/direct-answered.png" >/dev/null 2>&1
  sleep 2;   herdr-app shot "$SHOTS/direct-picked.png" >/dev/null 2>&1
  sleep 2;   herdr-app shot "$SHOTS/direct-typed.png" >/dev/null 2>&1
  sleep 4.5; herdr-app shot "$SHOTS/direct-prompt.png" >/dev/null 2>&1
  python3 -c 'import json,sys; print("while at its prompt, shared glyph.copies:", json.dumps(json.load(open(sys.argv[1])).get("glyph.copies")))' "$H/shared.json"
  sleep 4;   herdr-app shot "$SHOTS/direct-ended.png" >/dev/null 2>&1
  sleep 5
  PRETEND=$(python3 -c 'import json,sys; print(next((c["id"] for c in json.load(open(sys.argv[1])).get("glyph.copies") or [] if c["name"] == "pretend prompt"), ""))' "$H/shared.json")
  herdr-app shot "$SHOTS/direct-fed.png" >/dev/null 2>&1
  if [ -n "$PRETEND" ]; then
    echo "the pretend prompt ($PRETEND), after the window typed into it: [$(hc read "$PRETEND" --lines 5 | tr '\n' '|')]"
  else echo "the pretend prompt was not listed"; fi
  sleep 3.5
  echo "on $M: [$(hc exec --on "$M" -- ls "$R/landing" | tr '\n' ';')] (nothing was to land)"
  python3 -c 'import json,sys; print("after, shared glyph.copies:", json.dumps(json.load(open(sys.argv[1])).get("glyph.copies")))' "$H/shared.json"
  echo "frames: $SHOTS/direct-{asking,answered,picked,typed,prompt,ended,fed}.png"
  exit 0
fi
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
open_window
sleep 1.4
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
