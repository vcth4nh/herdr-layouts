// What the parts draw from: Herdr's live lists, read once per render and shaped into
// machines > projects (spaces) > tabs. A tab is the unit you go to: it shows its lead
// program's logo and the most urgent state of its agents and their sub-agents.
// Below that, what the parts do alike: go to a tab, start one, close one, rename one.

import { spaces, panes, terminals, machines, shared, setShared, run, hc, exec, openOverlay, closeOverlay, keys, settings, window as win } from "herdr";
import { SHELL } from "./ui.js";

export const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
const rank = (s) => RANK[s] ?? 0;

// Project hues. The names are the ones the shipped Spaces list stores in shared
// "space.colors", so a project keeps its place on the wheel in every layout; the colors
// stay clear of the three that mean something (working, needs you, finished).
// A project whose last tab was closed, or ended by itself, keeps showing, as an empty page
// (blank.js): a tab whose only pane is this mod. Shared BLANK remembers, by project id, what
// the page can't tell any more with no terminal left: the project's name and the folder its
// tabs were in.
export const BLANK = "glyph.blank";
// How closing a tab is asked of the bar (see closeTab): shared SHUT names the tab.
export const SHUT = "glyph.shut";
// ms a first close press waits for the second.
export const ARM = 3000;

// The order the machines come in, in the rail and wherever glyph lists them. Herdr keeps
// this computer's projects first and the other machines' by name, and has no command that
// changes that, so this order is glyph's own: shared ORDER names the machines as the rail's
// drag left them, "" for this computer. A machine it doesn't name comes after those it does.
export const ORDER = "glyph.machines";
export function arrange(names, said) {
  if (!Array.isArray(said)) return names;
  const at = new Map(said.map((k, i) => [k || null, i]));
  return [...names.filter((n) => at.has(n)).sort((a, b) => at.get(a) - at.get(b)), ...names.filter((n) => !at.has(n))];
}

// The projects that were closed, the last one first, for the list that opens them again
// (history.js): shared PAST. Each is what its project went by and where it was:
// { name, named, machine, folder, hue, ran, at }. `ran` is the agents its tabs ran, the one
// most of them ran first, and `at` when it was found closed. The bar keeps the list (keep()
// in bar.js); Herdr's own, which a mod can't read, has a name and a folder only.
export const PAST = "glyph.history";
const PAST_MOST = 30; // how many closed projects are kept
export const past = () => {
  const all = shared(PAST);
  return Array.isArray(all) ? all : [];
};
// A folder as it is compared: without the slash a path may end in.
const bare = (p) => (p ?? "").replace(/(.)[\\/]+$/, "$1");
// Whether two of them are one place: a closed project and another, or one that is open.
const same = (a, b) => (a.machine ?? null) === (b.machine ?? null) && a.name === b.name && bare(a.folder) === bare(b.folder);

// Whether every machine's projects are in Herdr's list. While a machine is out of reach its
// projects are only missing, so what is kept for a project (its hue, its fold in the rail)
// is not forgotten yet.
const settled = () => machines().every((k) => k.layout === "ready");

const NAMES = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
const HUE = { ansi6: "#94e2d5", ansi3: "#f9e2af", ansi4: "#b4befe", ansi5: "#cba6f7", ansi2: "#89dceb", ansi1: "#f5c2e7" };

