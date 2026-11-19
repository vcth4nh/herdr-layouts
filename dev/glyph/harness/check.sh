#!/bin/sh
# check.sh ROLE [PANE] [WIDTH] [TAG] [ACTIVE]: copies the look's mod, swaps Herdr's live data
# for the fixed sample, and runs `herdr-app check --print-spec` on that copy.
# Output: .local/harness/out/TAG.txt. ROLE is rail, bar, pane, menu, blank, transfer or goto; for menu, PANE
# is the tab's id. ACTIVE is the project on show (sp9: one showing its empty page; bravo/sp7:
# one with a single tab, and the empty page that stands by behind it).
# Env hooks pretend a state the check can't reach by itself: ROOM, DRAG, ARMED, FOLD, TUCK, PING, HOVER,
# SURE, COPIES, LISTED, PICK, CARRY, FIND, DIRECT, PLATFORM.
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
# COPIES=1: copies under way and one that failed, as the transfer window started them.
# COPIES=direct: one that goes directly from alpha to bravo, and the window's right side on bravo.
fake = fake.replace("__COPIES__", '"direct"' if os.environ.get("COPIES") == "direct" else "true" if os.environ.get("COPIES") else "false")
fake = fake.replace("__THEME__", json.dumps(theme)).replace("__LAYOUT__", json.dumps(lay))
# PLATFORM=linux or windows: the mod as on that system, in a window whose buttons the system
# does not draw.
if os.environ.get("PLATFORM"): fake = "globalThis.__platform = %s;\nglobalThis.__buttons = true;\n" % json.dumps(os.environ["PLATFORM"]) + fake
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
    # TUCK=a,b: pretend those projects are folded (rail.js; by id: sp1, alpha/sp4).
    if os.environ.get("TUCK") and f.endswith("/rail.js"):
        head = 'this.tucked = JSON.parse(localStorage.getItem("tucked") ?? "{}");'
        assert s.count(head) == 1
        s = s.replace(head, "this.tucked = %s;" % json.dumps({k: True for k in os.environ["TUCK"].split(",")}))
    # PING=1: the other machines have answered the rail: alpha in 38 ms, bravo in 270, charlie in
    # 640 and foxtrot in 1400. PING=name:ms,name:x: those answers instead, x for none in time.
    if os.environ.get("PING") and f.endswith("/rail.js"):
        head = "this.pings = {};"
        assert s.count(head) == 1
        said = "alpha:38,bravo:270,charlie:640,foxtrot:1400" if os.environ["PING"] == "1" else os.environ["PING"]
        s = s.replace(head, "this.pings = %s;" % json.dumps({k: [None if v == "x" else int(v)] for k, v in (p.split(":") for p in said.split(","))}))
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
    # FIND=words: the Go-to list with those words typed. SURE=1: a first close press on the picked tab (goto.js).
    if os.environ.get("FIND") and f.endswith("/goto.js"):
        assert s.count('this.filter = "";') == 1
        s = s.replace('this.filter = "";', "this.filter = %s;" % json.dumps(os.environ["FIND"]))
    if os.environ.get("SURE") and f.endswith("/goto.js"):
        assert s.count("this.sure = null;    //") == 1
        s = s.replace("this.sure = null;    //", "this.sure = { id: this.list().sel?.id, at: Date.now() }; //")
    # LISTED=1: the transfer window with its folders and the machines read (the check ends before
    # they answer). PICK=side:name,name: those rows picked. SURE=1: its arrow pressed once.
    # CARRY=x,y: the picked rows held and carried to that point of the window, over the other side.
    # With COPIES: how far the first copy is. DIRECT=1: it has learned that alpha can log in
    # to bravo (for ACTIVE alpha/sp4 with COPIES=direct); DIRECT=typed: and a password is typed (transfer.js).
    if os.environ.get("LISTED") and f.endswith("/transfer.js"):
        head = "    this.load(0, cx);\n    this.load(1, cx);\n"
        names = 'import { copies, listing,'
        assert s.count(head) == 1 and s.count(names) == 1
        seed = "    this.machines = globalThis.__fleet;\n    for (const s of this.sides) Object.assign(s, parse(globalThis.__list(s.on, s.path)), { lenient: false });\n"
        if os.environ.get("PICK"):
            i, picked = os.environ["PICK"].split(":", 1)
            seed += "    for (const n of %s) this.sides[%d].picked.add(n);\n" % (json.dumps(picked.split(",")), int(i))
            if os.environ.get("CARRY"):
                x, y = os.environ["CARRY"].split(",")
                seed += '    this.hold = { side: %d, name: %s, was: true, x: 0, y: 0, kind: "carry", to: null, over: %d, px: %d, py: %d, at: Date.now(), away: 0 };\n' % (int(i), json.dumps(picked.split(",")[0]), 1 - int(i), int(x), int(y))
        if os.environ.get("DIRECT"):
            seed += '    this.routes.set("alpha\\nbravo", { asking: false, at: Date.now(), hops: globalThis.__hops });\n'
            if os.environ["DIRECT"] == "typed": seed += '    this.secret.set_value("sample");\n'
        s = s.replace(head, seed).replace(names, 'import { parse, copies, listing,')
        if os.environ.get("SURE"):
            assert s.count("this.armed = 0;     //") == 1
            s = s.replace("this.armed = 0;     //", "this.armed = Date.now(); //")
        if os.environ.get("COPIES"):
            assert s.count("this.meters = {};   //") == 1
            s = s.replace("this.meters = {};   //", 'this.meters = { t90: { line: "stock-2026-11.parquet 42% 59MB 11.2MB/s 00:07 ETA", pct: 42, speed: "11.2MB/s", eta: "00:07" }, t91: { line: "trace-retry.log 17% 1MB 9.8MB/s 00:01 ETA", pct: 17, speed: "9.8MB/s", eta: "00:01" }, "alpha/t93": { line: "trace-retry.log 17% 1MB 9.8MB/s 00:01 ETA", pct: 17, speed: "9.8MB/s", eta: "00:01" } }; //')
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
