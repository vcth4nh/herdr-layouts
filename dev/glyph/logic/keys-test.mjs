// glyph/keys.json against Herdr's own keys, and the keys the hover words show on each system.
// Run: sh logic/run.sh keys-test.mjs
import { readFileSync } from "node:fs";
import { keyFor } from "./data.mjs";
import { Bar } from "./bar.mjs";
import { byId } from "./kit-stub.mjs";
import { keys } from "./herdr-fake.mjs";

let failed = 0, passed = 0;
const ok = (cond, what) => { if (cond) passed++; else { failed++; console.log("FAIL:", what); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const cx = { notify() {}, stop_propagation() {}, spawn(fn) { return Promise.resolve().then(() => fn(cx)); }, timer: { every() {}, after() {} }, focus_handle: () => ({ focus() {} }) };

// Herdr's default keys, from herdr-app's defaults/keys.macos.json and defaults/keys.json in
// 0.1.16, which on macOS adds cmd-m and the terminal's cmd-a to 0.1.15's. Its terminal section
// beats a layout's while a terminal has the keyboard. In `takes`, the global keys glyph binds
// to its own command that does the same.
const HERDR = {
  macOS: {
    global: "cmd-q cmd-h cmd-alt-h cmd-m cmd-t cmd-w ctrl-tab ctrl-shift-tab cmd-shift-] cmd-shift-[ cmd-alt-] cmd-alt-[ cmd-] cmd-[ cmd-shift-l cmd-n cmd-p cmd-shift-p cmd-, cmd-d cmd-shift-d cmd-shift-w cmd-shift-enter cmd-alt-left cmd-alt-right cmd-alt-up cmd-alt-down cmd-alt-shift-left cmd-alt-shift-right cmd-alt-shift-up cmd-alt-shift-down f2 shift-f2 cmd-/ cmd-shift-/ cmd-b cmd-= cmd-+ cmd-- cmd-0 cmd-1 cmd-2 cmd-3 cmd-4 cmd-5 cmd-6 cmd-7 cmd-8 cmd-9 ctrl-1 ctrl-2 ctrl-3 ctrl-4 ctrl-5 ctrl-6 ctrl-7 ctrl-8 ctrl-9",
    terminal: "cmd-f cmd-a cmd-c cmd-v ctrl-v alt-left alt-right alt-backspace cmd-left cmd-right cmd-backspace",
    takes: { "cmd-t": ["tab.new", "glyph.new"], "cmd-w": ["tab.close", "glyph.close"], "cmd-shift-w": ["pane.close", "glyph.close-pane"], "cmd-p": ["mod.open:picker", "glyph.goto"], f2: ["tab.rename", "glyph.rename"] },
  },
  "Linux and Windows": {
    global: "alt-1 alt-2 alt-3 alt-4 alt-5 alt-6 alt-7 alt-8 alt-9 alt-h alt-j alt-k alt-l alt-left alt-right alt-shift-h alt-shift-j alt-shift-k alt-shift-l ctrl-+ ctrl-- ctrl-0 ctrl-= ctrl-1 ctrl-2 ctrl-3 ctrl-4 ctrl-5 ctrl-6 ctrl-7 ctrl-8 ctrl-9 ctrl-pagedown ctrl-pageup ctrl-tab ctrl-shift-tab alt-] alt-[ ctrl-shift-pagedown ctrl-shift-pageup alt-down alt-up ctrl-? ctrl-shift-/ ctrl-shift-? ctrl-shift-b ctrl-shift-n ctrl-shift-t ctrl-shift-k ctrl-shift-p ctrl-, ctrl-shift-o ctrl-shift-e ctrl-shift-w ctrl-shift-x ctrl-shift-z ctrl-shift-l f2 shift-f2",
    terminal: "ctrl-backspace ctrl-left ctrl-right ctrl-shift-c ctrl-shift-v ctrl-shift-f ctrl-v ctrl-insert shift-insert",
    takes: { "ctrl-shift-t": ["tab.new", "glyph.new"], "ctrl-shift-w": ["tab.close", "glyph.close"], "ctrl-shift-x": ["pane.close", "glyph.close-pane"], "ctrl-shift-k": ["mod.open:picker", "glyph.goto"], f2: ["tab.rename", "glyph.rename"] },
  },
};
const words = (s) => new Set(s.split(" "));

// The file.
const file = JSON.parse(readFileSync(process.env.L + "/keys.json", "utf8"));
eq(Object.keys(file), ["layout:glyph"], "keys.json has the layout's section only");
const own = Object.entries(file["layout:glyph"]);
const mods = (k) => k.split("-").slice(0, -1);
const withCmd = (k) => mods(k).some((m) => ["cmd", "super", "win"].includes(m));
for (const [k, a] of own) {
  ok(/^glyph\.(rename|new(-[a-z0-9_-]+)?|close|close-pane|transfer|goto|history)$/.test(a), `${k}: ${a} is a command the bar waits for`);
  ok(!(mods(k).length === 1 && mods(k)[0] === "ctrl" && /^[a-z[]$/.test(k.split("-").pop())), `${k} is not a plain ctrl+letter, which programs rely on`);
  ok(!(mods(k).includes("ctrl") && mods(k).includes("alt")), `${k} is not ctrl+alt, which is AltGr on Windows`);
  ok(!mods(k).includes("secondary"), `${k} names its system's key: secondary would be ctrl outside macOS`);
}
// On each system, every command has one key of its own. A key with ⌘ is the Mac's, one
// without it is for Linux and Windows, and one with neither modifier (F2) is for both.
const onMac = own.filter(([k]) => withCmd(k) || !mods(k).includes("ctrl")), elsewhere = own.filter(([k]) => !withCmd(k));
const actions = (list) => list.map(([, a]) => a).sort();
eq(actions(elsewhere), actions(onMac), "Linux and Windows have a key for each command macOS has");
eq([...new Set(actions(onMac))], actions(onMac), "macOS binds each command once");
eq([...new Set(actions(elsewhere))], actions(elsewhere), "Linux and Windows bind each command once");
// Every key in the file is bound on every system, so none may be one a terminal keeps.
for (const [sys, h] of Object.entries(HERDR)) {
  const term = words(h.terminal), global = words(h.global);
  for (const [k, a] of own) {
    ok(!term.has(k), `${k} is not a key Herdr's terminal keeps on ${sys}`);
    if (global.has(k)) eq(h.takes[k]?.[1], a, `${k} replaces Herdr's ${h.takes[k]?.[0] ?? "own key"} on ${sys} with the glyph command that does the same`);
  }
}

// The fake app lists the same keys, in Herdr's order: by section, then by key.
const sorted = [...own].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, a]) => [k, a]);
eq(keys().filter((b) => b.section === "layout:glyph").map((b) => [b.keys, b.action]), sorted, "the fake app's layout:glyph keys are keys.json's");

