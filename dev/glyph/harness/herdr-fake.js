// A stand-in for the "herdr" module in `herdr-app check`, which has no live data:
// a fixed sample flock, with every state on show.
const ROLE = "__ROLE__";
const ACTIVE = "__ACTIVE__";
// Copies under way and one that failed, as the transfer window started them: false, true,
// or "direct" for one that goes straight between two other machines, which are then the
// two the window shows.
const COPYING = __COPIES__;
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

// What the transfer window lists: a few folders on a few machines. [name, size] is a file,
// [name] a folder; a folder that is not here can't be read.
const HOMES = { "": "/Users/me", alpha: "/home/me", bravo: "/home/me", charlie: "/home/me", foxtrot: "/home/me" };
const FILES = {
  ":/Users/me": [["Desktop"], ["Downloads"], ["code"], [".config"], ["notes.txt", 2210], [".zshrc", 1432]],
  ":/Users/me/code/inventory-and-order-reports/services/api": [["fixtures"], ["src"], ["tests"], [".venv"], ["README.md", 4312], ["import.py", 18734], ["stock-2026-11.parquet", 148229120], ["suppliers.csv", 912400], [".env", 211]],
  ":/Users/me/code/inventory-and-order-reports/services/api/fixtures": [["northwind.xlsx", 88120], ["contoso.xlsx", 20480]],
  ":/Users/me/Downloads": [["invoice-0412.pdf", 301992]],
  "alpha:/home/me": [["acme-shop-backend"], ["acme.cpp"], ["data"], ["core.dump", 2473901162]],
  "alpha:/home/me/acme-shop-backend": [["build"], ["config"], ["logs"], ["src"], ["Makefile", 3120], ["README.md", 2801], ["suppliers.csv", 90210], ["trace-retry.log", 5881023]],
  "alpha:/": [["etc"], ["home"], ["tmp"], ["var"]],
  "bravo:/home/me": [["fieldnotes"], ["kettle"], ["notes.txt", 120]],
  "bravo:/home/me/kettle": [],
  "charlie:/home/me": [["scratch"]],
  "foxtrot:/home/me": [["lantern"]],
};
// A folder as that machine's sh would print it for copy.js (LIST there, read by parse), or null.
const listed = (on, path) => {
  const home = HOMES[on ?? ""], at = path || home, dir = FILES[`${on ?? ""}:${at}`];
  if (!home || !dir) return null;
  const long = dir.map(([name, size]) => (size === undefined ? `drwxr-xr-x  3 501  20  96 Nov 14 02:38 ${name}` : `-rw-r--r--  1 501  20  ${size} Nov 14 02:38 ${name}`));
  return `${at}\0${home}\0${dir.map(([name, size]) => `${size === undefined ? "d" : "f"}\0${name}\0`).join("")}\0total 8\n${long.join("\n")}\n`;
};
const MACHINES = [
  { name: "alpha", state: "connected", target: "alpha", via: false }, { name: "bravo", state: "connected", target: "bravo", via: false },
  { name: "charlie", state: "connected", target: "fly ssh console -a charlie -C", via: true }, { name: "delta-2", state: "needs_login", target: "delta-2", via: false },
  { name: "echo", state: "unreachable", target: "echo", via: false }, { name: "foxtrot", state: "connected", target: "me@10.0.0.7:2222", via: false }];
