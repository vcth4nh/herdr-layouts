// The list of closed projects (history.js), how the bar keeps it (keep() in bar.js, with
// sketch() and shelve() in data.js), and the two ways it opens.
// Run: ACTIVE=sp2 sh logic/run.sh history-test.mjs
// The fake app does nothing by itself: a test closes a project by taking it out of
// spaces(), and opens one by putting it in.
import { History } from "./history.mjs";
import { Bar } from "./bar.mjs";
import { Rail } from "./rail.mjs";
import { model, sketch, shelve, past, PAST } from "./data.mjs";
import { byId, walk } from "./kit-stub.mjs";
import { spaces, panes, CALLS, SHARED } from "./herdr-fake.mjs";

let failed = 0, passed = 0;
const ok = (cond, what) => { if (cond) passed++; else { failed++; console.log("FAIL:", what); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
const timers = [];
let stopped = 0;
const cx = {
  notify() {}, stop_propagation() { stopped += 1; }, spawn(fn) { return Promise.resolve().then(() => fn(cx)); },
  timer: { every() {}, after(ms, fn) { timers.push({ ms, fn }); } }, focus_handle: () => ({ focus() {} }),
};
const tick = () => new Promise((r) => setTimeout(r, 5));
const runs = () => CALLS.filter((c) => c[0] === "run").map((c) => [c[1], c[2]]);
const text = (node) => { const out = []; const go = (n) => { for (const c of n.children) { if (typeof c === "string") out.push(c); else if (c?.__node) go(c.__node); } }; go(node); return out.join(" | "); };
const pictures = (node) => { const out = []; const go = (n) => { for (const c of n.children) { if (!c?.__node) continue; if (c.__node.kind !== "div" && c.__node.kind !== "h_flex" && c.__node.kind !== "v_flex") out.push(String(c.__node.arg).split("/").pop()); go(c.__node); } }; go(node); return out; };
const SAMPLE = JSON.stringify(SHARED[PAST]);
const SHAPE = JSON.stringify([spaces(), panes()]);
// The flock and the list as they were.
function world() {
  const [S, P] = JSON.parse(SHAPE);
  spaces().splice(0, spaces().length, ...S);
  panes().splice(0, panes().length, ...P);
  for (const k of Object.keys(SHARED)) delete SHARED[k];
  SHARED[PAST] = JSON.parse(SAMPLE);
  for (const k of Object.keys(store)) delete store[k];
  delete globalThis.__ready; delete globalThis.__checking; delete globalThis.__agents;
  CALLS.length = 0; timers.length = 0; stopped = 0;
}
const close = (id) => spaces().splice(spaces().findIndex((s) => s.id === id), 1);
// A project with one tab running `prog` in `cwd`, as Herdr would list a new one.
function open(id, name, machine, cwd, prog = "claude", named = false) {
  const tab = `${id}-tb`, P = panes().find((p) => p.app === prog).program;
  panes().push({ pane: `${id}-p`, terminal: `${id}-t`, tab, title: P.name, cwd, branch: null, status: null, app: prog, program: P, focused: false, zoomed: false, movable: false });
  spaces().push({ id, index: spaces().length + 1, name, named, folder: cwd, machine, branch: null, active: false, status: null,
    tabs: [{ id: tab, index: 1, name: "1", named: false, active: true, status: null, panes: 1, zoomed: false, settled: false, settled_at: null, changed_at: null, working_since: null }] });
}
const claude = (n) => ({ key: "claude", name: "Claude Code", icon: "icons/claude.svg", tint: false, tile: "#1c1d21", color: "#ffffff", n });
const codex = (n) => ({ key: "codex", name: "Codex", icon: "icons/codex.svg", tint: false, tile: "#1c1d21", color: "#ffffff", n });
const names = () => past().map((e) => e.name);

// What a project is noted as, and how the list takes one in.
{
  world();
  const s = (id) => model().spaces.find((x) => x.id === id);
  eq(sketch(s("sp2")), { name: "inventory-and-order-reports", named: false, machine: null, folder: "/Users/me/code/inventory-and-order-reports/services/api", hue: "ansi6", ran: [claude(1)] },
    "a project is noted by its name, its machine, its first tab's folder, its hue and the agents its tabs run: a shell and a program are no agents");
  eq(sketch(s("alpha/sp4")).ran.map((a) => [a.key, a.n]), [["claude", 4], ["codex", 4], ["opencode", 1]], "each agent with how many tabs run it, the most first");
  eq(sketch(s("alpha/sp5"), { ran: [codex(3), { ...claude(1), key: "aider", name: "Aider" }], folder: "/x", hue: "ansi1" }).ran.map((a) => [a.key, a.n]), [["codex", 3], ["aider", 1], ["claude", 1]],
    "an agent stays after its last tab has gone, with the most tabs that ran it at one time");
  eq(sketch(s("sp3")).hue, null, "home has no hue of its own");
  const e = (name, machine, folder, at) => ({ name, machine, folder, at });
  const list = [e("a", null, "/a", 3), e("b", "alpha", "/b", 2), e("c", null, "/c", 1)];
  eq(shelve(list, [e("d", null, "/d", 9)], []).map((x) => x.name), ["d", "a", "b", "c"], "the last closed comes first");
  eq(shelve(list, [e("b", "alpha", "/b/", 9)], []).map((x) => [x.name, x.at]), [["b", 9], ["a", 3], ["c", 1]], "a place is listed once, as it was last closed");
  eq(shelve(list, [e("b", null, "/b", 9)], []).length, 4, "the same name and folder on another machine is another place");
  eq(shelve(list, [], [e("a", null, "/a"), e("b", null, "/b")]).map((x) => x.name), ["b", "c"], "a project that is open is not on the list");
  eq(shelve(Array.from({ length: 40 }, (_, i) => e(`p${i}`, null, `/p${i}`, i)), [e("new", null, "/new", 99)], []).length, 30, "thirty are kept at most");
}

// The bar keeps the list: a project that is gone from Herdr's list has closed.
{
  world();
  const bar = new Bar(cx);
  const T = bar.born;
  bar.keep(T + 1000);
  eq([Object.keys(bar.notes).length, names(), Object.keys(JSON.parse(store.notes)).length], [8, ["paper-kites", "tide tables", "~", "old-lab"], 8], "every project is noted, and the notes are kept across restarts: nothing is listed for that");
  const wrote = store.notes;
  store.notes = "same";
  bar.keep(T + 2000);
  eq(store.notes, "same", "nothing is written while nothing changes");
  store.notes = wrote;
  close("alpha/sp5");
  bar.keep(T + 3000);
  eq(past()[0], { name: "acme.cpp-codex-rework", named: false, machine: "alpha", folder: "/home/me/acme.cpp", hue: "ansi5", ran: [claude(1), codex(1)], at: T + 3000 }, "a closed project is on top of the list, as it was");
  eq([past().length, "alpha/sp5" in bar.notes, "alpha/sp5" in JSON.parse(store.notes)], [5, false, false], "and no longer noted");

  // A project left with its empty page keeps what was noted while it had tabs.
  const sp1 = spaces().find((s) => s.id === "sp1");
  const tabs = sp1.tabs.map((c) => c.id);
  sp1.tabs = [{ ...sp1.tabs[0], id: "tb-page-1", index: 1 }];
  panes().push({ pane: "p-page-1", terminal: null, mod: "glyph", tab: "tb-page-1", title: "Glyph", focused: false, zoomed: false });
  sp1.name = "code"; // with no terminal left, Herdr calls it after the folder it was made in
  bar.keep(T + 4000);
  eq([bar.notes.sp1.name, bar.notes.sp1.ran.map((a) => a.key)], ["notes-app", ["claude", "codex"]], "an empty page changes nothing of what was noted");
  close("sp1");
  bar.keep(T + 5000);
  eq([past()[0].name, past()[0].folder, past()[0].ran.map((a) => a.key), tabs.length], ["notes-app", "/Users/me/code/notes-app", ["claude", "codex"], 2], "closed from its empty page, it is listed with the agents it ran");

  // Out of reach is not closed.
  open("echo/sp20", "far-field", "echo", "/home/me/far-field");
  globalThis.__ready = true;
  bar.keep(T + 6000);
  delete globalThis.__ready;
  close("echo/sp20");
  bar.keep(T + 7000);
  eq([names().includes("far-field"), "echo/sp20" in bar.notes], [false, true], "a project whose machine went out of reach is only missing");
  globalThis.__ready = true;
  bar.keep(T + 8000);
  eq([past()[0].name, past()[0].machine, "echo/sp20" in bar.notes], ["far-field", "echo", false], "back in reach without it, it has closed");

  // A machine Herdr no longer lists.
  open("ghost/sp21", "attic", "ghost", "/home/me/attic");
  bar.keep(T + 9000);
  close("ghost/sp21");
  bar.keep(T + 10000);
  eq([names().includes("attic"), "ghost/sp21" in bar.notes], [false, true], "in the bar's first minute a machine may not be listed yet: its note waits");
  bar.keep(T + 61000);
  eq([names().includes("attic"), "ghost/sp21" in bar.notes], [false, false], "after that the machine was taken off Herdr: the note goes, and nothing is listed");

  // Under a check nothing is noted.
  globalThis.__checking = true;
  close("sp2");
  bar.keep(T + 62000);
  eq(names().includes("inventory-and-order-reports"), false, "under herdr-app check the bar keeps no list");
  delete globalThis.__checking;
  bar.keep(T + 63000);
  eq(past()[0].name, "inventory-and-order-reports", "(and does once the check is over)");
}

// A project closed while the bar was away is found closed when it is back.
{
  world();
  const first = new Bar(cx);
  first.keep(first.born + 1000);
  close("bravo/sp6");
  const next = new Bar(cx);
  next.keep(next.born + 1000);
  eq([past()[0].name, past()[0].at], ["fieldnotes", next.born + 1000], "the notes outlive the bar, and the time is when it was found closed");
}

// Opened again, a project leaves the list, and has its hue back.
{
  world();
  const bar = new Bar(cx);
  bar.keep(bar.born + 1000);
  open("sp30", "paper-kites", null, "/Users/me/code/paper-kites");
  eq(model().spaces.find((s) => s.id === "sp30").hue, "#f9e2af", "a project made where a closed one was gets the hue that one had (ansi3)");
  bar.keep(bar.born + 2000);
  eq(names(), ["tide tables", "~", "old-lab"], "and its entry goes: it is no longer closed");
  open("sp31", "tide tables", null, "/home/me/surveys/tide-tables");
  bar.keep(bar.born + 3000);
  eq(names(), ["tide tables", "~", "old-lab"], "the same name and folder on another machine is not that project");
  close("sp30");
  bar.keep(bar.born + 4000);
  eq([names(), past()[0].hue, past()[0].at], [["paper-kites", "tide tables", "~", "old-lab"], "ansi3", bar.born + 4000], "closed again, it is back on top with its hue");
}

// A list as the popup would hold it.
let last = null;
const fresh = async (wait = true) => {
  globalThis.__props = { role: "history", overlay: "ov9" };
  last?.gone();
  CALLS.length = 0; timers.length = 0; stopped = 0;
  const g = (last = new History(cx));
  if (wait) await tick(); // the machines say what they can start
  const api = { g, root: g.render() };
  api.draw = () => (api.root = g.render());
  api.key = (k) => { byId(api.root, "history").handlers.on_key_down({ key: k, modifiers: {} }, cx); return api.draw(); };
  api.type = (words) => { g.input.type(words, cx); api.draw(); return api; };
  api.click = (id) => { byId(api.root, id).handlers.on_click({}, cx); return api.draw(); };
  // A row's words without its tile's letters.
  api.named = () => api.rows().map((n) => text(n).split(" | ").filter((w) => !/^[A-Z][A-Za-z]?$/.test(w))[0]);
  api.rows = () => { const all = []; walk(api.root, (n) => { if (/^past-\d+$/.test(n.id ?? "")) all.push(n); }); return all; };
  return api;
};

// What it lists.
{
  world();
  const a = await fresh();
  eq(a.rows().map((n) => text(n)), ["PK | paper-kites | ~/code/paper-kites | 9m", "TT | tide tables | alpha | ~/surveys/tide-tables | 3h", "Home | bravo | ~ | 1d", "OL | old-lab | echo | /srv/old-lab | 6d"],
    "a row is a project's tile and name, its machine when that is another one, its folder and how long ago it closed");
  eq(a.rows().map((n) => pictures(n).filter((p) => p !== "x.svg")), [["claude.svg", "codex.svg"], ["server.svg", "codex.svg"], ["home.svg", "server.svg", "shell.svg"], ["server.svg", "claude.svg"]],
    "with the logos of the agents it ran, a terminal's when it ran none, and a house on home's tile");
  eq(a.rows().map((n) => n.props.tooltip[0]), ["Open again with Claude Code", "Open again with Codex", "Open again with a terminal", "echo is out of reach"], "hovering a row says what a press starts");
  eq(byId(a.root, "past-list").props.h[0], 4 * 44, "the list is as tall as its rows");
  eq([Boolean(a.rows()[0].props.bg), Boolean(a.rows()[1].props.bg)], [true, false], "it opens on the project closed last");
  eq(a.g.input.placeholder, "Project, folder or machine", "the field says what can be typed");
}

// Opening one again.
{
  world();
  const a = await fresh();
  a.key("enter");
  eq(CALLS, [["run", "space.new", { machine: "", folder: "/Users/me/code/paper-kites", argv: ["claude"] }], ["closeOverlay", "ov9"]], "Enter opens the picked project on its machine, in its folder, with the agent most of its tabs ran, and the list leaves");
  a.key("enter");
  eq(CALLS.length, 2, "once");
  const b = await fresh();
  b.click("past-1");
  eq(runs(), [["space.new", { machine: "alpha", folder: "/home/me/surveys/tide-tables", name: "tide tables", argv: ["codex", "--no-daemon"] }]], "a click does the same: a project someone named gets its name, and its agent runs as that machine starts it");
  const c = await fresh();
  c.click("past-2");
  eq(runs(), [["space.new", { machine: "bravo", folder: "/home/me" }]], "one that ran no agent opens with a plain terminal");
  const d = await fresh();
  d.click("past-3");
  d.key("down"); d.key("down"); d.key("down"); d.key("enter");
  eq(CALLS, [], "a project on a machine out of reach does not open");
  // Its machine has not said what it can start yet: the project waits for the answer.
  const e = await fresh(false);
  e.click("past-1");
  eq(runs(), [], "nothing is known of alpha yet");
  await tick();
  eq(runs(), [["space.new", { machine: "alpha", folder: "/home/me/surveys/tide-tables", name: "tide tables", argv: ["codex", "--no-daemon"] }]], "asked, it answers, and the project opens");
  // On this computer Herdr's own menu has kept what can be started: no wait.
  const f = await fresh(false);
  f.click("past-0");
  eq(runs(), [["space.new", { machine: "", folder: "/Users/me/code/paper-kites", argv: ["claude"] }]], "what Herdr's new menu last kept is enough to start");
  // An agent its machine has no more: the next one it ran, else a terminal.
  globalThis.__agents = () => [{ key: "codex", name: "Codex", run: ["codex"], installed: true }, { key: "claude", name: "Claude Code", run: ["claude"], installed: false }];
  const g = await fresh();
  eq(g.rows().map((n) => n.props.tooltip[0]).slice(0, 2), ["Open again with Codex", "Open again with Codex"], "an agent that was taken off its machine is passed over");
  g.click("past-0");
  eq(runs(), [["space.new", { machine: "", folder: "/Users/me/code/paper-kites", argv: ["codex"] }]], "and the next one it ran starts");
  globalThis.__agents = () => [];
  const h = await fresh();
  h.click("past-1");
  eq(runs(), [["space.new", { machine: "alpha", folder: "/home/me/surveys/tide-tables", name: "tide tables" }]], "with none of them left, a plain terminal");
  delete globalThis.__agents;
}

// Typing, moving, forgetting, leaving.
{
  world();
  const a = await fresh();
  eq(a.type("alpha").named(), ["tide tables"], "typing a machine's name keeps its projects");
  eq(a.type("codex").named(), ["paper-kites", "tide tables"], "an agent's name keeps the projects that ran it");
  eq(a.type("surveys TIDE").rows().length, 1, "every word has to be there, in any case: here in the folder and the name");
  eq(a.type("home").named(), ["tide tables", "Home"], "a word is looked for in the folder too: /home/me/surveys");
  eq(a.type("this mac").named(), ["paper-kites"], "this computer is found by what the rail calls it");
  a.type("zzz");
  eq([a.rows().length, text(byId(a.root, "past-list")), byId(a.root, "past-list").props.h[0]], [0, "No closed project by that name", 36], "nothing by that name");
  a.type("");
  a.key("down"); a.key("down");
  eq([a.g.at, a.g.scroll.asked.slice(-1)], [2, [2]], "down moves, and keeps the picked row in sight");
  a.key("down"); a.key("down");
  eq(a.g.at, 0, "around the end");
  a.key("up");
  eq(a.g.at, 3, "and back");
  a.type("o");
  eq(a.g.at, 0, "typing picks the first row again");
  // Forgetting one.
  a.type("");
  stopped = 0;
  a.click("forget-1");
  eq([names(), stopped, CALLS], [["paper-kites", "~", "old-lab"], 1, []], "the x at a row's end takes it off the list, and the row under it is not pressed");
  eq(a.rows().length, 3, "the list is drawn without it");
  eq(byId(a.root, "forget-0").props.tooltip[0], "Forget", "its words");
  a.key("escape");
  eq(CALLS, [["closeOverlay", "ov9"]], "Esc leaves");
  SHARED[PAST] = [];
  const b = await fresh();
  eq([b.rows().length, text(byId(b.root, "past-list"))], [0, "No closed projects yet"], "before any project was closed");
  b.key("enter"); b.key("down");
  eq(CALLS, [], "and nothing to open");
  delete SHARED[PAST];
  eq((await fresh()).rows().length, 0, "nor before the bar has kept a list at all");
  // Under a check the list asks no machine what it can start.
  world();
  let asked = 0;
  globalThis.__agents = () => { asked += 1; return []; };
  globalThis.__checking = true;
  await fresh();
  eq(asked, 0, "under herdr-app check no machine is asked");
  delete globalThis.__checking;
  await fresh();
  eq(asked, 3, "otherwise each machine in reach that has a row is asked once: this computer, alpha and bravo");
  delete globalThis.__agents;
  SHARED[PAST] = [{ name: "~", named: false, machine: null, folder: "/Users/me", hue: null, ran: [], at: 0 }, { name: "attic", named: false, machine: null, folder: "/Users/me/attic", hue: null, ran: [], at: 0 }];
  eq((await fresh()).type("home").named(), ["Home"], "home is found by that word, whatever its folder is called");
}

// The two ways in: the button at the rail's foot, and the key.
{
  world();
  last?.gone();
  globalThis.__props = { role: "rail" };
  const rail = new Rail(cx).render();
  const button = byId(rail, "history");
  eq(button.props.tooltip[0], "Closed projects  ⌘Y", "the button's words, with the key keys.json gives it");
  button.handlers.on_click({}, cx);
  eq(CALLS, [["openOverlay", { mod: "glyph", kind: "popup", width: 440, height: 0.8, props: { role: "history" } }]], "the button opens the list where the pointer is");
  let foot = null;
  walk(rail, (n) => { if (n.children.some((c) => c?.__node?.id === "history")) foot = n; });
  const ids = foot.children.map((c) => c.__node.id ?? c.__node.children[0]?.__node?.id);
  eq([ids, 5 * 28 + 4 * foot.props.gap[0] + 2 * foot.props.px[0] <= 160], [["settings", "add-machine", "space-new", "history", "names"], true], "it stands after New project, and the five buttons fit the narrow rail");

  globalThis.__props = { role: "bar" };
  CALLS.length = 0;
  new Bar(cx).render();
  await tick();
  const ask = async () => { CALLS.length = 0; globalThis.__deliver("history"); await tick(); return CALLS.map((c) => (c[0] === "closeOverlay" ? `closeOverlay ${c[1]}` : c)); };
  eq(await ask(), [["openOverlay", { mod: "glyph", kind: "popup", at: "top", offset: 40, width: 440, height: 0.8, props: { role: "history" } }]], "the key opens it under the window's top edge, where the Go-to list opens");
  globalThis.__props = { role: "history", overlay: "ov1" };
  const list = new History(cx);
  eq(await ask(), ["closeOverlay ov1"], "the key again closes the list on show");
  list.gone();
  eq((await ask()).length, 1, "closed from outside, the key opens it again");
  const next = new History(cx);
  byId(next.render(), "history").handlers.on_key_down({ key: "escape", modifiers: {} }, cx);
  eq((await ask())[0]?.[0], "openOverlay", "closed by its own Esc: the same");
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
