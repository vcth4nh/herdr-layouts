// The rail, the tab menu and the pane header.
// Run with the menu role and a tab: ROLE=menu PANE=alpha/tb8 sh logic/run.sh rail-test.mjs
import { Rail } from "./rail.mjs";
import { PaneHead } from "./pane.mjs";
import { Menu } from "./menu.mjs";
import { byId, walk } from "./kit-stub.mjs";
import { CALLS, ASKS, SHARED, panes, terminals, layout } from "./herdr-fake.mjs";
import { reach, PING } from "./data.mjs";

let failed = 0, passed = 0;
const ok = (cond, what) => { if (cond) passed++; else { failed++; console.log("FAIL:", what); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
const cx = {
  notify() {}, stop_propagation() {}, spawn(fn) { return Promise.resolve().then(() => fn(cx)); },
  timer: { every() {}, after() {} }, focus_handle: () => ({ focus() {} }),
};
const runs = () => CALLS.filter((c) => c[0] === "run").map((c) => [c[1], c[2]]);
const ids = (root) => { const all = []; walk(root, (n) => { if (n.id) all.push(n.id); }); return all; };
// The ids under a node byId() found, and the node that holds the one with that id.
const under = (node) => { const all = []; const go = (n) => { if (n.id) all.push(n.id); for (const c of n.children) if (c?.__node) go(c.__node); }; go(node); return all; };
const holder = (root, id) => { let found = null; walk(root, (n) => { if (n.children.some((c) => c?.__node?.id === id)) found = n; }); return found; };
const text = (node) => { const out = []; const go = (n) => { for (const c of n.children) { if (typeof c === "string") out.push(c); else if (c?.__node) go(c.__node); } }; go(node); return out.join(" "); };

// The rail before and after `hc machine ls` answers.
const rail = new Rail(cx);
let root = rail.render();
eq(ids(root).filter((i) => i.startsWith("machine-") && i !== "machine-add"), ["machine-local", "machine-alpha", "machine-bravo", "machine-foxtrot", "machine-charlie", "machine-delta-2", "machine-echo"], "machines with projects get lines, the rest wait at the end");
ok(Boolean(byId(root, "shelf")), "the shelf is there");
await new Promise((r) => setTimeout(r, 10));
root = rail.render();
const shelf = byId(root, "shelf");
eq(shelf.children.filter((c) => c.__node?.id).map((c) => [c.__node.id, text(c.__node), c.__node.props.tooltip?.[0]]), [
  ["machine-charlie", "charlie", "New project on charlie"],
  ["machine-delta-2", "delta-2", "delta-2 needs a login: run hc machine login delta-2"],
  ["machine-echo", "echo", "echo: unreachable"],
], "shelf pills and their hover words");
byId(root, "machine-charlie").handlers.on_click({}, cx);
byId(root, "machine-delta-2").handlers.on_click({}, cx);
byId(root, "machine-echo").handlers.on_click({}, cx);
eq(runs(), [["space.new", { machine: "charlie" }], ["app.settings", { section: "machines" }], ["app.settings", { section: "machines" }]], "shelf clicks");
ok(!byId(root, "space-new-charlie") && Boolean(byId(root, "space-new-alpha")), "only machines with projects have a + on their line");

// How quick the other machines are to answer. The rail asks each one in reach as soon as it
// knows them: never this computer, nor a machine that needs a login or is out of reach.
const tick = () => new Promise((r) => setTimeout(r, 10));
const asked = () => ASKS.filter((a) => a[0] === "exec" && a[1] === "true").map((a) => a[3].on);
eq(asked(), ["alpha", "bravo", "charlie", "foxtrot"], "the machines in reach are asked, each once");
eq(ASKS.find((a) => a[1] === "true").slice(2), [[], { on: "alpha", timeout: PING.wait }], "what is run there does nothing, and is given up on after PING.wait");
// What is drawn after a machine's name: how many bars are lit and in which color, the time,
// and the hover words.
const MUTED = "#a6adc8", OFF = "#45475a", PEACH = "#fab387";
const lit = (bars) => { const all = bars.__node.children.map((c) => c.__node.props.bg[0]); return [all.length, all.filter((c) => c !== OFF).length, all.find((c) => c !== OFF) ?? null]; };
const sign = (name) => { const n = byId(root, `ping-${name}`); return [...lit(n.children[0]), text(n), n.props.tooltip?.[0] ?? null]; };
const pill = (name) => { const n = byId(root, `machine-${name}`); return [...lit(n.children[1]), n.props.tooltip[0]]; };
const nameRoom = (name) => byId(root, `fold-${name}`).children[2].__node.props.max_w[0];
eq(ids(root).filter((i) => i.startsWith("ping-")), ["ping-alpha", "ping-bravo", "ping-foxtrot"], "every other machine's line has bars, this computer's has none");
eq(sign("alpha"), [4, 0, null, "", null], "before it answers: four bars, none lit, no time and no words");
ok(byId(root, "machine-local") && byId(root, "fold-local").children.length === 3 && nameRoom("local") === 150, "this computer's line is as it was");
rail.probe(cx);
await tick();
eq(asked().length, 4, "a machine that has not answered yet is not asked again");
// What the answers come to: the middle one of the last three.
eq([38, 100, 101, 270, 400, 401, 1000, 1001, 1400].map((ms) => { const r = reach([ms]); return [r.lit, r.text, r.bad]; }),
  [[4, "38ms", false], [4, "100ms", false], [3, "100ms", false], [3, "270ms", false], [3, "400ms", false], [2, "400ms", false], [2, "1.0s", false], [1, "1.0s", true], [1, "1.4s", true]],
  "bars and time: four bars to 100 ms, three to 400, two to a second, then one, in trouble");
eq([reach([]), reach([null]), reach([40, null, 45]), reach([40, null, null]), reach([300, 50]), reach([10, 20, 30, 900, 950])],
  [{ lit: 0, bad: false, text: "" }, { lit: 1, bad: true, text: "" }, { lit: 4, bad: false, text: "45ms" }, { lit: 1, bad: true, text: "" }, { lit: 4, bad: false, text: "50ms" }, { lit: 2, bad: false, text: "900ms" }],
  "one lost or slow answer of three changes nothing, two do; older answers are forgotten");
rail.pings = { alpha: [38], bravo: [270, null, 300], charlie: [640], foxtrot: [null, null, 90], "delta-2": [20] };
root = rail.render();
eq([sign("alpha"), sign("bravo"), sign("foxtrot")], [
  [4, 4, MUTED, "38ms", "alpha answers in 38 ms"],
  [4, 3, MUTED, "300ms", "bravo answers in 300 ms"],
  [4, 1, PEACH, "", "foxtrot is not answering"],
], "a machine's line: its bars, its time, and the words on hover");
// Of the rail's 256px a line takes 86 without its name, 18 more for the bars, and 5 and its
// width for the time: "38ms" is 29px wide, "300ms" 37.
eq([nameRoom("alpha"), nameRoom("bravo"), nameRoom("foxtrot")], [256 - 86 - 18 - 5 - 29, 256 - 86 - 18 - 5 - 37, 150], "the name makes room for the bars and the time");
eq([pill("charlie"), pill("delta-2"), pill("echo")], [
  [4, 2, MUTED, "New project on charlie. It answers in 640 ms"],
  [4, 0, null, "delta-2 needs a login: run hc machine login delta-2"],
  [4, 0, null, "echo: unreachable"],
], "a pill has its bars too: lit for a machine in reach, never for one that is not");
rail.pings.foxtrot = [1400];
root = rail.render();
eq(sign("foxtrot"), [4, 1, PEACH, "1.4s", "foxtrot answers in 1.4 s"], "over a second: one bar and the time, in peach");
// The logos-only rail keeps the bars and leaves the time to the hover words.
layout().children[0].size.px = 160;
root = rail.render();
eq([sign("alpha"), sign("foxtrot")], [[4, 4, MUTED, "", "alpha answers in 38 ms"], [4, 1, PEACH, "", "foxtrot answers in 1.4 s"]], "logos only: bars without the time");
layout().children[0].size.px = 256;
// A machine that goes out of reach loses its bars, and its old answers with them.
const info = rail.machineInfo;
rail.machineInfo = info.map((k) => (k.name === "bravo" ? { ...k, state: "unreachable" } : k));
root = rail.render();
eq(sign("bravo"), [4, 0, null, "", null], "out of reach: no bar lit");
rail.probe(cx);
ok(!("bravo" in rail.pings) && !("delta-2" in rail.pings) && "alpha" in rail.pings, "and what it answered before is forgotten");
rail.machineInfo = info;
// Answers as they come in: each is timed, one that fails counts as none, three are kept,
// and the rail is drawn again only when what it shows has changed.
{
  ASKS.length = 0;
  globalThis.__ping = (on) => on !== "foxtrot";
  let drawn = 0;
  const cx2 = { ...cx, notify() { drawn += 1; }, spawn(fn) { return Promise.resolve().then(() => fn(cx2)); } };
  const r2 = new Rail(cx2);
  await tick();
  eq([asked(), r2.pings.foxtrot, r2.pings.alpha.length, r2.pings.alpha[0] < 50, r2.asking], [["alpha", "bravo", "charlie", "foxtrot"], [null], 1, true, {}], "each answer is timed, and no answer is kept as none");
  for (let i = 0; i < 4; i += 1) { r2.probe(cx2); await tick(); }
  eq([asked().length, r2.pings.alpha.length, r2.pings.foxtrot], [20, 3, [null, null, null]], "asked again each time, the last three answers kept");
  // With the clock stopped every answer takes 0 ms.
  const clock = Date.now;
  Date.now = () => 5000;
  r2.pings = {};
  r2.probe(cx2);
  await tick();
  const first = drawn;
  for (let i = 0; i < 2; i += 1) { r2.probe(cx2); await tick(); }
  eq([drawn, reach(r2.pings.alpha), reach(r2.pings.foxtrot)], [first, { lit: 4, bad: false, text: "0ms" }, { lit: 1, bad: true, text: "" }], "the same answers again draw nothing");
  globalThis.__ping = (on) => on === "foxtrot";
  r2.probe(cx2);
  await tick();
  eq(drawn, first, "one answer that differs draws nothing");
  r2.probe(cx2);
  await tick();
  eq([drawn, reach(r2.pings.alpha).bad, reach(r2.pings.foxtrot).text], [first + 4, true, "0ms"], "a second one does: each machine that changed draws the rail again");
  Date.now = clock;
  // Only being checked (`herdr-app check`), the rail asks no machine anything.
  ASKS.length = 0;
  globalThis.__checking = true;
  new Rail(cx2);
  await tick();
  eq(asked(), [], "under herdr-app check no machine is asked");
  delete globalThis.__checking;
  delete globalThis.__ping;
}
rail.pings = {};
root = rail.render();

// A tab row's right-click opens this mod's menu.
CALLS.length = 0;
byId(root, "tab-alpha/tb8").handlers["on_mouse_down:right"]({}, cx);
eq(CALLS, [["openOverlay", { mod: "glyph", kind: "popup", width: 200, props: { role: "menu", tab: "alpha/tb8" } }]], "row menu");

// Sub-agents: what a tab's agent started with `hc run` is a smaller row under the tab's,
// each after the one that started it. One that has ended gets no row.
const lines = () => under(byId(root, "row-sp3")).filter((i) => /^(tab|sub)-/.test(i));
eq(lines(), ["tab-tb6", "sub-t6-1", "sub-t6-1-1", "sub-t6-2"], "a tab's sub-agents follow it, a nested one after its parent");
eq(["t6-1", "t6-1-1", "t6-2"].map((a) => [text(byId(root, `sub-${a}`)), byId(root, `sub-${a}`).props.tooltip[0]]), [
  ["lint-pass", "lint-pass, Lint the zshrc, working"],
  ["fixtures", "fixtures"],
  ["Port the aliases", "Port the aliases, needs you"],
], "a sub-agent goes by its name, else by its title; hovering says the rest");
ok(holder(root, "sub-t6-1-1").props.pl[0] > holder(root, "sub-t6-1").props.pl[0], "a nested one is set further in");
ok(byId(root, "tab-tb6").props.tooltip[0].endsWith("needs you, 3 sub-agents"), "the tab still counts them and takes their most urgent state");
CALLS.length = 0;
byId(root, "sub-t6-2").handlers.on_click({}, cx);
eq(runs(), [["terminal.peek", { terminal: "t6-2" }]], "a click peeks at a sub-agent");
// Given a pane (terminal.keep) it shows as that pane, so its row goes; what it started is
// listed under the tab that holds the pane, the same tab or another.
const keep = (tab) => panes().push({ pane: "p-kept", terminal: "t6-1", tab, title: "", cwd: "/Users/me", branch: null, status: "working", app: "codex", program: terminals().find((x) => x.address === "t6-1").program, focused: false, zoomed: false });
const subsOf = (row) => under(byId(root, row)).filter((i) => i.startsWith("sub-"));
keep("tb6");
root = rail.render();
eq([subsOf("row-sp3"), byId(root, "tab-tb6").props.tooltip[0].endsWith("2 sub-agents")], [["sub-t6-2", "sub-t6-1-1"], true], "kept in its tab: no row for it, the rest listed once");
panes().pop();
keep("tb1");
root = rail.render();
eq([subsOf("row-sp3"), subsOf("row-sp1"), ids(root).filter((i) => i === "sub-t6-1-1").length], [["sub-t6-2"], ["sub-t6-1-1"], 1], "kept as another tab: what it started is listed there, once");
panes().pop();
// The logos-only rail has no rows, so none for sub-agents: the dot on the orb stands for them.
layout().children[0].size.px = 160;
root = rail.render();
ok(Boolean(byId(root, "tab-tb6")) && !ids(root).some((i) => i.startsWith("sub-")), "logos only: no sub-agent rows");
layout().children[0].size.px = 256;
root = rail.render();

// The menu (props().tab is set by the runner's PANE).
CALLS.length = 0;
const menu = new Menu(cx);
let m = menu.render();
eq([0, 1, 2].map((i) => text(byId(m, `mi-${i}`))), ["Rename F2", "New tab ⌘T", "Close ⌘W"], "menu rows");
byId(m, "mi-0").handlers.on_click({}, cx);
const o = CALLS.find((c) => c[0] === "openOverlay")?.[1];
eq([o?.mod, o?.props.value, o?.props.hint, o?.props.command], ["prompt", "acme.cpp", 'empty: its agent\'s own title, "Fuzz the config loader"', { name: "tab.rename", args: { id: "alpha/tb8" } }], "menu > Rename");
CALLS.length = 0;
byId(m, "mi-1").handlers.on_click({}, cx);
eq(runs(), [["tab.new", { space: "alpha/sp4" }]], "menu > New tab");
// Close on an agent's tab: the first choice turns the row red, the second asks the bar.
CALLS.length = 0;
byId(m, "mi-2").handlers.on_click({}, cx);
m = menu.render();
eq([runs(), CALLS.length, text(byId(m, "mi-2")), Boolean(byId(m, "mi-2").props.bg)], [[], 0, "Again to close ⌘W", true], "menu > Close once: nothing closes, the menu stays, the row says so");
byId(m, "mi-2").handlers.on_click({}, cx);
eq([runs(), SHARED["glyph.shut"]?.id], [[["glyph.shut", undefined]], "alpha/tb8"], "menu > Close again: the bar is asked to close that tab");
// By keyboard, and moving off Close takes the first choice back.
CALLS.length = 0; delete SHARED["glyph.shut"];
const menu2 = new Menu(cx);
m = menu2.render();
const key = byId(m, "menu").handlers.on_key_down;
key({ key: "down" }, cx); key({ key: "down" }, cx); key({ key: "enter" }, cx);
eq([runs(), menu2.sure], [[], true], "Enter on Close: armed");
key({ key: "up" }, cx);
eq(menu2.sure, false, "moving off Close disarms it");
key({ key: "down" }, cx); key({ key: "enter" }, cx); key({ key: "enter" }, cx);
eq([runs(), SHARED["glyph.shut"]?.id], [[["glyph.shut", undefined]], "alpha/tb8"], "Enter twice on Close closes");

// Folding a machine: its projects go, a strip of its tabs' states takes the line's rule,
// and it stays folded for the next rail.
CALLS.length = 0;
root = rail.render();
ok(Boolean(byId(root, "row-alpha/sp4")) && !byId(root, "tally-alpha"), "open: alpha's projects show, no strip");
eq(byId(root, "fold-alpha").props.tooltip[0], "Hide alpha's 2 projects, 12 tabs", "the line says what a click hides");
byId(root, "fold-alpha").handlers.on_click({}, cx);
root = rail.render();
ok(!byId(root, "row-alpha/sp4") && !byId(root, "row-alpha/sp5") && Boolean(byId(root, "row-bravo/sp6")), "folded: alpha's projects are gone, the others stay");
eq([byId(root, "tally-alpha")?.props.tooltip[0], byId(root, "tally-alpha")?.children.length], ["1 finished, 2 working, 8 idle", 3], "folded: its tabs by state");
ok(Boolean(byId(root, "space-new-alpha")), "folded: its + stays");
eq(store.folded, JSON.stringify({ alpha: true }), "kept");
const again = new Rail(cx).render();
ok(!byId(again, "row-alpha/sp4"), "a new rail starts with it folded");
byId(root, "fold-alpha").handlers.on_click({}, cx);
root = rail.render();
ok(Boolean(byId(root, "row-alpha/sp4")) && store.folded === "{}", "a second click brings them back");
eq(runs(), [], "folding runs no command");

// The pane header. Each header is a copy of its own, with its pane in props.
const head = (pane) => {
  const h = new PaneHead(cx);
  const draw = () => { globalThis.__props = { pane }; return h.render(); };
  byId(draw(), `head-${pane}`).handlers.on_hover(true, cx);
  return { h, draw };
};
{
  // alpha/tb8 is a lone Codex pane, p8.
  const { draw } = head("p8");
  let r = draw();
  ok(!byId(r, "zoom-p8") && Boolean(byId(r, "right-p8")) && Boolean(byId(r, "close-p8")), "a lone pane: split and close, no zoom");
  eq(byId(r, "close-p8").props.tooltip[0], "Close tab", "its close closes the tab");
  CALLS.length = 0; delete SHARED["glyph.shut"];
  byId(r, "close-p8").handlers.on_click({}, cx);
  r = draw();
  eq([runs(), Boolean(byId(r, "close-p8").props.bg), byId(r, "close-p8").props.tooltip[0]], [[], true, "Again to close"], "agent pane: first click turns the x red");
  byId(r, "close-p8").handlers.on_click({}, cx);
  eq([runs(), SHARED["glyph.shut"]?.id], [[["glyph.shut", undefined]], "alpha/tb8"], "second click: the bar closes its tab");
  // A second pane in the tab: zoom is back, and close is for the pane.
  const shellP = panes().find((p) => p.program?.shell).program;
  panes().push({ pane: "p-split", terminal: "t-split", tab: "alpha/tb8", title: "", cwd: "/home/me", branch: null, status: null, app: null, program: shellP, focused: false, zoomed: false });
  r = draw();
  ok(Boolean(byId(r, "zoom-p8")), "two panes: zoom shows");
  eq(byId(r, "close-p8").props.tooltip[0], "Close pane", "two panes: close is for the pane, and the second click left nothing armed");
  const other = head("p-split");
  r = other.draw();
  CALLS.length = 0;
  byId(r, "close-p-split").handlers.on_click({}, cx);
  eq(runs(), [["pane.close", { pane: "p-split" }]], "a shell pane in a split closes at once, alone");
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
