// The rail, the tab menu and the pane header.
// Run with the menu role and a tab: ROLE=menu PANE=alpha/tb8 sh logic/run.sh rail-test.mjs
import { Rail, share } from "./rail.mjs";
import { PaneHead } from "./pane.mjs";
import { Menu } from "./menu.mjs";
import { byId, walk } from "./kit-stub.mjs";
import { CALLS, ASKS, SHARED, panes, terminals, layout, spaces } from "./herdr-fake.mjs";
import { reach, lineUp, model, jump, PING, tilde, way } from "./data.mjs";

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

// The lines. A line's beads as drawn, left to right: each one's tab, where its bead starts
// and ends, its color, and the node of its column and of the bead itself.
const beads = (key, from = root) => {
  const line = byId(from, `line-${key}`), cut = `bead-${key}-`.length;
  if (!line) return null;
  return line.children.map((c) => c.__node).filter((b) => b.id.startsWith(`bead-${key}-`)).map((b) => {
    const pad = b.props.px[0], pill = b.children[0].__node;
    return { tab: b.id.slice(cut), x: b.props.left[0] + pad, end: b.props.left[0] + b.props.w[0] - pad, color: pill.props.bg[0], node: b, pill };
  }).sort((a, b) => a.x - b.x);
};
const bead = (key, tab, from = root) => beads(key, from).find((b) => b.tab === tab);
const tabsOn = (key, from = root) => beads(key, from).map((b) => b.tab);
const COLOR = { blocked: "#fab387", done: "#a6e3a1", working: "#89b4fa", idle: "#6c7086" };
const HOVER = "#232334", RAISED = "#313244", ACCENT = "#cba6f7";
{
  // The order by itself: those that need you, the finished, the working, the idle. Within
  // a state the tabs keep the order they were given in, the rail's, whatever their times
  // are. A tab without a state has no bead.
  const at = Date.now();
  const T = (id, status, ago) => ({ id, status, changedAt: ago == null ? null : at - ago * 60000, workingSince: status === "working" && ago != null ? at - ago * 60000 : null });
  eq(lineUp([T("a", "idle", 5), T("b", "working", 2), T("c", null, 1), T("d", "blocked", 1), T("e", "done", 9), T("f", "blocked", 30), T("g", "idle", 1), T("h", "working", 40), T("i", "idle", null), T("j", "done", null)]).map((c) => c.id),
    ["d", "f", "e", "j", "b", "h", "a", "g", "i"], "the order of a line: by state, and within a state as the tabs were listed");
  eq(lineUp([T("x", null, 1), T("y", undefined, 1)]), [], "no state, no bead");
  // The room by itself.
  const of = (n, s = "idle") => Array(n).fill(s);
  const fits = (r, span) => r.cells.every((c, i) => c.w >= 1 && (i === 0 ? c.x === 0 : c.x === r.cells[i - 1].x + r.cells[i - 1].w + r.gap)) && r.cells[r.cells.length - 1].x + r.cells[r.cells.length - 1].w === span;
  let r = share(of(18), 230);
  eq([r.gap, r.cells[0], fits(r, 230), [...new Set(r.cells.map((c) => c.w))].sort()], [2, { x: 0, w: 11 }, true, [10, 11]], "eighteen beads share 230px: 2px apart, 11px or 10px each, from end to end");
  r = share(["working"], 230);
  eq([r.gap, r.cells], [0, [{ x: 0, w: 230 }]], "one bead is the whole line");
  r = share(of(40), 134);
  eq([r.gap, fits(r, 134)], [1, true], "a crowd: under 4px each, the beads are 1px apart");
  r = share(of(90), 134);
  eq([r.gap, fits(r, 134)], [0, true], "a bigger crowd: under 2px each, the beads touch");
  r = share(["blocked", "done", ...of(28)], 134);
  eq([r.gap, r.cells[0].w, r.cells[1].w, fits(r, 134), r.slim > 3 && r.slim < 4], [1, 8, 8, true, true], "one that needs you and one that finished keep 8px, and the others share the rest");
  r = share([...of(20, "blocked"), ...of(20)], 134);
  eq([r.cells.every((c) => c.w === 2 || c.w === 3), fits(r, 134)], [true, true], "unless that would leave the others under 2px: then all are one width");
  eq(share([], 100).cells, [], "no bead, no room taken");
}
{
  // On the rail: the sample fleet has 18 tabs with a state. The project on show is
  // alpha/sp4, on its tab alpha/tb9. Within a state the beads stand as the tabs' rows do
  // in the rail, top to bottom: this computer's, then alpha's, bravo's and foxtrot's.
  const ORDER = ["tb3", "tb6", "alpha/tb10", "tb2", "alpha/tb8", "alpha/tb9",
    "tb1", "alpha/tb7", "alpha/tb11", "alpha/tb12", "alpha/tb13", "alpha/tb14", "alpha/tb15", "alpha/tb16", "alpha/tb18", "bravo/tb19", "bravo/tb20", "foxtrot/tb21"];
  eq(tabsOn("fleet"), ORDER, "the line on top: every tab that has a state, by state and then in the rail's order");
  eq(ORDER.slice(6), ids(root).filter((i) => i.startsWith("tab-")).map((i) => i.slice(4)).filter((id) => ORDER.indexOf(id) >= 6), "the idle beads are in the order of their rows");
  const all = beads("fleet");
  eq(all.map((b) => b.color), ["blocked", "blocked", "done", "working", "working", "working", ...Array(12).fill("idle")].map((s) => COLOR[s]), "each bead is in its state's color");
  eq([all[0].x, all[17].end, all.every((b, i) => i === 0 || b.x === all[i - 1].end + 2), byId(root, "line-fleet").props.h[0]], [0, 230, true, 22], "the beads fill the rail between its 13px margins, 2px apart");
  eq([all[0].node.props.top[0], all[0].node.props.h[0], all[0].node.props.left[0], all[1].node.props.left[0] - (all[0].node.props.left[0] + all[0].node.props.w[0])], [0, 22, -1, 0], "a bead's column is as tall as the line and meets the next one: no press falls between two");
  ok(!byId(root, "fleet").props.tooltip && !byId(root, "line-fleet").props.tooltip, "the line itself has no hover words");
  eq([all[1].node.props.tooltip[0], all[2].node.props.tooltip[0], all[3].node.props.tooltip[0]], ["Tidy the shell config, Home, needs you, 3 sub-agents", "gateway, acme-shop-backend @ alpha, finished", "Action review of the diff, notes-app, working 3m"], "a bead's hover words are its tab's");
  // The motion of each state: one that needs you breathes, a working one has a glint that
  // runs along it, a finished one is still, and the idle fade as their logos do.
  const glint = (b) => b.pill.children[0]?.__node;
  eq([all[0].pill.props.loop, all[2].pill.props.loop ?? null, all[2].pill.children.length, all[3].pill.props.loop ?? null], [["opacity", { from: 0.5, to: 1, period: 900 }], null, 0, null], "needs you: the bead breathes; finished and working: it does not");
  eq([glint(all[3]).props.loop, glint(all[3]).props.w[0], all[3].end - all[3].x], [["left", { from: 0, to: 7, period: 2600 }], 4, 11], "working: a glint goes to the bead's far end and back");
  eq(all.slice(6).map((b) => b.pill.props.opacity[0]), [0.5, 0.5, 0.75, 0.5, 0.5, 0.75, 0.5, 0.5, 0.75, 0.5, 0.5, 0.5], "idle: as faint as the logo, by how long it has rested, wherever it stands");
  eq([all[0].pill.props.h[0], all[0].pill.all.transition.map((a) => a[0])], [5, ["height"]], "a bead is 5px tall");
  // The tab on show has a mark under its bead.
  const mark = () => byId(root, "here-fleet");
  eq([mark().props.left[0], mark().props.w[0], mark().props.top[0], mark().props.h[0], mark().props.bg[0]], [bead("fleet", "alpha/tb9").x, 11, 16.5, 2, ACCENT], "the tab on show: a mark under its bead, as wide as the bead");
  // The beads are drawn the other way round, so the ones that need you are on top.
  eq(byId(root, "line-fleet").children.map((c) => c.__node.id), [...[...ORDER].reverse().map((id) => `bead-fleet-${id}`), "here-fleet"], "the first in line is drawn last, and the mark after it");

  // A click goes to the bead's tab, a right-click opens its menu, and neither reaches
  // whatever the line is in.
  let stopped = 0, drawn = 0;
  const cxn = { ...cx, notify() { drawn += 1; }, stop_propagation() { stopped += 1; } };
  CALLS.length = 0;
  bead("fleet", "alpha/tb10").node.handlers.on_click({}, cxn);
  eq([runs(), stopped], [[["pane.focus", { pane: "p10" }]], 1], "a click on a bead goes to its tab");
  // The bar's bell and tick step through a state's tabs with jump(), in the order of that
  // state's beads: from the tab on show to the next one, and from the last to the first.
  const steps = (status, from) => {
    const m = model(), was = m.flat.find((c) => c.shown);
    const out = [];
    for (let at = m.flat.find((c) => c.id === from), n = 0; n < 3; n++) {
      for (const c of m.flat) c.shown = c === at;
      CALLS.length = 0;
      jump(m, status);
      const went = Object.fromEntries(runs());
      at = m.flat.find((c) => (went["pane.focus"] ? c.lead?.pane === went["pane.focus"].pane : c.id === went["tab.select"]?.id));
      out.push(at?.id);
    }
    for (const c of m.flat) c.shown = c === was;
    return out;
  };
  const peach = tabsOn("fleet").slice(0, 2), blue = tabsOn("fleet").slice(3, 6);
  eq([steps("blocked", "alpha/tb9"), steps("working", "tb1")], [[peach[0], peach[1], peach[0]], blue], "the bell's steps are the beads that need you from left to right, and so for any state");
  CALLS.length = 0;
  bead("fleet", "tb2").node.handlers["on_mouse_down:right"]({}, cxn);
  eq([CALLS, stopped], [[["openOverlay", { mod: "glyph", kind: "popup", width: 200, props: { role: "menu", tab: "tb2" } }]], 2], "a right-click on a bead opens its tab's menu");
  CALLS.length = 0;

  // The pointer on a bead: the bead rises, and its tab's row is drawn as under the pointer.
  const tall = (tab, key = "fleet") => bead(key, tab).pill.props.h[0];
  const rowBg = (tab) => byId(root, `tab-${tab}`).props.bg?.[0] ?? null;
  bead("fleet", "alpha/tb10").node.handlers.on_hover(true, cxn);
  root = rail.render();
  eq([drawn, rail.point, tall("alpha/tb10"), tall("tb2"), rowBg("alpha/tb10"), rowBg("alpha/tb8")], [1, "alpha/tb10", 9, 5, HOVER, null], "the pointer on a bead: it is 4px taller and its row is lit");
  // On to the next bead: whichever of the two is heard first, the new one is lit.
  bead("fleet", "tb2").node.handlers.on_hover(true, cxn);
  bead("fleet", "alpha/tb10").node.handlers.on_hover(false, cxn);
  root = rail.render();
  eq([drawn, rail.point, tall("alpha/tb10"), tall("tb2"), rowBg("tb2")], [2, "tb2", 5, 9, HOVER], "on to another bead: that one is lit, and leaving the first draws nothing more");
  bead("fleet", "tb2").node.handlers.on_hover(false, cxn);
  root = rail.render();
  eq([drawn, rail.point, tall("tb2"), rowBg("tb2")], [3, null, 5, null], "off the line: nothing is lit");
  // The other way: the pointer on a row lifts its bead, and an idle one is at full strength.
  byId(root, "tab-alpha/tb15").handlers.on_hover(true, cxn);
  root = rail.render();
  eq([drawn, tall("alpha/tb15"), bead("fleet", "alpha/tb15").pill.props.opacity[0], rowBg("alpha/tb15")], [4, 9, 1, HOVER], "the pointer on a row: its bead rises, at full strength");
  byId(root, "tab-alpha/tb15").handlers.on_hover(false, cxn);
  // The row of the tab on show stays raised, whatever the pointer is on.
  bead("fleet", "alpha/tb9").node.handlers.on_hover(true, cxn);
  root = rail.render();
  eq([rowBg("alpha/tb9"), tall("alpha/tb9")], [RAISED, 9], "the shown tab's row stays as it is, and its bead rises");
  bead("fleet", "alpha/tb9").node.handlers.on_hover(false, cxn);
  // A tab that goes while the pointer is on it is never heard to be left.
  rail.point = "tb-gone";
  root = rail.render();
  eq(rail.point, null, "a tab that is gone is no longer pointed at");

  // The first time a line is drawn its beads are simply there. From then on a bead that
  // gets another place slides to it, and so does the mark.
  const moves = (n) => (n.all.transition ?? []).map((a) => [a[0], a[1].duration]);
  const fresh = new Rail(cx);
  let first = fresh.render();
  eq([moves(bead("fleet", "tb2", first).node), moves(byId(first, "here-fleet"))], [[], []], "a line drawn for the first time: nothing slides");
  first = fresh.render();
  eq([moves(bead("fleet", "tb2", first).node), moves(byId(first, "here-fleet"))], [[["left", 420], ["width", 420]], [["left", 420], ["width", 420]]], "drawn again: a bead and the mark slide to wherever they go next");
  // A tab changes state: its bead keeps its name and takes its new place in the line. That
  // place is the rail's: the last one to need you is first among those when its row is.
  const tb1 = spaces().find((x) => x.id === "sp1").tabs.find((c) => c.id === "tb1"), was = { ...tb1 };
  const before = bead("fleet", "tb1").x;
  Object.assign(tb1, { status: "blocked", changed_at: Date.now() });
  root = rail.render();
  eq([tabsOn("fleet").slice(0, 4), bead("fleet", "tb1").color, before, bead("fleet", "tb1").x, moves(bead("fleet", "tb1").node).length], [["tb1", "tb3", "tb6", "alpha/tb10"], COLOR.blocked, 77, 0, 2], "a tab that now needs you: its bead joins those, where its row stands among theirs, and slides there");
  Object.assign(tb1, was);
  root = rail.render();
  eq(tabsOn("fleet"), ORDER, "and back");

  // The line is as wide as it was measured, once it has been. A size is told in the window's
  // pixels, so with Herdr's zoom it is divided. A line whose width changed is drawn at once.
  const sized = (w) => byId(root, "line-fleet").handlers.on_size_change({ width: w, height: 22 }, cxn);
  drawn = 0;
  sized(230.2);
  eq(drawn, 0, "measured as wide as it was drawn: nothing to draw again");
  sized(212);
  root = rail.render();
  eq([drawn, beads("fleet")[17].end, moves(bead("fleet", "tb2").node)], [1, 212, []], "measured narrower: drawn that wide, in place at once");
  root = rail.render();
  eq(moves(bead("fleet", "tb2").node).length, 2, "and sliding again from the next time on");
  // The rail changes its width: until the line is measured again it is the rail less its
  // margins, and what is measured then is for that width.
  layout().children[0].size.px = 300;
  root = rail.render();
  eq(beads("fleet")[17].end, 274, "a rail of another width: what was measured before no longer counts");
  sized(270);
  root = rail.render();
  eq(beads("fleet")[17].end, 270, "measured at that width");
  layout().children[0].size.px = 256;
  root = rail.render();
  eq(beads("fleet")[17].end, 230, "back at 256px: the rail less its margins, until it is measured again");
  // With Herdr's zoom a size is told larger than the mod's own pixels.
  globalThis.__zoom = 1.25;
  sized(250);
  root = rail.render();
  eq(beads("fleet")[17].end, 200, "at zoom 1.25 a line told to be 250 wide is 200 of the mod's pixels");
  delete globalThis.__zoom;
  sized(230);
  root = rail.render();

  // The logos-only rail: the line is narrower, and a bead that wants you keeps 8px. The
  // logos stand for the rows.
  layout().children[0].size.px = 160;
  root = rail.render();
  const slim = beads("fleet");
  eq([slim.length, slim[17].end, slim.slice(0, 3).map((b) => b.end - b.x), slim[3].end - slim[3].x, glint(slim[3]).props.w[0]], [18, 134, [8, 8, 8], 5, 2], "logos only: the line is 134px, the three that want you keep 8px, and a 5px working bead still has its glint");
  byId(root, "tab-alpha/tb10").handlers.on_hover(true, cxn);
  root = rail.render();
  eq([tall("alpha/tb10"), byId(root, "tab-alpha/tb10").props.bg?.[0]], [9, HOVER], "logos only: the pointer on a logo lifts its bead");
  byId(root, "tab-alpha/tb10").handlers.on_hover(false, cxn);
  bead("fleet", "tb2").node.handlers.on_hover(true, cxn);
  root = rail.render();
  eq(byId(root, "tab-tb2").props.bg?.[0], HOVER, "and the pointer on a bead lights its logo");
  bead("fleet", "tb2").node.handlers.on_hover(false, cxn);
  layout().children[0].size.px = 256;
  root = rail.render();
  eq(runs(), [], "pointing runs no command");
}

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

