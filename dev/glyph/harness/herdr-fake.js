// A stand-in for the "herdr" module in `herdr-app check`, which has no live data:
// a fixed sample flock, with every state on show.
const ROLE = "__ROLE__";
const ACTIVE = "__ACTIVE__";
const THEME = __THEME__;
const LAYOUT = __LAYOUT__;
const now = Date.now();
const P = {
  claude: { key: "claude", name: "Claude Code", icon: "icons/claude.svg", tint: false, tile: "#1c1d21", color: "#ffffff", shell: false, agent: true },
  codex: { key: "codex", name: "Codex", icon: "icons/codex.svg", tint: false, tile: "#1c1d21", color: "#ffffff", shell: false, agent: true },
  opencode: { key: "opencode", name: "OpenCode", icon: "icons/opencode.svg", tint: true, tile: "#1c1d21", color: "#ffffff", shell: false, agent: true },
  shell: { key: "shell", name: "zsh", icon: "icons/shell.svg", tint: true, tile: "#16241a", color: "#4ec95f", shell: true, agent: false },
  python: { key: "python", name: "Python", icon: "icons/python.svg", tint: true, tile: "#3776ab", color: "#ffffff", shell: false, agent: false },
};
let n = 0;
const PANES = [], TERMS = [];
// What a terminal started with `hc run`, and what those started: { prog, status, name, title,
// gone, kids }. Each is addressed after its parent ("t6-1", "t6-1-1").
function kids(parent, cwd, list = []) {
  list.forEach((k, i) => {
    const address = `${parent}-${i + 1}`, status = k.status ?? null;
    TERMS.push({ address, state: k.gone ? "exited" : "live", status, parent, name: k.name ?? null, template: null, cwd, program: P[k.prog ?? "codex"], report: { state: status, title: k.title ?? null } });
    kids(address, cwd, k.kids);
  });
}
function tab(space, name, prog, status, title, ago, extra = {}) {
  n += 1;
  const id = `${space.machine ? space.machine + "/" : ""}tb${n}`, pane = `p${n}`, term = `${space.machine ? space.machine + "/" : ""}t${n}`;
  PANES.push({ pane, terminal: term, tab: id, title: extra.untitled ? term : title ? `✳ ${title}` : P[prog].name, cwd: space.cwd, branch: space.branch, status, app: prog, program: P[prog], focused: Boolean(extra.active) && space.active, zoomed: false, movable: false });
  TERMS.push({ address: term, state: "live", status, parent: null, program: P[prog], report: { state: status, title: title ?? null } });
  kids(term, space.cwd, extra.kids);
  return { id, index: space.tabs.length + 1, name: name ?? String(space.tabs.length + 1), named: Boolean(name), active: Boolean(extra.active), status, panes: 1, zoomed: false, settled: false, settled_at: null,
    changed_at: ago == null ? null : now - ago * 60000, working_since: status === "working" && ago != null ? now - ago * 60000 : null };
}
function space(id, name, machine, branch, cwd, active, make) {
  const s = { id, index: SPACES.length + 1, name, named: false, folder: cwd.replace(/\/services\/api$/, ""), machine, branch, active, status: null, tabs: [], cwd };
  for (const args of make) s.tabs.push(tab(s, ...args));
  SPACES.push(s);
}
const SPACES = [];
space("sp1", "notes-app", null, "main", "/Users/me/code/notes-app", ACTIVE === "sp1", [
  [null, "claude", "idle", "Sync design notes", 780, { active: true }],
  [null, "codex", "working", "Action review of the diff | notes-app", 3],
]);
space("sp2", "inventory-and-order-reports", null, "main", "/Users/me/code/inventory-and-order-reports/services/api", ACTIVE === "sp2", [
  [null, "claude", "blocked", "Stock importer: supplier detection", 1, { active: true }],
  ["notes", "shell", null, null, null],
  [null, "python", null, null, null],
]);
// Its agent started three helpers: one named, at work, with a program of its own; one that
// goes by its title and hit an error; and one that has ended, which gets no row.
space("sp3", "~", null, null, "/Users/me", ACTIVE === "sp3", [[null, "claude", "working", "Tidy the shell config", 12, { active: true, kids: [
  { status: "working", name: "lint-pass", title: "Lint the zshrc", kids: [{ prog: "python", name: "fixtures" }] },
  { prog: "claude", status: "error", title: "✳ Port the aliases" },
  { status: "idle", name: "old-run", gone: true },
] }]]);
space("alpha/sp4", "acme-shop-backend", "alpha", "order-queue", "/home/me/acme-shop-backend", ACTIVE === "alpha/sp4", [
  [null, "claude", "idle", "Design overview", 800],
  ["acme.cpp", "codex", "working", "Fuzz the config loader", 2],
  ["relay", "codex", "working", "Trace the retry path", 2, { active: true }],
  ["gateway", "codex", "done", "Review PR 12", 6],
  [null, "claude", "idle", "Notes", 70],
  ["first results review", "claude", "idle", "Old run", 1100],
  ["pricing rules proposal", "claude", "idle", "Pricing", 900],
  ["open-questions", "opencode", "idle", "Second opinion", 30],
  ["Codex", "codex", "idle", "Codex", 300],
]);
space("alpha/sp5", "acme.cpp-codex-rework", "alpha", null, "/home/me/acme.cpp", ACTIVE === "alpha/sp5", [
  [null, "claude", "idle", null, 1380, { active: true }],
  // A terminal nobody titled is called by its address; an agent's " | <folder>" is not the project's name here.
  [null, "shell", null, null, null, { untitled: true }],
  [null, "codex", "idle", "Check current progress | acme.cpp", 40],
]);
space("bravo/sp6", "fieldnotes", "bravo", "main", "/home/me/fieldnotes", ACTIVE === "bravo/sp6", [[null, "claude", "idle", "Smoke test the release build", 1140, { active: true }]]);
space("bravo/sp7", "kettle", "bravo", "refactor", "/home/me/kettle", ACTIVE === "bravo/sp7", [[null, "claude", "idle", "Review refactor impl", 1380, { active: true }]]);
space("foxtrot/sp8", "lantern", "foxtrot", null, "/home/me/lantern", ACTIVE === "foxtrot/sp8", [[null, "claude", "idle", "PR 7", 300, { active: true }]]);
// ACTIVE "sp9": a project whose last tab was closed, showing its empty page: a tab whose only
// pane is the mod. With no terminal left the app calls it after the folder it was made in;
// shared "glyph.blank" (below) remembers what it went by and where its tabs were.
if (ACTIVE === "sp9") {
  SPACES.push({ id: "sp9", index: SPACES.length + 1, name: "code", named: false, folder: "/Users/me/code", machine: null, branch: null, active: true, status: null,
    tabs: [{ id: "tb-page", index: 1, name: "1", named: false, active: true, status: null, panes: 1, zoomed: false, settled: false, settled_at: null, changed_at: null, working_since: null }] });
  PANES.push({ pane: "p-page", terminal: null, mod: "glyph", tab: "tb-page", title: "Glyph", focused: true, zoomed: false });
}

