// What the parts draw from: Herdr's live lists, read once per render and shaped into
// machines > projects (spaces) > tabs. A tab is the unit you go to: it shows its lead
// program's logo and the most urgent state of its agents and their sub-agents.
// Below that, what the parts do alike: go to a tab, start one, close one, rename one.

import { spaces, panes, terminals, machines, shared, setShared, run, openOverlay, keys, window as win } from "herdr";
import { SHELL } from "./ui.js";

export const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
const rank = (s) => RANK[s] ?? 0;

// Project hues. The names are the ones the shipped Spaces list stores in shared
// "space.colors", so a project keeps its place on the wheel in every layout; the colors
// stay clear of the three that mean something (working, needs you, finished).
// A project whose last tab was closed keeps showing, as an empty page (blank.js): a tab
// whose only pane is this mod. Shared BLANK remembers, by project id, what the page can't
// tell any more with no terminal left: the project's name and the folder its tabs were in.
export const BLANK = "glyph.blank";
// How closing a tab is asked of the bar (see closeTab): shared SHUT names the tab.
export const SHUT = "glyph.shut";
// ms a first close press waits for the second.
export const ARM = 3000;

const NAMES = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
const HUE = { ansi6: "#94e2d5", ansi3: "#f9e2af", ansi4: "#b4befe", ansi5: "#cba6f7", ansi2: "#89dceb", ansi1: "#f5c2e7" };

function hues(sp) {
  const all = shared("space.colors") ?? {};
  const ids = new Set(sp.map((s) => s.id));
  // Forget closed projects' hues, but not while a machine is still out of reach:
  // its projects are only missing, and should come back in the hue they had.
  const settled = machines().every((k) => k.layout === "ready");
  const kept = settled ? Object.fromEntries(Object.entries(all).filter(([id]) => ids.has(id))) : { ...all };
  let changed = Object.keys(kept).length !== Object.keys(all).length;
  for (const s of sp) {
    if (kept[s.id] || s.name === "~") continue;
    const uses = (c) => Object.values(kept).filter((v) => v === c).length;
    kept[s.id] = NAMES.reduce((best, c) => (uses(c) < uses(best) ? c : best));
    changed = true;
  }
  if (changed) setShared("space.colors", kept);
  return (id) => {
    const c = kept[id] ?? "ansi6";
    return c.startsWith("#") ? c : HUE[c] ?? HUE.ansi6;
  };
}

// Home as ~, on this machine or another.
export const tilde = (p) => (p ?? "").replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, "~").replace(/^\/root(?=\/|$)/, "~");

// Agents print a status glyph (a spinner, a star) before their title.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}~/]+/u, "").trim();
const push = (map, key, value) => (map.get(key) ?? map.set(key, []).get(key)).push(value);

