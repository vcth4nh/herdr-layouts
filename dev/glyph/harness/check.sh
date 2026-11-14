#!/bin/sh
# check.sh ROLE [PANE] [WIDTH] [TAG] [ACTIVE]: copies the look's mod, swaps Herdr's live data
# for the fixed sample, and runs `herdr-app check --print-spec` on that copy.
# Output: .local/harness/out/TAG.txt. ROLE is rail, bar, pane, menu or blank; for menu, PANE
# is the tab's id. ACTIVE is the project on show (sp9: one showing its empty page).
# Env hooks pretend a state the check can't reach by itself: ROOM, DRAG, ARMED, FOLD, HOVER, SURE.
export S=$(cd "$(dirname "$0")/.." && pwd)
export L=$(cd "$S/../../glyph" && pwd)
ROLE=$1; PANE=${2:-p3}; WIDTH=${3:-160}; TAG=${4:-$ROLE}; ACTIVE=${5:-sp2}
D=$S/.local/harness/run/$TAG
rm -rf "$D"; mkdir -p "$D/mods/glyph" "$D/icons" "$S/.local/harness/out"
cp $L/mods/glyph/*.js $L/mods/glyph/mod.json "$D/"
cp -R $L/mods/glyph/icons "$D/mods/glyph/icons"
cp ~/.config/herdr-app/icons/*.svg "$D/icons/"
python3 -I - "$D" "$ROLE" "$PANE" "$WIDTH" "$ACTIVE" <<'PY' || { echo "check.sh: could not stage the mod (see above)"; exit 1; }
import json, sys, glob, os
d, role, pane, width, active = sys.argv[1:6]
S, L = os.environ["S"], os.environ["L"]
t = json.load(open(L + "/themes/glyph.json"))
theme = {**t["colors"], "cursor": t["cursor"], **{f"ansi{i}": c for i, c in enumerate(t["ansi"])}}
lay = json.load(open(L + "/layouts/glyph.json"))
lay["children"][0]["size"]["px"] = int(width)
fake = open(S + "/harness/herdr-fake.js").read().replace("__ROLE__", role).replace("__PANE__", pane).replace("__ACTIVE__", active)
fake = fake.replace("__THEME__", json.dumps(theme)).replace("__LAYOUT__", json.dumps(lay))
open(d + "/herdr-fake.js", "w").write(fake)
for f in glob.glob(d + "/*.js"):
    if f.endswith("herdr-fake.js"): continue
    s = open(f).read().replace('from "herdr"', 'from "./herdr-fake.js"')
    # ROOM=n: pretend the tab strip was measured n wide (the check itself never lays out).
    if os.environ.get("ROOM"): s = s.replace("this.room = null;", "this.room = %d;" % int(os.environ["ROOM"]))
    # ARMED=tab: pretend a first close press landed on that tab (bar.js).
    if os.environ.get("ARMED") and f.endswith("/bar.js"):
        head = "this.armed = null;      // what a first close press was for"
        assert s.count(head) == 1
        s = s.replace(head, 'this.armed = { id: "%s", tab: "%s", at: Date.now() }; // what a first close press was for' % (os.environ["ARMED"], os.environ["ARMED"]))
    # FOLD=a,b: pretend those machines are folded (rail.js; "local" is this computer).
    if os.environ.get("FOLD") and f.endswith("/rail.js"):
        head = 'this.folded = JSON.parse(localStorage.getItem("folded") ?? "{}");'
        assert s.count(head) == 1
        s = s.replace(head, "this.folded = %s;" % json.dumps({("" if k == "local" else k): True for k in os.environ["FOLD"].split(",")}))
    # HOVER=1: the pane header as under the pointer. SURE=1: a close clicked or chosen once (pane.js, menu.js).
    if os.environ.get("HOVER") and f.endswith("/pane.js"):
        assert s.count("this.hovered = false;") == 1
        s = s.replace("this.hovered = false;", "this.hovered = true;")
    if os.environ.get("SURE") and f.endswith("/pane.js"):
        assert s.count("this.sure = 0; //") == 1
        s = s.replace("this.sure = 0; //", "this.sure = Date.now(); //")
    if os.environ.get("SURE") and f.endswith("/menu.js"):
        assert s.count("this.sure = false; //") == 1 and s.count("this.at = 0;") == 1
        s = s.replace("this.sure = false; //", "this.sure = true; //").replace("this.at = 0;", "this.at = 2;")
    # DRAG=from:to[:nowidths]: pretend a tab is held and has been moved (bar.js only).
    if os.environ.get("DRAG") and f.endswith("/bar.js"):
        parts = os.environ["DRAG"].split(":"); F, T = int(parts[0]), int(parts[1])
        W = "null" if len(parts) > 2 else "tabs.map((c, i) => (c.title ? rest(c) + widths[i] : c.active ? 61 : 32))"
        head = "    const d = this.drag;\n    const dragging = Boolean(d?.moved) && !d.dropped;\n"
        assert s.count(head) == 1 and s.count("    const chip = (c, i) => {\n") == 1
        s = s.replace(head, "    let d = this.drag;\n    let dragging = false;\n")
        s = s.replace("    const chip = (c, i) => {\n", "    d = { id: tabs[%d].id, from: %d, to: %d, moved: true, dropped: false, away: 0, at: now, order: \"\", widths: %s };\n    dragging = true;\n    const chip = (c, i) => {\n" % (F, F, T, W))
    open(f, "w").write(s)
PY
( herdr-app check "$D" --print-spec > "$S/.local/harness/out/$TAG.txt" 2>&1; echo "exit=$?" >> "$S/.local/harness/out/$TAG.txt" ) & pid=$!
i=0; while kill -0 $pid 2>/dev/null && [ $i -lt 60 ]; do sleep 0.5; i=$((i+1)); done
kill -0 $pid 2>/dev/null && { echo "HUNG: killing"; kill $pid; }
tail -3 "$S/.local/harness/out/$TAG.txt" | cut -c1-600