function hues(sp) {
  const all = shared("space.colors") ?? {};
  const ids = new Set(sp.map((s) => s.id));
  // Forget closed projects' hues, once every machine's projects are in: a project that is
  // only missing should come back in the hue it had.
  const kept = settled() ? Object.fromEntries(Object.entries(all).filter(([id]) => ids.has(id))) : { ...all };
  let changed = Object.keys(kept).length !== Object.keys(all).length;
  for (const s of sp) {
    if (kept[s.id] || s.name === "~") continue;
    // A project made where a closed one was, on its machine, gets the hue that one had:
    // one opened again from the list of closed projects comes back as it looked.
    const had = past().find((e) => e.hue && (e.machine ?? null) === (s.machine ?? null) && bare(e.folder) === bare(s.folder))?.hue;
    const uses = (c) => Object.values(kept).filter((v) => v === c).length;
    kept[s.id] = had ?? NAMES.reduce((best, c) => (uses(c) < uses(best) ? c : best));
    changed = true;
  }
  if (changed) setShared("space.colors", kept);
  // `of`: a project's color. `name`: that color as it is kept, or null for a project without one.
  return { of: (id) => shadeOf(kept[id]) ?? HUE.ansi6, name: (id) => kept[id] ?? null };
}
// A hue as it is kept ("ansi5", or a color written out) as a color, or null.
export const shadeOf = (c) => (!c ? null : c.startsWith("#") ? c : HUE[c] ?? null);

// What this computer is called where the others go by their names.
export const here = () => (win()?.platform === "macos" ? "This Mac" : "This computer");

// Every machine herdr-core knows (`hc machine ls`): its name, whether it can be reached,
// and how ssh reaches it. Null when the list can't be had.
export async function fleet() {
  try {
    const r = await hc(["machine", "ls", "--json"]);
    if (r.code !== 0) return null;
    return (JSON.parse(r.stdout).machines ?? []).map((k) => ({ name: k.name, state: k.state, temporary: Boolean(k.temporary), target: k.target ?? null, via: Boolean(k.via) }));
  } catch {
    return null;
  }
}

// How quick another machine is to answer: a small program is run there through herdr-core's
// own connection, and timed. PING.run: the program, one that macOS, Linux and Windows all
// have (`true` is no program on Windows, and one that can't start counts as no answer).
// PING.every: ms from one asking to the next. PING.wait: ms after which it has not answered.
export const PING = { every: 10000, wait: 5000, run: "whoami" };
// The ms one answer took, or null when none came in time.
export async function ping(name) {
  const at = Date.now();
  try {
    await exec(PING.run, [], { on: name, timeout: PING.wait });
  } catch {
    return null;
  }
  const ms = Date.now() - at;
  return ms < PING.wait ? ms : null;
}
// What a machine's last answers (newest last, null for none in time) come to: the middle one
// of the last three, so one slow or lost answer changes nothing and two do.
//   lit: how many of four bars, as a phone shows its signal. None before any answer.
//   bad: over a second, or not answering.
//   text: the time as the rail writes it ("38ms", "270ms", "1.4s"), "" without one.
export function reach(answers = []) {
  const last = answers.slice(-3).map((ms) => ms ?? Infinity).sort((a, b) => a - b);
  if (!last.length) return { lit: 0, bad: false, text: "" };
  const ms = last[Math.floor((last.length - 1) / 2)];
  if (ms === Infinity) return { lit: 1, bad: true, text: "" };
  // To the millisecond under 100, to ten above: a time that small changes say nothing about.
  const round = ms < 100 ? Math.round(ms) : Math.round(ms / 10) * 10;
  return {
    lit: ms <= 100 ? 4 : ms <= 400 ? 3 : ms <= 1000 ? 2 : 1,
    bad: ms > 1000,
    text: round < 1000 ? `${round}ms` : `${(ms / 1000).toFixed(1)}s`,
  };
}

// Home as ~, on this machine or another: /Users/me, /home/me, /root, C:\Users\me.
export const tilde = (p) => (p ?? "").replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, "~").replace(/^\/root(?=\/|$)/, "~")
  .replace(/^[A-Za-z]:[\\/]Users[\\/][^\\/]+(?=[\\/]|$)/, "~");
// The way down to a folder: its parts from the top, home as "~", and the slash its machine
// writes between them. A Windows path ("C:\work\api", "~\api", "\\box\share") is cut at
// either slash. Any other is cut at "/" only: there a "\" can be part of a name.
export function way(p) {
  const path = tilde(p);
  const windows = /^(?:[A-Za-z]:[\\/]|\\\\|~\\)/.test(path);
  return { parts: (windows ? path.split(/[\\/]+/) : path.split("/")).filter(Boolean), slash: windows ? "\\" : "/" };
}