// How this computer's ssh gets to three of them, the host keys it has on record, and the
// OpenSSH each one runs.
const NET = {
  alpha: { target: "alpha", user: "me", host: "alpha.lan", port: "22", ip: "10.0.0.5", keys: ["ssh-ed25519 AAAAC3alpha"], ssh: "OpenSSH_9.6p1" },
  bravo: { target: "bravo", user: "me", host: "bravo.lan", port: "22", ip: "10.0.0.6", keys: ["ssh-rsa AAAAB3bravo", "ssh-ed25519 AAAAC3bravo"], ssh: "OpenSSH_10.2p1" },
  foxtrot: { target: "me@10.0.0.7", user: "me", host: "10.0.0.7", port: "2222", ip: null, keys: ["ecdsa-sha2-nistp256 AAAAE2foxtrot"], ssh: "OpenSSH_8.2p1" },
};
// What a machine's ssh says when it tries another's address with nothing to show. Any other
// try times out: alpha gets to bravo by its number only, bravo gets to foxtrot, and nothing
// gets to alpha.
const SAYS = {
  "alpha>bravo.lan": "ssh: Could not resolve hostname bravo.lan: Name or service not known",
  "alpha>10.0.0.6": "me@10.0.0.6: Permission denied (publickey,password).",
  "alpha>10.0.0.7": "me@10.0.0.7: Permission denied (publickey).",
  "bravo>10.0.0.7": "me@10.0.0.7: Permission denied (publickey,password).",
};
// ssh, ssh-keygen and the name lookup, as copy.js asks them (reach and probe there).
const net = (command, args, on) => {
  const good = (stdout, stderr = "") => ({ code: 0, stdout, stderr });
  if (command === "ssh" && args[0] === "-V") return good("", `${NET[on]?.ssh ?? "OpenSSH_9.6p1"} Ubuntu-3ubuntu13, OpenSSL 3.0.13\n`);
  if (command === "ssh" && args[0] === "-G") {
    const target = args[args.length - 1], k = Object.values(NET).find((x) => x.target === target);
    return good(`user ${k?.user ?? "me"}\nhostname ${k?.host ?? target}\nport ${k?.port ?? "22"}\nuserknownhostsfile /Users/me/.ssh/known_hosts /Users/me/.ssh/known_hosts2\nglobalknownhostsfile /etc/ssh/ssh_known_hosts\n`);
  }
  if (command === "ssh-keygen") {
    const k = Object.values(NET).find((x) => (x.port === "22" ? x.host : `[${x.host}]:${x.port}`) === args[1]);
    return k && args[3] === "/Users/me/.ssh/known_hosts" ? good(`# Host ${args[1]} found: line 3\n${k.keys.map((key) => `${args[1]} ${key}`).join("\n")}\n`) : { code: 1, stdout: "", stderr: "" };
  }
  if (command === "sh") {
    const k = Object.values(NET).find((x) => x.host === args[3]);
    return good(k?.ip ? `${k.ip}       ${k.host}\n` : "");
  }
  const to = args[args.length - 2], addr = to.split("@")[1], port = args[args.indexOf("-p") + 1];
  return { code: 255, stdout: "", stderr: `${SAYS[`${on}>${addr}`] ?? `ssh: connect to host ${addr} port ${port}: Connection timed out`}\n` };
};
// For check.sh's LISTED hook: the transfer window as it is once its folders have been read,
// and for its DIRECT hook, what it has learned of the way between alpha and bravo.
globalThis.__list = listed;
globalThis.__fleet = MACHINES.map((k) => ({ ...k, temporary: false }));
globalThis.__hops = [
  { on: "alpha", far: "bravo", ok: true, user: "me", addr: "10.0.0.6", port: "22", pin: "ssh-ed25519 AAAAC3bravo" },
  { on: "bravo", far: "alpha", why: "connect to host 10.0.0.5 port 22: Connection timed out" },
];
if (COPYING) for (const address of ["t90", "t91"]) TERMS.push({ address, state: "live", status: null, parent: null, name: null, program: { key: "program", name: "scp", icon: null, tint: true, tile: null, color: null, shell: false, agent: false }, report: { state: null, title: null } });
const noop = () => null;
export const spaces = () => SPACES;
export const panes = () => PANES;
export const terminals = () => TERMS;
export const agents = () => PANES.filter((p) => p.status).map((p) => ({ address: p.terminal, pane: p.pane, tab: p.tab, status: p.status, program: p.program }));
export const machines = () => [null, "alpha", "bravo", "charlie", "delta-2", "echo", "foxtrot"].map((name) => ({ name, layout: name === "echo" ? "unavailable" : "ready" }));
// Shared values: what a test or the mod set, over what the app would hold.
export const SHARED = {
  "glyph.blank": { sp9: { name: "garden-planner", folder: "/Users/me/code/garden-planner" } },
  // Where the transfer window's right side was left.
  "glyph.side": COPYING === "direct" ? { on: "bravo", path: "/home/me" } : { on: "alpha", path: "/home/me/acme-shop-backend" },
  ...(COPYING === "direct" ? { "glyph.copies": [
    { id: "alpha/t93", from: "alpha", to: "bravo", dir: "/home/me", name: "trace-retry.log", n: 1, one: true, at: now - 8000, direct: "bravo" },
  ] } : COPYING ? { "glyph.copies": [
    { id: "t90", from: null, to: "alpha", dir: "/home/me/acme-shop-backend", name: "stock-2026-11.parquet", n: 1, one: true, at: now - 20000 },
    { id: "t91", from: "alpha", to: "bravo", dir: "/home/me/kettle", name: "logs", n: 3, one: false, at: now - 50000 },
    { id: "t92", from: "bravo", to: null, dir: "/Users/me/Downloads", name: "notes.txt", n: 1, one: true, at: now - 90000, failed: "scp: /home/me/notes.txt: Permission denied" },
  ] } : {}),
};
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
  { section: "global", action: "space.new", keys: "cmd-shift-n" }, { section: "layout:glyph", action: "glyph.transfer", keys: "cmd-shift-t" },
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
// What the mod asked of hc and of the machines' own programs, apart from CALLS.
export const ASKS = [];
// hc: the machines, and for the transfer window a copy that starts (t90) and its meter.
// A test may answer for hc itself: globalThis.__hc = (args) => a result, or nothing.
export const hc = async (args = []) => {
  ASKS.push(["hc", args]);
  const own = globalThis.__hc?.(args);
  if (own) return own;
  if (args[0] === "run") return { code: 0, stdout: JSON.stringify({ address: "t90", state: "live" }), stderr: "" };
  if (args[0] === "read") return { code: 0, stdout: "stock-2026-11.parquet                 42%   59MB  11.2MB/s   00:07 ETA\n", stderr: "" };
  if (args[0] !== "machine") return { code: 0, stdout: "{}", stderr: "" };
  return { code: 0, stdout: JSON.stringify({ machines: MACHINES }), stderr: "" };
};
// A machine's sh listing a folder, in the form copy.js asks for and reads (LIST, parse), or
// what ssh has to say about getting from one machine to another (net above).
export const exec = async (command, args = [], options = {}) => {
  ASKS.push(["exec", command, args, options]);
  if (command !== "sh" || String(args[1]).includes("getent")) return net(command, args, options?.on ?? null);
  const out = listed(options?.on ?? null, args[3]);
  return out === null ? { code: 2, stdout: "", stderr: `sh: line 0: cd: ${args[3]}: No such file or directory\n` } : { code: 0, stdout: out, stderr: "" };
};
export const knownAgents = async () => [{ ...P.claude, run: ["claude"], installed: true }, { ...P.codex, run: ["codex", "--no-daemon"], installed: true }, { ...P.opencode, run: ["opencode"], installed: true }];
