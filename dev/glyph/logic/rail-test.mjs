// The rail, the tab menu and the pane header.
// Run with the menu role and a tab: ROLE=menu PANE=alpha/tb8 sh logic/run.sh rail-test.mjs
import { Rail } from "./rail.mjs";
import { PaneHead } from "./pane.mjs";
import { Menu } from "./menu.mjs";
import { byId, walk } from "./kit-stub.mjs";
import { CALLS, ASKS, SHARED, panes, terminals, layout, spaces } from "./herdr-fake.mjs";
import { reach, PING, model, tilde, way } from "./data.mjs";

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
const asked = () => ASKS.filter((a) => a[0] === "exec" && a[1] === PING.run).map((a) => a[3].on);
eq(asked(), ["alpha", "bravo", "charlie", "foxtrot"], "the machines in reach are asked, each once");
eq([PING.run, ASKS.find((a) => a[1] === PING.run).slice(2)], ["whoami", [[], { on: "alpha", timeout: PING.wait }]], "what is run there is a program every system has, with nothing asked of it, and is given up on after PING.wait");
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

// Folding a project, by the chevron beside its tile or by the tile: its tabs' rows go,
// sub-agents' too, and a strip of their states takes their place under its name. Its tile
// and name stay, and it stays folded for the next rail.
{
  const tuck = (id) => byId(root, `tuck-${id}`);
  const chevron = (id) => tuck(id).children[0].__node.arg.split("/").pop();
  const rowsOf = (id) => under(byId(root, `row-${id}`)).filter((i) => /^(tab|sub)-/.test(i));
  CALLS.length = 0;
  eq([rowsOf("alpha/sp4").length, Boolean(byId(root, "tally-alpha/sp4"))], [9, false], "open: the project's tabs show, no strip");
  eq([tuck("alpha/sp4").props.tooltip[0], chevron("alpha/sp4")], ["Hide 9 tabs", "chevron-down.svg"], "the chevron says what a click hides");
  // The chevron is under its machine's, and a press counts out to the rail's edge.
  const lineChevron = byId(root, "fold-alpha").children[0].__node.props;
  eq([holder(root, "fold-alpha").props.pl[0] + lineChevron.ml[0], tuck("alpha/sp4").props.left[0] + tuck("alpha/sp4").props.pl[0], tuck("alpha/sp4").props.left[0]], [2, 2, 0], "a project's chevron is in line with its machine's");
  eq(lineChevron.ml[0] + lineChevron.size[0] + lineChevron.mr[0] + holder(root, "fold-alpha").props.pl[0], 13, "and the machine's icon is still in line with the tiles");
  tuck("alpha/sp4").handlers.on_click({}, cx);
  root = rail.render();
  eq([rowsOf("alpha/sp4"), rowsOf("alpha/sp5").length], [[], 3], "folded: its tabs are gone, the next project's stay");
  eq([byId(root, "tally-alpha/sp4")?.props.tooltip[0], byId(root, "tally-alpha/sp4")?.children.length, byId(root, "tally-alpha/sp4")?.props.h[0]], ["1 finished, 2 working, 6 idle", 3, 16], "folded: its tabs by state, in the room the tile leaves under the name");
  eq([tuck("alpha/sp4").props.tooltip[0], chevron("alpha/sp4")], ["Show 9 tabs", "chevron-right.svg"], "the chevron says what a click brings back");
  ok(Boolean(byId(root, "space-alpha/sp4")) && Boolean(byId(root, "name-alpha/sp4")), "folded: its tile and name stay");
  eq(store.tucked, JSON.stringify({ "alpha/sp4": true }), "kept");
  // The tile folds too, and says so after the project's name. The name shows the project.
  const square = (id) => byId(root, `space-${id}`);
  eq([square("alpha/sp4").props.tooltip[0], square("alpha/sp5").props.tooltip[0]], ["acme-shop-backend, order-queue. Show 9 tabs", "acme.cpp-codex-rework. Hide 3 tabs"], "the tile says which project it is and what a click does");
  square("alpha/sp4").handlers.on_click({}, cx);
  root = rail.render();
  eq([rowsOf("alpha/sp4").length, chevron("alpha/sp4"), store.tucked], [9, "chevron-down.svg", "{}"], "a click on the tile of a folded project brings its tabs back");
  square("alpha/sp4").handlers.on_click({}, cx);
  root = rail.render();
  eq([rowsOf("alpha/sp4"), chevron("alpha/sp4"), store.tucked], [[], "chevron-right.svg", JSON.stringify({ "alpha/sp4": true })], "and a second one folds them away again");
  eq(runs(), [], "a click on the tile runs no command");
  // Folded, the whole block beside the tile shows the project: the name and the strip are
  // in it, and neither has a click of its own, so one click is one command.
  const body = (id) => byId(root, `body-${id}`);
  eq([under(body("alpha/sp4")), Object.keys(byId(root, "name-alpha/sp4").handlers), Object.keys(byId(root, "tally-alpha/sp4").handlers)], [["body-alpha/sp4", "name-alpha/sp4", "tally-alpha/sp4"], [], []], "folded: the name and the strip are one block");
  body("alpha/sp4").handlers.on_click({}, cx);
  eq(runs(), [["space.select", { id: "alpha/sp4" }]], "a click anywhere on that block shows the project");
  CALLS.length = 0;
  body("alpha/sp4").handlers["on_mouse_down:right"]({}, cx);
  eq(CALLS.map((c) => [c[0], c[1].mod, c[1].props]), [["openOverlay", "menu", { tab: "space", target: { id: "alpha/sp4" } }]], "and a right-click on it opens the project's menu");
  // Open, the name shows the project as before, and the tabs' rows keep their own clicks.
  CALLS.length = 0;
  ok(!body("alpha/sp5"), "open: no such block");
  byId(root, "name-alpha/sp5").handlers.on_click({}, cx);
  eq(runs(), [["space.select", { id: "alpha/sp5" }]], "open: the name shows the project");
  CALLS.length = 0;
  square("alpha/sp4").handlers["on_mouse_down:right"]({}, cx);
  eq(CALLS.map((c) => [c[0], c[1].mod, c[1].props]), [["openOverlay", "menu", { tab: "space", target: { id: "alpha/sp4" } }]], "a right-click on the tile still opens the project's menu");
  CALLS.length = 0;
  ok(!byId(new Rail(cx).render(), "tab-alpha/tb8"), "a new rail starts with it folded");
  // Sub-agents' rows go with their tab's. The strip takes the tab's state, which is its
  // sub-agents' most urgent one.
  tuck("sp3").handlers.on_click({}, cx);
  root = rail.render();
  eq([rowsOf("sp3"), byId(root, "tally-sp3").props.tooltip[0]], [[], "1 needs you"], "a folded project hides its sub-agents' rows, and still says one needs you");
  // The logos-only rail: the strip stands beside the tile, where the logos were.
  layout().children[0].size.px = 160;
  root = rail.render();
  eq([rowsOf("alpha/sp4"), under(body("alpha/sp4")), body("alpha/sp4").props.h[0], rowsOf("alpha/sp5").length, Boolean(tuck("alpha/sp5"))], [[], ["body-alpha/sp4", "tally-alpha/sp4"], 36, 3, true], "logos only: a folded project shows the strip for its logos, and every project has its chevron");
  CALLS.length = 0;
  body("alpha/sp4").handlers.on_click({}, cx);
  eq(runs(), [["space.select", { id: "alpha/sp4" }]], "logos only: a click on the strip of a folded project shows it");
  CALLS.length = 0;
  layout().children[0].size.px = 256;
  // A folded machine hides its projects, folded or not, and leaves their folds alone.
  byId(root, "fold-alpha").handlers.on_click({}, cx);
  root = rail.render();
  eq([Boolean(byId(root, "row-alpha/sp4")), byId(root, "tally-alpha")?.props.tooltip[0], store.tucked], [false, "1 finished, 2 working, 8 idle", JSON.stringify({ "alpha/sp4": true, sp3: true })], "a folded machine counts the tabs of a folded project too");
  byId(root, "fold-alpha").handlers.on_click({}, cx);
  root = rail.render();
  ok(Boolean(byId(root, "tally-alpha/sp4")), "unfolded, the machine shows its project folded as it was");
  // Tabs without a state (plain programs): a hairline, as on a folded machine's line.
  const sp2 = spaces().find((x) => x.id === "sp2"), agentTab = sp2.tabs.shift();
  tuck("sp2").handlers.on_click({}, cx);
  root = rail.render();
  eq([rowsOf("sp2"), Boolean(byId(root, "tally-sp2")), tuck("sp2").props.tooltip[0]], [[], false, "Show 2 tabs"], "folded with no state to show: no strip");
  sp2.tabs.unshift(agentTab);
  // A project with no tab left (its empty page) has nothing to fold: no chevron, no strip.
  const kept = sp2.tabs.splice(0);
  root = rail.render();
  ok(!tuck("sp2") && !byId(root, "tally-sp2") && Boolean(byId(root, "space-sp2")), "a project without tabs has no chevron, folded or not");
  CALLS.length = 0;
  byId(root, "space-sp2").handlers.on_click({}, cx);
  eq([runs(), byId(root, "space-sp2").props.tooltip[0]], [[["space.select", { id: "sp2" }]], "inventory-and-order-reports, main"], "its tile shows the project, and says only which one it is");
  CALLS.length = 0;
  sp2.tabs.push(...kept);
  root = rail.render();
  eq(byId(root, "tally-sp2")?.props.tooltip[0], "1 needs you", "and is folded as it was once it has tabs again");
  // The fold of a project that has closed is forgotten at the next fold, but not while a
  // machine is out of reach (echo, in the sample fleet): its projects are only missing.
  rail.tucked["echo/sp0"] = true;
  tuck("sp2").handlers.on_click({}, cx);
  eq(store.tucked, JSON.stringify({ "alpha/sp4": true, sp3: true, "echo/sp0": true }), "a second click brings the tabs back; a missing project's fold is kept while a machine is out of reach");
  globalThis.__ready = true;
  root = rail.render();
  tuck("sp3").handlers.on_click({}, cx);
  eq(store.tucked, JSON.stringify({ "alpha/sp4": true }), "with every machine in reach, a fold forgets the projects that are gone");
  delete globalThis.__ready;
  root = rail.render();
  tuck("alpha/sp4").handlers.on_click({}, cx);
  root = rail.render();
  eq([rowsOf("alpha/sp4").length, store.tucked], [9, "{}"], "all open again");
  eq(runs(), [], "folding a project runs no command");
}

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