// Agents print a status glyph (a spinner, a star) before their title.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}~/]+/u, "").trim();
const push = (map, key, value) => (map.get(key) ?? map.set(key, []).get(key)).push(value);
// Whether a word only repeats its program ("Codex"): the logo says that already.
const echoes = (program, w) => [program?.name, program?.key].some((p) => p && p.toLowerCase() === w.toLowerCase());
// What a terminal's own title tells that its logo and its project's tile don't, or "".
// Some agents end theirs with " | <project>" or " | <the folder they are in>" (`names`).
// Words that only repeat the program, a folder or a user@host tell nothing, and a terminal
// nobody titled is called by its address ("t7", "alpha/t7").
function telling(whole, address, program, names) {
  const tail = names.map((n) => ` | ${n}`.toLowerCase()).find((x) => whole.toLowerCase().endsWith(x));
  const said = tail ? whole.slice(0, -tail.length).trim() : whole;
  const unset = said === address || said === address.split("/").pop();
  return said && !unset && !echoes(program, said) && !/^[~/]|^[A-Za-z]:\\/.test(said) && !said.includes("@") ? said : "";
}

// A tab's own title shows once it has stayed STEADY ms. A shell titles itself after the
// command it runs, so `ls`, `cd` or `clear` would put their name on the tab for a moment and
// make the bar's tabs jump. So nothing shows for less than that. A tab seen for the first
// time shows its title at once, and a name someone gave a tab is not held.
const STEADY = 500;
const steady = new Map(); // tab id -> { shown, next, since }: `next` waits to show, undefined when none does
let ripened = 0;          // how many held titles have come to show
function ripen(h, now) {
  if (h.next === undefined || now - h.since < STEADY) return;
  h.shown = h.next;
  h.next = undefined;
  ripened += 1;
}
function hold(id, said, now) {
  const h = steady.get(id);
  if (!h) {
    steady.set(id, { shown: said, next: undefined, since: 0 });
    return said;
  }
  if (said === h.shown) h.next = undefined;
  else if (said !== h.next) Object.assign(h, { next: said, since: now });
  ripen(h, now);
  return h.shown;
}
// Whether a held title came to show after a part drew with `seen` (what ripeness() said
// then), so that the part has to draw again. Nothing else may change when one comes to
// show, so the parts that show titles ask this on a timer.
export function ripe(seen) {
  const now = Date.now();
  for (const h of steady.values()) ripen(h, now);
  return ripened !== seen;
}
export const ripeness = () => ripened;