export function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// machineInfo: `hc machine ls` (the rail polls it), for machines without projects and
// for whether each can be reached. Others pass nothing.
export function model(machineInfo = []) {
  const sp = spaces(), ps = panes(), terms = terminals();
  const hue = hues(sp);
  const kept = shared(BLANK) ?? {};
  const termBy = new Map(), kids = new Map(), byTab = new Map();
  for (const x of terms) {
    termBy.set(x.address, x);
    if (x.parent && x.state === "live") push(kids, x.parent, x);
  }
  for (const p of ps) push(byTab, p.tab, p);
  // Every live sub-agent under a terminal, however deep.
  const below = (address, seen = new Set()) => (kids.get(address) ?? []).flatMap((k) => {
    if (seen.has(k.address)) return [];
    seen.add(k.address);
    return [k, ...below(k.address, seen)];
  });

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
    let status = c.status ?? null;
    const subs = { count: 0, status: null };
    for (const p of mine) {
      if (!p.terminal) continue;
      for (const k of below(p.terminal)) {
        // A sub-agent reports to its parent: its "done" is not news, its error is.
        const st = k.status === "error" ? "blocked" : k.status === "done" ? "idle" : k.status;
        subs.count += 1;
        if (rank(st) > rank(subs.status)) subs.status = st;
      }
    }
    if (rank(subs.status) > rank(status)) status = subs.status;
    const term = lead ? termBy.get(lead.terminal) : null;
    const path = tilde(lead?.cwd).split("/").filter(Boolean);
    const folder = path[path.length - 1] ?? "";
    // Some agents end their title with " | <project>" or " | <the folder they are in>":
    // the tile and the pane's header already say which.
    const whole = clean(term?.report?.title) || clean(lead?.title);
    const tail = [s.name, ...path].map((n) => ` | ${n}`.toLowerCase()).find((x) => whole.toLowerCase().endsWith(x));
    const said = tail ? whole.slice(0, -tail.length).trim() : whole;
    // Words that only repeat the program ("Codex") or the folder say nothing a logo doesn't,
    // and a terminal nobody titled is called by its address ("t7", "alpha/t7").
    const echo = (w) => [lead?.program?.name, lead?.program?.key].some((p) => p && p.toLowerCase() === w.toLowerCase());
    const address = lead?.terminal ?? "";
    const unset = said === address || said === address.split("/").pop();
    const named = c.named && !echo(c.name);
    const telling = said && !unset && !echo(said) && !/^[~/]|^[A-Za-z]:\\/.test(said) && !said.includes("@");
    const own = telling ? said : "";
    const title = named ? c.name : own;
    return {
      id: c.id, index: c.index, name: c.name, named, active: c.active, shown: s.active && c.active,
      status, subs, lead, program: lead?.program ?? null, panes: mine.length, zoomed: c.zoomed,
      blank, careful, cwd: lead?.cwd ?? null,
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
    const m = { id: s.id, index: s.index, name: s.name, label: s.name === "~" ? "Home" : s.name, machine: s.machine ?? null, branch: s.branch ?? null, active: s.active, hue: hue(s.id), tabs: [] };
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

  // This computer first, then the others by name: the order Herdr keeps spaces in.
  const names = new Set([null]);
  for (const s of list) names.add(s.machine);
  for (const k of machines()) names.add(k.name ?? null);
  for (const k of machineInfo) names.add(k.name);
  const ordered = [...names].sort((a, b) => (a === null ? -1 : b === null ? 1 : a.localeCompare(b)));
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
  return { groups, spaces: list, flat, counts, active: list.find((s) => s.active) ?? null, remote: ordered.length > 1 };
}

// Go to a tab wherever it is.
export function goTab(c) {
  if (c.lead?.pane) run("pane.focus", { pane: c.lead.pane });
  else {
    run("space.select", { id: c.space.id });
    run("tab.select", { id: c.id });
  }
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
// it ("⇧⌘C"), or "".
export function keyFor(...names) {
  const all = keys() ?? [];
  const mac = win()?.platform === "macos";
  const sign = mac ? { ctrl: "⌃", alt: "⌥", shift: "⇧", cmd: "⌘" } : { ctrl: "Ctrl", alt: "Alt", shift: "Shift", cmd: "Super" };
  for (const name of names) {
    const k = all.find((b) => b.action === name && (b.section === "layout:glyph" || b.section === "global"));
    if (!k?.keys?.trim()) continue;
    return k.keys.trim().split(/\s+/).map((stroke) => {
      const parts = stroke.split("-");
      let key = parts.pop();
      if (key === "") { key = "-"; parts.pop(); }
      const held = new Set(parts.map((x) => x.toLowerCase()));
      const label = key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1);
      return [...Object.keys(sign).filter((x) => held.has(x)).map((x) => sign[x]), label].join(mac ? "" : "+");
    }).join(" ");
  }
  return "";
}

// A hover label with the key that does the same, when there is one.
export const withKey = (tip, key) => (key ? `${tip}  ${key}` : tip);

// A tab's right-click menu (menu.js).
export function tabMenu(c) {
  openOverlay({ mod: "glyph", kind: "popup", width: 200, props: { role: "menu", tab: c.id } });
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

// The next tab in that state after the shown one, around the whole list.
export function jump(m, status) {
  const all = m.flat.filter((c) => c.status === status);
  if (!all.length) return;
  const at = m.flat.findIndex((c) => c.shown);
  goTab(all.find((c) => m.flat.indexOf(c) > at) ?? all[0]);
}

// Since when a tab has been in its state. `seen` is the rail's own record, for after
// a restart (the app's tab times start empty then).
export function since(c, seen) {
  return (c.status === "working" ? c.workingSince : null) ?? c.changedAt ?? seen?.[c.id]?.at ?? null;
}

// The words a logo stands for, on hover: what it is, where, and how it is doing.
export function tabTip(c, now, seen) {
  const what = c.title || c.program?.name || `Tab ${c.index}`;
  const where = c.space.label + (c.space.machine ? ` @ ${c.space.machine}` : "");
  const at = since(c, seen);
  const ago = at ? ` ${duration(now - at)}` : "";
  const how = c.status === "blocked" ? "needs you" : c.status === "done" ? "finished" : c.status === "working" ? `working${ago}` : c.status === "idle" ? `idle${ago}` : "";
  const subs = c.subs.count ? `${c.subs.count} sub-agent${c.subs.count === 1 ? "" : "s"}` : "";
  return [what, where, how, subs].filter(Boolean).join("  ·  ");
}

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}