const noop = () => null;
export const spaces = () => SPACES;
export const panes = () => PANES;
export const terminals = () => TERMS;
export const agents = () => PANES.filter((p) => p.status).map((p) => ({ address: p.terminal, pane: p.pane, tab: p.tab, status: p.status, program: p.program }));
export const machines = () => [null, "alpha", "bravo", "charlie", "delta-2", "echo", "foxtrot"].map((name) => ({ name, layout: name === "echo" ? "unavailable" : "ready" }));
// Shared values: what a test or the mod set, over what the app would hold.
export const SHARED = { "glyph.blank": { sp9: { name: "garden-planner", folder: "/Users/me/code/garden-planner" } } };
export const setShared = (k, v) => { if (k !== "space.colors") SHARED[k] = v; return null; };
export const shared = (k) => (k in SHARED ? SHARED[k] : k === "new-menu.agents" ? { "": [{ ...P.claude, run: ["claude"], installed: true }, { ...P.codex, run: ["codex"], installed: true }, { ...P.opencode, run: ["opencode"], installed: false }] } : k === "space.colors" ? { sp1: "ansi1", sp2: "ansi6", "alpha/sp4": "ansi6", "alpha/sp5": "ansi5", "bravo/sp6": "ansi3", "bravo/sp7": "ansi4", "foxtrot/sp8": "ansi2", sp9: "ansi4" } : undefined);
// What the mod asked the app to do, for tests that drive it by hand.
export const CALLS = [];
export const run = (name, args) => { CALLS.push(["run", name, args]); return null; };
export const openOverlay = (spec) => { CALLS.push(["openOverlay", spec]); return "ov1"; };
export const setAgentOrder = noop;
export const closeOverlay = (id) => { CALLS.push(["closeOverlay", id]); return null; };
export const notify = (n) => { CALLS.push(["notify", n]); return "n1"; };
// The pane with the keyboard: the shown tab's first one, unless a test says otherwise.
export const FOCUS = { pane: undefined };
export const focused = () => {
  const s = SPACES.find((x) => x.active), c = s?.tabs.find((x) => x.active);
  const pane = FOCUS.pane !== undefined ? FOCUS.pane : PANES.find((p) => p.tab === c?.id)?.pane ?? null;
  return s && c ? { space: s.id, tab: c.id, pane, terminal: PANES.find((p) => p.pane === pane)?.terminal ?? null, shown: null, agent: null, cwd: null } : null;
};
// A test delivers a key command by calling globalThis.__deliver(name).
export const nextCommand = () => new Promise((resolve) => { globalThis.__deliver = resolve; });
export const keys = () => [
  { section: "global", action: "tab.new", keys: "cmd-t" }, { section: "global", action: "tab.close", keys: "cmd-w" }, { section: "global", action: "tab.rename", keys: "f2" },
  { section: "layout:glyph", action: "glyph.rename", keys: "f2" }, { section: "layout:glyph", action: "glyph.close", keys: "cmd-w" }, { section: "layout:glyph", action: "glyph.close-pane", keys: "cmd-shift-w" },
  { section: "layout:glyph", action: "glyph.new", keys: "cmd-t" }, { section: "layout:glyph", action: "glyph.new-claude", keys: "cmd-shift-c" }, { section: "layout:glyph", action: "glyph.new-codex", keys: "cmd-shift-o" },
  { section: "global", action: "space.new", keys: "cmd-shift-n" },
  { section: "layout:glyph", action: "glyph.goto", keys: "cmd-p" },
];
export const theme = () => THEME;
export const layout = () => LAYOUT;
export const window = () => ({ platform: "macos", titlebar: "none", buttons: false, maximized: false, fullscreen: true, active: true });
export const settings = () => ({ zoom: 1 });
export const updates = () => ({ app: { version: "0.1.15", ready: "0.1.16", updates: true } });
export const home = () => "/Users/me";
// A test may set globalThis.__props to stand for another copy of the mod.
export const props = () => (globalThis.__props ? globalThis.__props : ROLE === "pane" ? { pane: "__PANE__", terminal: "t3" } : ROLE === "menu" ? { role: "menu", tab: "__PANE__", overlay: "ov1" } : { role: ROLE });
export const hc = async () => ({ code: 0, stdout: JSON.stringify({ machines: [
  { name: "alpha", state: "connected" }, { name: "bravo", state: "connected" }, { name: "charlie", state: "connected" }, { name: "delta-2", state: "needs_login" },
  { name: "echo", state: "unreachable" }, { name: "foxtrot", state: "connected" }] }), stderr: "" });
export const knownAgents = async () => [{ ...P.claude, run: ["claude"], installed: true }, { ...P.codex, run: ["codex", "--no-daemon"], installed: true }, { ...P.opencode, run: ["opencode"], installed: true }];