export function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// machineInfo: fleet() (the rail and the transfer window poll it), for machines without
// projects and for whether each can be reached. Others pass nothing.
export function model(machineInfo = []) {
  const sp = spaces(), ps = panes(), terms = terminals();
  const now = Date.now(), alive = new Set(); // the tabs there are, for the titles held (hold)
  const hue = hues(sp);
  const kept = shared(BLANK) ?? {};
  const termBy = new Map(), kids = new Map(), byTab = new Map(), paned = new Set();
  for (const x of terms) {
    termBy.set(x.address, x);
    if (x.parent && x.state === "live") push(kids, x.parent, x);
  }
  for (const p of ps) {
    push(byTab, p.tab, p);
    if (p.terminal) paned.add(p.terminal);
  }
  // Every live sub-agent under a terminal, however deep, each right after the one that
  // started it. One that was given a pane (terminal.keep) is not among them: it shows as
  // that pane, in whichever tab, and what it started is listed there.
  const below = (s, address, depth = 1) => (kids.get(address) ?? []).flatMap((k) => (paned.has(k.address) ? [] : [sub(s, k, depth), ...below(s, k.address, depth + 1)]));
  // A sub-agent as a line under its tab shows it. It goes by the name it was started
  // with, else by what it says it is doing, else by its program.
  const sub = (s, k, depth) => {
    const own = telling(clean(k.report?.title), k.address, k.program, [s.name, ...way(k.cwd).parts]);
    return {
      id: k.address, depth, program: k.program ?? null, own,
      // It reports to its parent: its "done" is not news, its error is.
      status: k.status === "error" ? "blocked" : k.status === "done" ? "idle" : k.status ?? null,
      label: k.name || own || k.template || k.program?.name || k.address,
    };
  };

  const tab = (s, c) => {
    const mine = byTab.get(c.id) ?? [];
    // A project's empty page: every pane it has is this mod.
    const blank = mine.length > 0 && mine.every((p) => !p.terminal && p.mod === "glyph");
    // Closing it would end more than a plain shell (an agent, a running program, or panes
    // not heard of yet), so a close is asked for twice.
    const careful = !blank && (mine.length === 0 || mine.some((p) => p.terminal && !p.program?.shell));
    // The pane that speaks for the tab: its most urgent agent, else its first terminal.
    let lead = null;
    for (const p of mine) {
      if (!p.terminal) continue;
      const agent = Boolean(p.program?.agent), had = Boolean(lead?.program?.agent);
      if (!lead || (agent && !had) || (agent === had && rank(p.status) > rank(lead.status))) lead = p;
    }
    // The tab's state is Herdr's: the most urgent of the agents in its panes. Its sub-agents
    // leave it alone, as in Herdr, which sends no notice for one either: a sub-agent reports
    // to the agent that started it. Their rows and the dot on the tab's orb show them.
    const status = c.status ?? null;
    // `list` is what the rail's lines show; `count` and `status` are the orb's dot.
    const subs = { count: 0, status: null, list: [] };
    for (const p of mine) if (p.terminal) subs.list.push(...below(s, p.terminal));
    subs.count = subs.list.length;
    for (const k of subs.list) if (rank(k.status) > rank(subs.status)) subs.status = k.status;
    const term = lead ? termBy.get(lead.terminal) : null;
    const path = way(lead?.cwd).parts;
    const folder = path[path.length - 1] ?? "";
    const own = hold(c.id, telling(clean(term?.report?.title) || clean(lead?.title), lead?.terminal ?? "", lead?.program, [s.name, ...path]), now);
    alive.add(c.id);
    const named = c.named && !echoes(lead?.program, c.name);
    const title = named ? c.name : own;
    return {
      id: c.id, index: c.index, name: c.name, named, active: c.active, shown: s.active && c.active,
      status, subs, lead, program: lead?.program ?? null, panes: mine.length, zoomed: c.zoomed,
      blank, careful, cwd: lead?.cwd ?? null,
      // Put away on this screen (tab.settle): Herdr's own steps through the tabs skip it.
      settled: Boolean(c.settled),
      // `title` is what it goes by: the name someone gave it (`given`), else what its
      // agent calls it (`own`), else nothing.
      title, own, given: c.named ? c.name : "",
      // What a list calls it: its title, else the folder it is in when that is not simply
      // the project's, else its program.
      label: title || (folder && folder !== s.name ? folder : "") || lead?.program?.name || `Tab ${c.index}`,
      changedAt: c.changed_at ?? null, workingSince: c.working_since ?? null,
    };
  };

  const list = sp.map((s) => {
    // `label` is the name as written out: a lone "~" reads as Home, like its tile's house.
    const m = { id: s.id, index: s.index, name: s.name, label: s.name === "~" ? "Home" : s.name, machine: s.machine ?? null, branch: s.branch ?? null, folder: s.folder ?? "", active: s.active, hue: hue.of(s.id), shade: hue.name(s.id), named: Boolean(s.named), tabs: [] };
    const all = (s.tabs ?? []).map((c) => ({ ...tab(s, c), space: m }));
    // `tabs` is what the lists show; an empty page is not one of them.
    m.tabs = all.filter((c) => !c.blank);
    m.blanks = all.filter((c) => c.blank);
    m.empty = m.blanks.length > 0 && m.tabs.length === 0;
    // With no terminal left Herdr calls the project after the folder it was made in.
    const was = m.empty ? kept[s.id] : null;
    if (was?.name) {
      m.name = was.name;
      m.label = was.name === "~" ? "Home" : was.name;
    }
    return m;
  });
  for (const id of steady.keys()) if (!alive.has(id)) steady.delete(id);

  // This computer first, then the others by name, the order Herdr keeps spaces in, unless
  // the rail's drag has put the machines in another (ORDER). A machine's projects stay in
  // Herdr's order, which the drag changes with space.move.
  const names = new Set([null]);
  for (const s of list) names.add(s.machine);
  for (const k of machines()) names.add(k.name ?? null);
  for (const k of machineInfo) names.add(k.name);
  const ordered = arrange([...names].sort((a, b) => (a === null ? -1 : b === null ? 1 : a.localeCompare(b))), shared(ORDER));
  const layouts = new Map(machines().map((k) => [k.name ?? null, k.layout]));
  const groups = ordered.map((name) => {
    const info = machineInfo.find((k) => k.name === name);
    // connected | needs_login | loading | away (asleep, unreachable, ...)
    const state = name === null ? "connected"
      : info ? (info.state === "connected" || info.state === "needs_login" ? info.state : "away")
      : layouts.get(name) === "ready" ? "connected" : layouts.get(name) === "unavailable" ? "away" : "loading";
    return { name, state, why: info?.state ?? null, spaces: list.filter((s) => s.machine === name) };
  });

  const flat = groups.flatMap((g) => g.spaces.flatMap((s) => s.tabs));
  const counts = { blocked: 0, done: 0, working: 0, idle: 0, total: 0 };
  for (const c of flat) if (c.status in counts) { counts[c.status] += 1; counts.total += 1; }
  return { groups, spaces: list, flat, counts, active: list.find((s) => s.active) ?? null, remote: ordered.length > 1, settled: settled() };
}