// What the hover words show.
const shown = () => ["glyph.new", "glyph.new-claude", "glyph.new-codex", "glyph.close", "glyph.close-pane", "glyph.transfer", "glyph.goto", "glyph.history", "glyph.rename"].map((n) => keyFor(n));
globalThis.__platform = "macos";
eq(shown(), ["⌘T", "⇧⌘C", "⇧⌘O", "⌘W", "⇧⌘W", "⇧⌘T", "⌘P", "⌘Y", "F2"], "macOS shows the ⌘ keys");
const linux = ["Ctrl+Shift+T", "Ctrl+Shift+A", "Ctrl+Shift+D", "Ctrl+Shift+W", "Ctrl+Shift+X", "Ctrl+Shift+R", "Ctrl+Shift+K", "Ctrl+Shift+H", "F2"];
for (const p of ["linux", "windows"]) {
  globalThis.__platform = p;
  eq(shown(), linux, `${p} shows the keys without ⌘`);
  const root = new Bar(cx).render();
  eq(byId(root, "search").props.tooltip[0], "Go to a tab  Ctrl+Shift+K", `${p}: the search button's words`);
}

// Without the layout's keys, Herdr's own (here those of Linux) are the ones shown.
globalThis.__keys = [{ section: "global", keys: "ctrl-shift-t", action: "tab.new" }, { section: "global", keys: "ctrl-shift-w", action: "tab.close" }];
globalThis.__platform = "linux";
eq([keyFor("glyph.new", "tab.new"), keyFor("glyph.close", "tab.close"), keyFor("glyph.goto")], ["Ctrl+Shift+T", "Ctrl+Shift+W", ""], "Herdr's keys stand in for missing ones");
// Herdr's other spellings: secondary is ⌘ on a Mac and Ctrl elsewhere, super and win are ⌘.
globalThis.__keys = [{ section: "layout:glyph", keys: "secondary-shift-c", action: "glyph.new-claude" }, { section: "layout:glyph", keys: "super-t", action: "glyph.new" }];
eq([keyFor("glyph.new-claude"), keyFor("glyph.new")], ["Ctrl+Shift+C", "Super+T"], "Linux: secondary is Ctrl, and a ⌘ key with no other is shown as Super");
globalThis.__platform = "macos";
eq([keyFor("glyph.new-claude"), keyFor("glyph.new")], ["⇧⌘C", "⌘T"], "macOS: secondary and super are ⌘");
delete globalThis.__keys;

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