// Folders on a Windows machine: written with "\\", home at C:\Users\<name>.
{
  eq(["/Users/me/dev", "/home/me", "/root/x", "C:\\Users\\me\\dev", "c:/Users/me", "D:\\work"].map(tilde), ["~/dev", "~", "~/x", "~\\dev", "~", "D:\\work"], "home is ~ on every system");
  eq([way("C:\\Users\\me\\dev\\api"), way("D:\\work\\api"), way("\\\\box\\share\\x").parts, way("C:\\").parts],
    [{ parts: ["~", "dev", "api"], slash: "\\" }, { parts: ["D:", "work", "api"], slash: "\\" }, ["box", "share", "x"], ["C:"]], "a Windows path is cut at its own slash");
  eq([way("/srv/a\\b/c"), way("/").parts, way(null).parts], [{ parts: ["srv", "a\\b", "c"], slash: "/" }, [], []], "any other only at /: a backslash there is part of a name");
  // tb4 is a plain shell in inventory-and-order-reports that goes by its folder, "notes".
  const pane = panes().find((x) => x.tab === "tb4"), was = pane.cwd;
  const label = () => model().flat.find((c) => c.id === "tb4").label;
  const before = label();
  pane.cwd = "C:\\Users\\me\\dev\\inventory-and-order-reports\\notes";
  eq([before, label()], ["notes", "notes"], "a tab that goes by its folder goes by the folder's name there too, not by the whole path");
  const { draw } = head(pane.pane);
  const where = () => { const n = byId(draw(), `cwd-${pane.pane}`); return n ? [text(n), n.props.tooltip[0]] : null; };
  eq(where(), ["notes", "~\\dev\\inventory-and-order-reports\\notes"], "the pane header shows the way down inside the project, and the whole way on hover");
  pane.cwd = "C:\\Users\\me\\dev\\inventory-and-order-reports\\docs\\api";
  eq(where()?.[0], "docs\\api", "deeper down, with the machine's own slash");
  pane.cwd = "C:\\Users\\me\\dev\\inventory-and-order-reports";
  eq(where(), null, "and nothing at the project's own folder");
  pane.cwd = "D:\\scratch";
  eq(where()?.[0], "scratch", "outside the project, the folder's name");
  pane.cwd = was;
}