// The folder a project is in, on its machine: where its shown tab is, else another of its
// tabs, else where it was left (an empty page) or made. "" is that machine's home.
export function placeOf(s) {
  return s.tabs.find((c) => c.active)?.cwd ?? s.tabs.find((c) => c.cwd)?.cwd ?? (shared(BLANK)?.[s.id]?.folder || s.folder || "");
}

// Go to a tab wherever it is.
export function goTab(c) {
  if (c.lead?.pane) run("pane.focus", { pane: c.lead.pane });
  else {
    run("space.select", { id: c.space.id });
    run("tab.select", { id: c.id });
  }
}

// Look at a sub-agent: it has no pane, so in Herdr's peek, over the shown tab.
export function goSub(k) {
  run("terminal.peek", { terminal: k.id });
}

// The program a new plain terminal runs, as a shell tab shows it: asked of one that is open,
// since the table is Herdr's.
export function shell() {
  return terminals().find((x) => x.program?.shell && x.program.icon)?.program ?? SHELL;
}

// Starts a tab in a project: a plain terminal, or an agent (one of knownAgents()). A new tab
// starts where the focused terminal is; a project showing its empty page has none, so there
// it starts where the project's last tab was.
export function newTab(s, agent) {
  const args = { space: s?.id };
  if (agent) args.argv = agent.run;
  const was = s?.empty ? shared(BLANK)?.[s.id] : null;
  if (was?.folder) args.folder = was.folder;
  run("tab.new", args);
}

// Closes a tab for good: whoever calls has made sure already. The bar does the closing,
// because it may have to wait: it shows the tab before it, or the project's empty page,
// before the tab goes, so closing never lands you in another project.
export function closeTab(id) {
  setShared(SHUT, { id, at: Date.now() });
  run("glyph.shut");
}

