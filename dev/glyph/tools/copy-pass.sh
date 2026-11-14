#!/bin/sh
# copy-pass.sh A B: runs the mod's own copy.js against two real machines (names from
# `hc machine ls`). It puts the mod beside a "herdr" module whose hc and exec are the real
# ones, then runs copy-pass.mjs, which says what it copies and where. Nothing shows in the
# Herdr window. Needs the Bash sandbox off (hc).
# direct-pass.sh runs its own script the same way, by naming it in PASS.
S=$(cd "$(dirname "$0")/.." && pwd)
L=$(cd "$S/../../glyph" && pwd)
PASS=${PASS:-copy-pass}
D=$S/.local/$PASS
rm -rf "$D"; mkdir -p "$D"
cp "$S/logic/kit-stub.mjs" "$D/kit-stub.mjs"
cp "$S/tools/$PASS.mjs" "$D/$PASS.mjs"
for n in ui data copy; do
  sed -e 's|from "herdr"|from "./herdr-real.mjs"|' -e 's|from "gpui-kit"|from "./kit-stub.mjs"|' -e 's|from "gpui-base"|from "./kit-stub.mjs"|' \
    -e 's|from "\./\([a-z]*\)\.js"|from "./\1.mjs"|' "$L/mods/glyph/$n.js" > "$D/$n.mjs"
done
cat > "$D/herdr-real.mjs" <<'JS'
// The few things copy.js and data.js ask of Herdr, done for real: hc is the CLI, and a
// program on another machine runs through `hc exec`, as the app's own exec does.
import { execFile } from "node:child_process";
const sh = (cmd, args) => new Promise((resolve) => execFile(cmd, args, { maxBuffer: 64 << 20 }, (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout, stderr })));
export const hc = (args) => sh("hc", args);
const secs = (options) => (options.timeout ? ["--timeout", String(Math.ceil(options.timeout / 1000))] : []);
export const exec = (command, args = [], options = {}) => (options.on ? sh("hc", ["exec", "--on", options.on, ...secs(options), "--", command, ...args]) : sh(command, args));
const SHARED = {};
export const shared = (k) => SHARED[k];
export const setShared = (k, v) => { SHARED[k] = v; return null; };
// What the mod would have posted as toasts.
export const NOTES = [];
export const notify = (n) => { NOTES.push(n); return "n1"; };
export const openOverlay = () => "ov1", closeOverlay = () => null, run = () => null;
export const spaces = () => [], panes = () => [], terminals = () => [], machines = () => [], keys = () => [];
export const window = () => ({ platform: "macos" });
JS
cd "$D" && node "$PASS.mjs" "$@"