// Folding a machine: its projects go, the line of its tabs takes the place of the rule on
// its own line, and it stays folded for the next rail.
// alpha's eleven tabs that have a state, in a line's order.
const ALPHA = ["alpha/tb10", "alpha/tb8", "alpha/tb9", "alpha/tb7", "alpha/tb11", "alpha/tb12", "alpha/tb13", "alpha/tb14", "alpha/tb15", "alpha/tb16", "alpha/tb18"];
CALLS.length = 0;
root = rail.render();
ok(Boolean(byId(root, "row-alpha/sp4")) && !byId(root, "line-on-alpha"), "open: alpha's projects show, no line of its own");
eq(byId(root, "fold-alpha").props.tooltip[0], "Hide alpha's 2 projects, 12 tabs", "the line says what a click hides");
byId(root, "fold-alpha").handlers.on_click({}, cx);
root = rail.render();
ok(!byId(root, "row-alpha/sp4") && !byId(root, "row-alpha/sp5") && Boolean(byId(root, "row-bravo/sp6")), "folded: alpha's projects are gone, the others stay");
eq([tabsOn("on-alpha"), beads("on-alpha").slice(0, 4).map((b) => b.color), byId(root, "line-on-alpha").props.h[0], bead("on-alpha", "alpha/tb10").pill.props.h[0]],
  [ALPHA, [COLOR.done, COLOR.working, COLOR.working, COLOR.idle], 18, 4], "folded: its tabs as beads, 4px tall, in the order of the line on top");
{
  // Of the rail's 256px the folded line takes 78 without the name and the line of beads, and
  // 18 more for the bars: the beads get what the name ("alpha", about 32px) leaves.
  const all = beads("on-alpha");
  eq([all[0].x, all[10].end, byId(root, "here-on-alpha").props.left[0]], [0, 256 - 78 - 18 - 32, bead("on-alpha", "alpha/tb9").x], "they fill the room after the name and the bars, and the tab on show has its mark");
  // In the logos-only rail that room is 32px: eleven beads of 2px, 1px apart. That is too
  // narrow for a glint, so the working ones breathe.
  layout().children[0].size.px = 160;
  root = rail.render();
  const few = beads("on-alpha");
  eq([few[10].end, few.map((b) => b.end - b.x), few[1].x - few[0].end, few[1].pill.props.loop, few[1].pill.children.length], [32, Array(11).fill(2), 1, ["opacity", { from: 0.6, to: 1, period: 1300 }], 0], "a line too narrow for a glint: its working beads breathe");
  layout().children[0].size.px = 256;
  root = rail.render();
  bead("on-alpha", "alpha/tb14").node.handlers.on_click({}, cx);
  eq(runs(), [["pane.focus", { pane: "p14" }]], "a click on a bead of a folded machine goes to that tab");
  CALLS.length = 0;
  // The same tab is lit on both lines.
  bead("fleet", "alpha/tb14").node.handlers.on_hover(true, cx);
  root = rail.render();
  eq([bead("on-alpha", "alpha/tb14").pill.props.h[0], bead("fleet", "alpha/tb14").pill.props.h[0], bead("on-alpha", "alpha/tb10").pill.props.h[0]], [8, 9, 4], "the pointer on a bead of the line on top lifts the same tab's bead on the folded line");
  bead("fleet", "alpha/tb14").node.handlers.on_hover(false, cx);
  root = rail.render();
}
ok(Boolean(byId(root, "space-new-alpha")), "folded: its + stays");
eq(store.folded, JSON.stringify({ alpha: true }), "kept");
const again = new Rail(cx).render();
ok(!byId(again, "row-alpha/sp4"), "a new rail starts with it folded");
byId(root, "fold-alpha").handlers.on_click({}, cx);
root = rail.render();
ok(Boolean(byId(root, "row-alpha/sp4")) && store.folded === "{}", "a second click brings them back");
eq(runs(), [], "folding runs no command");