// The key bound to the first of these commands that has one, written as the system writes
// it ("⇧⌘C", "Ctrl+Shift+A"), or "".
export function keyFor(...names) {
  const all = keys() ?? [];
  const mac = win()?.platform === "macos";
  const sign = mac ? { ctrl: "⌃", alt: "⌥", shift: "⇧", cmd: "⌘" } : { ctrl: "Ctrl", alt: "Alt", shift: "Shift", cmd: "Super" };
  // Herdr reads `secondary` as cmd on a Mac and ctrl elsewhere, and `super` and `win` as cmd.
  const alias = { secondary: mac ? "cmd" : "ctrl", super: "cmd", win: "cmd" };
  const strokes = (text) => text.trim().split(/\s+/).map((stroke) => {
    const parts = stroke.split("-");
    let key = parts.pop();
    if (key === "") { key = "-"; parts.pop(); }
    return { key, held: new Set(parts.map((x) => alias[x.toLowerCase()] ?? x.toLowerCase())) };
  });
  // keys.json binds most commands twice: with ⌘ for macOS, and without it for Linux and
  // Windows, where cmd is the Super key. Each system shows its own.
  const fits = (s) => s.some((x) => x.held.has("cmd")) === mac;
  for (const name of names) {
    const found = all.filter((b) => b.action === name && (b.section === "layout:glyph" || b.section === "global") && b.keys?.trim()).map((b) => strokes(b.keys));
    const s = found.find(fits) ?? found[0];
    if (!s) continue;
    return s.map(({ key, held }) => {
      const label = key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1);
      return [...Object.keys(sign).filter((x) => held.has(x)).map((x) => sign[x]), label].join(mac ? "" : "+");
    }).join(" ");
  }
  return "";
}

// A hover label with the key that does the same, when there is one.
export const withKey = (tip, key) => (key ? `${tip}  ${key}` : tip);
// A hint of more than one sentence: its parts, each without its own full stop, joined as
// sentences. Short facts within a part are joined with commas.
export const says = (...parts) => parts.filter(Boolean).map((p) => String(p).replace(/[.\s]+$/, "")).join(". ");

// A tab's right-click menu (menu.js).
export function tabMenu(c) {
  openOverlay({ mod: "glyph", kind: "popup", width: 200, props: { role: "menu", tab: c.id } });
}

// The list you type in to go to a tab (goto.js), where Herdr's own picker opens: under the
// window's top edge. Asked for again while it shows, it closes, as Herdr's own does.
// `going` is the overlay of the list on show. It is the list that says when it comes and
// goes (shownGoto, goneGoto), and the bar that asks: copies of a mod share its modules.
let going = null;
export function openGoto() {
  if (going) closeOverlay(going);
  else openOverlay({ mod: "glyph", kind: "popup", at: "top", offset: 40, width: 560, height: 0.8, props: { role: "goto" } });
}
export function shownGoto(id) {
  going = id ?? null;
}
export function goneGoto(id) {
  if (going === id) going = null;
}

// What a project with tabs would be listed as if it closed now (PAST). `was` is what was
// noted of it before: an agent stays in `ran` after its last tab has gone, with `n`, the
// most tabs that ran it at one time. Its folder is its first tab's, which is also where
// Herdr takes the name of a project nobody named from.
export function sketch(s, was) {
  const now = new Map();
  for (const c of s.tabs) {
    const p = c.program;
    if (!p?.agent || !p.key) continue;
    const a = now.get(p.key) ?? { key: p.key, name: p.name ?? p.key, icon: p.icon ?? null, tint: Boolean(p.tint), tile: p.tile ?? null, color: p.color ?? null, n: 0 };
    a.n += 1;
    now.set(p.key, a);
  }
  const ran = (was?.ran ?? []).map((a) => {
    const here = now.get(a.key);
    now.delete(a.key);
    return here ? { ...here, n: Math.max(here.n, a.n) } : a;
  });
  ran.push(...now.values());
  return {
    name: s.name, named: s.named, machine: s.machine,
    folder: bare(s.tabs.find((c) => c.cwd)?.cwd ?? was?.folder ?? s.folder),
    hue: s.shade ?? was?.hue ?? null,
    ran: ran.sort((a, b) => b.n - a.n).slice(0, 4),
  };
}

