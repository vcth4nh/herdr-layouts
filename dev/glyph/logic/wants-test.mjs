// The lists the bar's bell and tick open (wants.js), and how the bar opens and closes them.
// Run: ACTIVE=sp2 sh logic/run.sh wants-test.mjs (the shown tab is tb3, which needs you).
// The fake app does nothing by itself: a test changes a tab's state in spaces().
import { Wants } from "./wants.mjs";
import { Bar } from "./bar.mjs";
import { model, lineUp } from "./data.mjs";
import { byId, walk } from "./kit-stub.mjs";
import { CALLS, ASKS, spaces, terminals } from "./herdr-fake.mjs";

let failed = 0, passed = 0;
const ok = (cond, what) => { if (cond) passed++; else { failed++; console.log("FAIL:", what); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
const timers = [];
let stopped = 0;
const cx = {
  notify() {}, stop_propagation() { stopped += 1; }, spawn(fn) { return Promise.resolve().then(() => fn(cx)); },
  timer: { every(ms, fn) { timers.push({ ms, fn, every: true }); }, after(ms, fn) { timers.push({ ms, fn }); } }, focus_handle: () => ({ focus() {} }),
};
const fire = (ms) => { for (const t of [...timers]) if (t.ms === ms) t.fn(cx); };
const runs = () => CALLS.filter((c) => c[0] === "run").map((c) => [c[1], c[2]]);
const text = (node) => { const out = []; const go = (n) => { for (const c of n.children) { if (typeof c === "string") out.push(c); else if (c?.__node) go(c.__node); } }; go(node); return out.join(" | "); };
const rows = (root) => { const all = []; walk(root, (n) => { if (n.id?.startsWith("want-") && n.id !== "want-list") all.push(n.id.slice(5)); }); return all; };
const picked = (root) => rows(root).filter((id) => Boolean(byId(root, `want-${id}`).props.bg));
const tabOf = (id) => spaces().flatMap((s) => s.tabs).find((c) => c.id === id);
const showing = (sid) => { for (const s of spaces()) s.active = s.id === sid; };

// A list as the popup would hold it. The one before it is gone, as the app tells a copy
// whose overlay closed.
let last = null;
const fresh = (status) => {
  globalThis.__props = { role: "wants", status, overlay: "ov7" };
  last?.gone();
  CALLS.length = 0; timers.length = 0;
  const w = (last = new Wants(cx));
  const api = { w, root: w.render() };
  api.draw = () => (api.root = w.render());
  api.key = (k) => { byId(api.root, "wants").handlers.on_key_down({ key: k, modifiers: {} }, cx); return api.draw(); };
  return api;
};

// What it lists: the tabs in its state, in the rail's order, which is their beads' order.
{
  const a = fresh("blocked");
  eq(rows(a.root), ["tb3", "tb6"], "the tabs that need you, a sub-agent's error among them");
  eq(rows(a.root), lineUp(model().flat).filter((c) => c.status === "blocked").map((c) => c.id), "in the order of their beads");
  eq(rows(fresh("done").root), ["alpha/tb10"], "the tick's list: the tabs that finished");
  const b = fresh("blocked");
  eq(text(byId(b.root, "want-tb3")), "Stock importer: supplier detection | IA | inventory-and-order-reports | 1m", "a row: its words, its project, and how long it has needed you");
  eq(text(byId(b.root, "want-tb6")), "Tidy the shell config | Home | ", "a sub-agent's error gives no time: its tab's own is for another state");
  eq(text(byId(fresh("done").root, "want-alpha/tb10")), "gateway | AS | acme-shop-backend | alpha | 6m", "another machine's tab names its machine");
  eq(byId(b.root, "want-tb3").props.tooltip[0], "Stock importer: supplier detection, inventory-and-order-reports, needs you", "hovering a row says the rest");
  eq(byId(b.root, "want-list").props.h[0], 88, "the list is as tall as its rows");
}

// Where it opens: on the first tab after the one on show, from the top after the last.
{
  const a = fresh("blocked");
  eq(picked(a.root), ["tb6"], "the shown tab needs you: the list opens on the next one");
  showing("alpha/sp4");
  eq(picked(fresh("blocked").root), ["tb3"], "past the last one, it opens on the first");
  showing("sp2");
}

// Going: Enter or a click shows the tab and closes the list. Esc only closes it.
{
  const a = fresh("blocked");
  a.key("down");
  eq(picked(a.root), ["tb3"], "down goes around to the top");
  a.key("up");
  eq(picked(a.root), ["tb6"], "up comes back");
  CALLS.length = 0;
  a.key("enter");
  eq(CALLS, [["closeOverlay", "ov7"], ["run", "pane.focus", { pane: "p6" }]], "Enter shows the picked tab, and the list closes");
  const b = fresh("blocked");
  byId(b.root, "want-tb3").handlers.on_click({}, cx);
  eq(runs(), [["pane.focus", { pane: "p3" }]], "a click on a row shows its tab");
  const c = fresh("done");
  c.key("escape");
  eq(CALLS, [["closeOverlay", "ov7"]], "Esc closes it, and goes nowhere");
}

// It follows the tabs: one that leaves its state leaves the list, the picked one handing
// over to the row in its place, and the list closes once none is left.
{
  const a = fresh("blocked");
  a.key("down");
  tabOf("tb3").status = "working";
  a.draw();
  eq([rows(a.root), picked(a.root)], [["tb6"], ["tb6"]], "a tab that no longer needs you leaves the list");
  tabOf("tb3").status = "blocked";
  a.draw();
  eq([rows(a.root), picked(a.root)], [["tb3", "tb6"], ["tb6"]], "one that comes to need you joins it, and the pick stays");
  const b = fresh("done");
  CALLS.length = 0;
  fire(250);
  eq(CALLS, [], "with a tab in it, it stays");
  tabOf("alpha/tb10").status = "idle";
  fire(250);
  eq(CALLS, [["closeOverlay", "ov7"]], "with none left, it closes");
  fire(250);
  eq(CALLS, [["closeOverlay", "ov7"]], "once");
  tabOf("alpha/tb10").status = "done";
  b.w.done = true;
}

// The tick's list marks every tab in it as read: each of their agents that finished gets
// herdr-core's `herdr.seen` label raised to its turn, as Herdr does for one a person looks at.
{
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const asked = () => ASKS.filter((a) => a[0] === "hc").map((a) => a[1].join(" "));
  const notices = () => CALLS.filter((c) => c[0] === "notify").map((c) => [c[1].title, c[1].body, c[1].level]);
  const term = (address) => terminals().find((x) => x.address === address);
  ok(!byId(fresh("blocked").root, "read-all"), "the bell's list has no such button: what needs you can't be read away");
  const a = fresh("done");
  const button = () => byId(a.root, "read-all");
  eq([button().props.tooltip[0], button().arg ?? null], ["Mark all as read", null], "the tick's list has the button, with its words on hover");
  ASKS.length = 0;
  button().handlers.on_click({}, cx);
  await tick();
  eq([asked(), notices()], [["label alpha/t10 herdr.seen=3"], []], "a press raises each finished agent's label to its turn");
  // Its sub-agents too: one that finished is written, one at work and one already seen are not.
  const kids = [
    { address: "alpha/t10-1", state: "live", status: "done", parent: "alpha/t10", program: null, report: {}, turn: 2, labels: { "herdr.seen": "1" } },
    { address: "alpha/t10-2", state: "live", status: "working", parent: "alpha/t10", program: null, report: {}, turn: 5, labels: { "herdr.seen": "1" } },
    { address: "alpha/t10-3", state: "live", status: "idle", parent: "alpha/t10", program: null, report: {}, turn: 4, labels: { "herdr.seen": "4" } },
  ];
  terminals().push(...kids);
  ASKS.length = 0;
  const b = fresh("done");
  byId(b.root, "read-all").handlers.on_click({}, cx);
  byId(b.root, "read-all").handlers.on_click({}, cx);
  await tick();
  eq(asked().sort(), ["label alpha/t10 herdr.seen=3", "label alpha/t10-1 herdr.seen=2"], "and its sub-agents' that finished, once for two presses in a row; none at work, and none lowered");
  terminals().splice(terminals().length - kids.length, kids.length);
  // A listing without the turn: hc is asked for it.
  const t10 = term("alpha/t10"), turn = t10.turn;
  delete t10.turn;
  globalThis.__hc = (args) => (args[0] === "get" ? { code: 0, stdout: JSON.stringify({ address: "alpha/t10", status: { app: "codex", state: "done" }, turn: 4, labels: { "herdr.seen": "2" } }), stderr: "" } : null);
  ASKS.length = 0;
  const c = fresh("done");
  byId(c.root, "read-all").handlers.on_click({}, cx);
  await tick();
  eq(asked(), ["get alpha/t10 --json", "label alpha/t10 herdr.seen=4"], "a turn the listing lacks is asked of hc");
  t10.turn = turn;
  // A label that can't be written: a notice names the tab.
  globalThis.__hc = (args) => (args[0] === "label" ? { code: 1, stdout: "", stderr: "alpha is out of reach" } : null);
  CALLS.length = 0;
  const d = fresh("done");
  byId(d.root, "read-all").handlers.on_click({}, cx);
  await tick();
  eq(notices(), [["Glyph could not mark a tab as read", "gateway", "error"]], "a tab that could not be marked is named in a notice");
  delete globalThis.__hc;
  d.w.done = true;
}

// The bar: a click on the bell or the tick lists its tabs under it, and a click while its
// list shows closes the list.
{
  last?.gone();
  // The list above went just now: the clock moves on, so no press counts as closing it.
  const real = Date.now;
  let skew = 1000;
  Date.now = () => real() + skew;
  globalThis.__props = undefined;
  const bar = new Bar(cx);
  const root = bar.render();
  const pill = (k) => byId(root, `wants-${k}`);
  eq([pill("blocked").props.tooltip[0], pill("done").props.tooltip[0]], ["2 need you: list them", "1 finished: list them"], "the pills' words");
  const click = (k, x = 900) => {
    CALLS.length = 0; stopped = 0;
    pill(k).handlers["on_mouse_down:left"]({ position: { x, y: 20 } }, cx);
    pill(k).handlers.on_click({}, cx);
    return CALLS.map((c) => (c[0] === "closeOverlay" ? `close ${c[1]}` : `open ${c[1].props.status} ${c[1].at.x},${c[1].at.y}`));
  };
  const SPEC = { mod: "glyph", kind: "popup", at: { x: 710, y: 40 }, width: 380, height: 0.8, props: { role: "wants", status: "blocked" } };
  click("blocked");
  eq([CALLS, stopped], [[["openOverlay", SPEC]], 1], "the bell opens its list, centered under the press and under the bar, and the press goes no further");
  globalThis.__zoom = 2;
  eq(click("done", 1200), ["open done 820,80"], "at a zoom, in the window's pixels");
  delete globalThis.__zoom;
  // The list says it is on show. A click on its pill: the app has closed it at the press
  // (a press beside a popup), or it is closed now.
  globalThis.__props = { role: "wants", status: "blocked", overlay: "ov1" };
  const list = new Wants(cx);
  eq(click("blocked"), ["close ov1"], "the bell again closes its list, and opens none");
  list.gone();
  eq(click("blocked"), [], "when the press beside it closed it first, the click opens none either");
  skew += 500;
  eq(click("blocked"), ["open blocked 710,40"], "later, the bell opens it again");
  const again = new Wants(cx);
  eq(click("done"), ["close ov1", "open done 710,40"], "the tick over the bell's list: the tick's list in its place");
  again.gone();
  // A click is a press and a release on the pill: a release alone, or one on the other pill, does nothing.
  CALLS.length = 0;
  pill("blocked").handlers.on_click({}, cx);
  pill("done").handlers["on_mouse_down:left"]({ position: { x: 900, y: 20 } }, cx);
  pill("blocked").handlers.on_click({}, cx);
  eq(CALLS, [], "a click with no press of its own opens nothing");
  // Nothing steps through the tabs any more.
  ok(!runs().length, "the pills go to no tab by themselves");
  Date.now = real;
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