// Folding a project, by the chevron beside its tile or by the tile: its tabs' rows go,
// sub-agents' too, and the line of its tabs takes their place under its name. Its tile
// and name stay, and it stays folded for the next rail.
{
  const tuck = (id) => byId(root, `tuck-${id}`);
  const chevron = (id) => tuck(id).children[0].__node.arg.split("/").pop();
  const rowsOf = (id) => under(byId(root, `row-${id}`)).filter((i) => /^(tab|sub)-/.test(i));
  // alpha/sp4's nine tabs, in a line's order.
  const SP4 = ALPHA.filter((id) => id !== "alpha/tb18" && id !== "alpha/tb16");
  CALLS.length = 0;
  eq([rowsOf("alpha/sp4").length, Boolean(byId(root, "line-in-alpha/sp4"))], [9, false], "open: the project's tabs show, no line of its own");
  eq([tuck("alpha/sp4").props.tooltip[0], chevron("alpha/sp4")], ["Hide 9 tabs", "chevron-down.svg"], "the chevron says what a click hides");
  // The chevron is under its machine's, and a press counts out to the rail's edge.
  const lineChevron = byId(root, "fold-alpha").children[0].__node.props;
  eq([holder(root, "fold-alpha").props.pl[0] + lineChevron.ml[0], tuck("alpha/sp4").props.left[0] + tuck("alpha/sp4").props.pl[0], tuck("alpha/sp4").props.left[0]], [2, 2, 0], "a project's chevron is in line with its machine's");
  eq(lineChevron.ml[0] + lineChevron.size[0] + lineChevron.mr[0] + holder(root, "fold-alpha").props.pl[0], 13, "and the machine's icon is still in line with the tiles");
  tuck("alpha/sp4").handlers.on_click({}, cx);
  root = rail.render();
  eq([rowsOf("alpha/sp4"), rowsOf("alpha/sp5").length], [[], 3], "folded: its tabs are gone, the next project's stay");
  eq([tabsOn("in-alpha/sp4"), byId(root, "line-in-alpha/sp4").props.h[0], beads("in-alpha/sp4")[0].x, beads("in-alpha/sp4")[8].end], [SP4, 16, 0, 256 - 66],
    "folded: its tabs as beads, in the room the tile leaves under the name");
  // The mark of the tab on show is 14px at most, in the middle of a bead that is wider.
  const shownBead = bead("in-alpha/sp4", "alpha/tb9"), here = byId(root, "here-in-alpha/sp4").props;
  eq([shownBead.end - shownBead.x, here.w[0], here.left[0] - shownBead.x, here.top[0]], [19, 14, 3, 13], "and the mark of the tab on show, under the middle of its 19px bead");
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
  // Folded, the whole block beside the tile shows the project: the name and the line are
  // in it. The name has no click of its own. A bead has: it goes to its own tab, which
  // shows the project too, and keeps the click from the block, so one click is one command.
  const body = (id) => byId(root, `body-${id}`);
  eq([under(body("alpha/sp4")).filter((i) => !/^(bead|pill)-/.test(i)), Object.keys(byId(root, "name-alpha/sp4").handlers), Object.keys(byId(root, "line-in-alpha/sp4").handlers)],
    [["body-alpha/sp4", "name-alpha/sp4", "line-in-alpha/sp4", "here-in-alpha/sp4"], [], ["on_size_change"]], "folded: the name and the line are one block");
  body("alpha/sp4").handlers.on_click({}, cx);
  eq(runs(), [["space.select", { id: "alpha/sp4" }]], "a click on that block shows the project");
  CALLS.length = 0;
  {
    let stopped = 0;
    bead("in-alpha/sp4", "alpha/tb10").node.handlers.on_click({}, { ...cx, stop_propagation() { stopped += 1; } });
    eq([runs(), stopped], [[["pane.focus", { pane: "p10" }]], 1], "a click on a bead of that line goes to its tab, and the block does not hear it");
    CALLS.length = 0;
    bead("in-alpha/sp4", "alpha/tb10").node.handlers["on_mouse_down:right"]({}, { ...cx, stop_propagation() { stopped += 1; } });
    eq([CALLS.map((c) => [c[0], c[1].props]), stopped], [[["openOverlay", { role: "menu", tab: "alpha/tb10" }]], 2], "and a right-click on it opens the tab's menu, not the project's");
    CALLS.length = 0;
  }
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
  // Sub-agents' rows go with their tab's. The bead takes the tab's state, which is its
  // sub-agents' most urgent one.
  tuck("sp3").handlers.on_click({}, cx);
  root = rail.render();
  eq([rowsOf("sp3"), beads("in-sp3").map((b) => [b.tab, b.color, b.end - b.x])], [[], [["tb6", COLOR.blocked, 190]]], "a folded project hides its sub-agents' rows, and its one bead still says it needs you");
  // The logos-only rail: the line stands beside the tile, where the logos were, and is as
  // tall as the tile, so a press beside the tile lands on a bead.
  layout().children[0].size.px = 160;
  root = rail.render();
  eq([rowsOf("alpha/sp4"), under(body("alpha/sp4")).filter((i) => !/^(bead|pill)-/.test(i)), tabsOn("in-alpha/sp4"), body("alpha/sp4").props.h[0], byId(root, "line-in-alpha/sp4").props.h[0], beads("in-alpha/sp4")[8].end, rowsOf("alpha/sp5").length, Boolean(tuck("alpha/sp5"))],
    [[], ["body-alpha/sp4", "line-in-alpha/sp4", "here-in-alpha/sp4"], SP4, 36, 36, 160 - 62, 3, true], "logos only: a folded project shows its line for its logos, and every project has its chevron");
  CALLS.length = 0;
  body("alpha/sp4").handlers.on_click({}, cx);
  bead("in-alpha/sp4", "alpha/tb8").node.handlers.on_click({}, cx);
  eq(runs(), [["space.select", { id: "alpha/sp4" }], ["pane.focus", { pane: "p8" }]], "logos only: a click beside the line of a folded project shows it, and a click on a bead goes to that tab");
  CALLS.length = 0;
  layout().children[0].size.px = 256;
  // A folded machine hides its projects, folded or not, and leaves their folds alone.
  byId(root, "fold-alpha").handlers.on_click({}, cx);
  root = rail.render();
  eq([Boolean(byId(root, "row-alpha/sp4")), tabsOn("on-alpha"), store.tucked], [false, ALPHA, JSON.stringify({ "alpha/sp4": true, sp3: true })], "a folded machine's line has the tabs of a folded project too");
  byId(root, "fold-alpha").handlers.on_click({}, cx);
  root = rail.render();
  ok(Boolean(byId(root, "line-in-alpha/sp4")), "unfolded, the machine shows its project folded as it was");
  // Tabs without a state (plain programs): a hairline, as on a folded machine's line.
  const sp2 = spaces().find((x) => x.id === "sp2"), agentTab = sp2.tabs.shift();
  tuck("sp2").handlers.on_click({}, cx);
  root = rail.render();
  eq([rowsOf("sp2"), Boolean(byId(root, "line-in-sp2")), under(body("sp2")), tuck("sp2").props.tooltip[0]], [[], false, ["body-sp2", "name-sp2"], "Show 2 tabs"], "folded with no state to show: no line");
  sp2.tabs.unshift(agentTab);
  // A project with no tab left (its empty page) has nothing to fold: no chevron, no line.
  const kept = sp2.tabs.splice(0);
  root = rail.render();
  ok(!tuck("sp2") && !byId(root, "line-in-sp2") && Boolean(byId(root, "space-sp2")), "a project without tabs has no chevron, folded or not");
  CALLS.length = 0;
  byId(root, "space-sp2").handlers.on_click({}, cx);
  eq([runs(), byId(root, "space-sp2").props.tooltip[0]], [[["space.select", { id: "sp2" }]], "inventory-and-order-reports, main"], "its tile shows the project, and says only which one it is");
  CALLS.length = 0;
  sp2.tabs.push(...kept);
  root = rail.render();
  eq(beads("in-sp2")?.map((b) => [b.tab, b.color]), [["tb3", COLOR.blocked]], "and is folded as it was once it has tabs again");
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