// The row of a closed project that a project with tabs, `s`, stands in the place of: on its
// machine, in its folder and under its name. Its first note starts from that row, so the
// agents it ran stay on it: a project opened again with a plain shell and closed again
// still opens with its agent the next time.
export function former(s) {
  const now = sketch(s);
  return past().find((e) => same(e, now));
}

// The list of closed projects once `closed` have joined it: the last closed first, one
// entry for each place, and none for a project that is `open`, since one opened again is
// no longer closed.
export function shelve(list, closed, open) {
  const all = [...closed, ...list];
  return all.filter((e, i) => all.findIndex((x) => same(x, e)) === i && !open.some((o) => same(o, e))).slice(0, PAST_MOST);
}

// Opens a closed project again: on its machine, in its folder, under the name it was given
// (one nobody named is called after its folder again). Its first tab runs `agent`, one of
// knownAgents(), or a plain terminal. Its entry goes once the project is there (shelve).
export function reopen(e, agent) {
  const args = { machine: e.machine ?? "" };
  if (e.folder) args.folder = e.folder;
  if (e.named) args.name = e.name;
  if (agent) args.argv = agent.run;
  run("space.new", args);
}

// Takes a closed project off the list.
export function forget(e) {
  setShared(PAST, past().filter((x) => !same(x, e)));
}

// The list of closed projects (history.js). The rail's button opens it where the pointer
// is, as a menu opens, and its key (`top`) where the Go-to list opens. Asked for again
// while it shows, it closes. `recalling` is the overlay of the list on show, which the list
// itself tells of as it comes and goes, as the Go-to list does.
let recalling = null;
export function openHistory(top) {
  if (recalling) closeOverlay(recalling);
  else openOverlay({ mod: "glyph", kind: "popup", ...(top ? { at: "top", offset: 40 } : {}), width: 440, height: 0.8, props: { role: "history" } });
}
export function shownHistory(id) {
  recalling = id ?? null;
}
export function goneHistory(id) {
  if (recalling === id) recalling = null;
}

// Asks for a tab's name in Herdr's own dialog, with what an empty name means here: an
// unnamed tab goes by what its agent says it is doing, not by its number.
export function renameTab(c) {
  const own = c.own.length > 30 ? `${c.own.slice(0, 29)}…` : c.own;
  openOverlay({
    mod: "prompt", kind: "dialog", width: 380,
    props: {
      title: "rename tab", value: c.given,
      hint: own ? `empty: its agent's own title, "${own}"` : "empty: no title, just its logo",
      command: { name: "tab.rename", args: { id: c.id } },
    },
  });
}

// The list of the tabs in one state (wants.js) that the bar's bell (blocked) and tick (done)
// open. It hangs under the bar, centered on `x`, where the pill was pressed (the window's
// pixels), and Herdr moves it to fit the window. `wanting` is the list on show,
// { id, status }, which the list itself tells of as it comes and goes, as the Go-to list
// does. `wanted` is the one that went last, and when: see wantsShown().
const WANTS_W = 380;
let wanting = null, wanted = null;
export function openWants(status, x) {
  if (wanting) closeOverlay(wanting.id);
  const zoom = settings()?.zoom || 1;
  openOverlay({ mod: "glyph", kind: "popup", at: { x: Math.max(0, x - (WANTS_W / 2) * zoom), y: 40 * zoom }, width: WANTS_W, height: 0.8, props: { role: "wants", status } });
}
export function closeWants() {
  if (wanting) closeOverlay(wanting.id);
}
// Whether the list of that state is on show, or was until a moment ago. Herdr closes a
// popup at a press beside it, the press on its own pill too, and that may reach the list
// (its close()) before or after it reaches the pill: either way the press found it on show.
export function wantsShown(status) {
  return wanting?.status === status || (wanted?.status === status && Date.now() - wanted.at < 400);
}
export function shownWants(id, status) {
  wanting = id ? { id, status } : null;
}
// `self`: the list closed itself (a row was picked, Esc), which no press on a pill did.
export function goneWants(id, self) {
  if (wanting?.id !== id) return;
  if (!self) wanted = { status: wanting.status, at: Date.now() };
  wanting = null;
}

