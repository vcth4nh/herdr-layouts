#!/bin/sh
# run.sh TEST.mjs: copies the look's mod next to stub modules and runs a node test on it.
export S=$(cd "$(dirname "$0")/.." && pwd)
export L=$(cd "$S/../../glyph" && pwd)
D=$S/.local/logic/run
rm -rf "$D"; mkdir -p "$D"
python3 -I - "$D" <<'PY'
import json, sys, glob, os
d = sys.argv[1]
S, L = os.environ["S"], os.environ["L"]
t = json.load(open(L + "/themes/glyph.json"))
theme = {**t["colors"], "cursor": t["cursor"], **{f"ansi{i}": c for i, c in enumerate(t["ansi"])}}
lay = json.load(open(L + "/layouts/glyph.json"))
fake = open(S + "/harness/herdr-fake.js").read().replace("__ROLE__", os.environ.get("ROLE", "bar")).replace("__PANE__", os.environ.get("PANE", "p3")).replace("__ACTIVE__", os.environ.get("ACTIVE", "alpha/sp4"))
fake = fake.replace("__THEME__", json.dumps(theme)).replace("__LAYOUT__", json.dumps(lay)).replace("__COPIES__", "false")
open(d + "/herdr-fake.mjs", "w").write(fake)
open(d + "/kit-stub.mjs", "w").write(open(S + "/logic/kit-stub.mjs").read())
for f in glob.glob(L + "/mods/glyph/*.js"):
    s = open(f).read()
    s = s.replace('from "herdr"', 'from "./herdr-fake.mjs"').replace('from "gpui-kit"', 'from "./kit-stub.mjs"').replace('from "gpui-base"', 'from "./kit-stub.mjs"')
    for name in ("data", "ui", "copy", "rail", "bar", "pane", "menu", "blank", "transfer", "goto", "wants", "history"):
        s = s.replace('from "./%s.js"' % name, 'from "./%s.mjs"' % name)
    open(d + "/" + os.path.basename(f).replace(".js", ".mjs"), "w").write(s)
PY
cp "$S/logic/$1" "$D/test.mjs"
cd "$D" && node test.mjs