// The face for letters that act as pictures: the Mac's own there, and the one glyph brings
// on Linux and Windows. Herdr can't say which system it is while the mod loads, so the mod
// asks before every draw (face(), which main.js calls), and DISPLAY is read as it is then.
{
  const ui = await import("./ui.mjs");
  const on = (system) => { if (system) globalThis.__platform = system; else delete globalThis.__platform; ui.face(); return ui.DISPLAY; };
  eq([ui.DISPLAY, on("linux"), on("windows"), on(null)], ["Avenir Next", "Nunito Sans", "Nunito Sans", "Avenir Next"], "Avenir Next until Herdr says and on a Mac, Nunito Sans on Linux and Windows");
  const linux = { DISPLAY: on("linux") };
  on(null);
  // main.js asks before it draws a part, so the part's first draw has the right face.
  const { default: Glyph } = await import("./main.mjs");
  globalThis.__platform = "linux";
  globalThis.__props = { role: "blank" };
  const whole = new Glyph();
  whole.init({}, cx);
  whole.render(cx);
  const first = ui.DISPLAY;
  on(null);
  eq(first, "Nunito Sans", "the mod's first draw on Linux names Nunito Sans");
  // The files in the mod's fonts/ folder are that family, in the two weights the mod asks for.
  const { readFileSync, existsSync } = await import("node:fs");
  const dir = `${process.env.L}/mods/glyph/fonts`;
  const face = (file) => {
    const d = readFileSync(`${dir}/${file}`), tables = {};
    for (let i = 0; i < d.readUInt16BE(4); i++) tables[d.toString("latin1", 12 + 16 * i, 16 + 16 * i)] = d.readUInt32BE(20 + 16 * i);
    const at = tables.name, strings = at + d.readUInt16BE(at + 4), names = {};
    for (let i = 0; i < d.readUInt16BE(at + 2); i++) {
      const r = at + 6 + 12 * i;
      if (d.readUInt16BE(r) !== 3) continue;
      const raw = d.subarray(strings + d.readUInt16BE(r + 10), strings + d.readUInt16BE(r + 10) + d.readUInt16BE(r + 8));
      names[d.readUInt16BE(r + 6)] = Buffer.from(raw).swap16().toString("utf16le");
    }
    // The family a font goes by: its typographic one (16) when it has one, else its plain one (1).
    return [names[16] ?? names[1], d.readUInt16BE(tables["OS/2"] + 4)];
  };
  eq([face("NunitoSans-SemiBold.ttf"), face("NunitoSans-Bold.ttf")], [[linux.DISPLAY, 600], [linux.DISPLAY, 700]], "the fonts glyph brings are that family, semibold and bold");
  ok(existsSync(`${dir}/OFL.txt`) && /SIL Open Font License/.test(readFileSync(`${dir}/OFL.txt`, "utf8")), "and their license is beside them");
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