// Marks finished tabs as read, on every Herdr that shows them, the way Herdr does for an
// agent a person looks at: herdr-core keeps a label on each terminal, `herdr.seen`, the last
// of its turns someone saw, and Herdr calls a terminal that has stopped working "done" while
// its turn is past that (herdr-app's docs/labels.md). Each agent of those tabs, their
// sub-agents too, that is resting with a turn past its label gets the label raised to its
// turn. Nothing else is written, and a label is never lowered. A terminal whose turn the
// listing lacks is asked for it. Resolves with the tabs that could not all be marked.
const BUSY = new Set(["working", "blocked", "error"]);
export async function markRead(tabs) {
  const owner = new Map(); // terminal address -> its tab
  for (const p of panes()) {
    const c = p.terminal && tabs.find((x) => x.id === p.tab);
    if (c) owner.set(p.terminal, c);
  }
  for (const c of tabs) for (const k of c.subs.list) owner.set(k.id, c);
  const known = new Map(terminals().map((x) => [x.address, x]));
  const failed = new Set();
  await Promise.all([...owner].map(async ([address, c]) => {
    try {
      let rec = known.get(address);
      if (typeof rec?.turn !== "number") rec = JSON.parse((await hc(["get", address, "--json"])).stdout);
      const word = typeof rec?.status === "string" ? rec.status : rec?.status?.state;
      const turn = rec?.turn, said = rec?.labels?.["herdr.seen"];
      if (typeof turn !== "number") throw new Error("no turn");
      if (!word || BUSY.has(word) || turn < 1 || (said != null && Number(said) >= turn)) return;
      const r = await hc(["label", address, `herdr.seen=${turn}`]);
      if (r.code !== 0) throw new Error(r.stderr);
    } catch {
      failed.add(c);
    }
  }));
  return [...failed];
}

// Since when a tab has been in its state. `seen` is the rail's own record, for after
// a restart (the app's tab times start empty then).
export function since(c, seen) {
  return (c.status === "working" ? c.workingSince : null) ?? c.changedAt ?? seen?.[c.id]?.at ?? null;
}

// The tabs of a status line in the order their beads stand in: those that need you, the
// finished, the working, the idle. Within a state they keep the order they were given in,
// which is the rail's, top to bottom: an order by time looked random, since nothing on a
// bead says how long it has waited. A tab without a state has no bead.
export function lineUp(tabs) {
  return tabs.filter((c) => c.status in RANK)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => RANK[b.c.status] - RANK[a.c.status] || a.i - b.i)
    .map((x) => x.c);
}

// The words a logo stands for, on hover: what it is, where, and how it is doing.
export function tabTip(c, now, seen) {
  const what = c.title || c.program?.name || `Tab ${c.index}`;
  const where = c.space.label + (c.space.machine ? ` @ ${c.space.machine}` : "");
  const at = since(c, seen);
  const ago = at ? ` ${duration(now - at)}` : "";
  const how = c.status === "blocked" ? "needs you" : c.status === "done" ? "finished" : c.status === "working" ? `working${ago}` : c.status === "idle" ? `idle${ago}` : "";
  const subs = c.subs.count ? `${c.subs.count} sub-agent${c.subs.count === 1 ? "" : "s"}` : "";
  return [what, where, how, subs].filter(Boolean).join(", ");
}

// A sub-agent's words: its name, what it says it is doing, and how it is doing.
export function subTip(k) {
  const how = k.status === "blocked" ? "needs you" : k.status === "working" ? "working" : k.status === "idle" ? "idle" : "";
  return [k.label, k.own !== k.label ? k.own : "", how].filter(Boolean).join(", ");
}

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}
