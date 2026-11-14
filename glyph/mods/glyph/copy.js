// Copying files from one machine to another: what the transfer window (transfer.js) asks
// for, and what the bar watches over once it is under way.
// A copy is one `scp`, run on this computer in a terminal of herdr-core's that has no pane:
// it goes on when the window or the app closes, has no time limit, and can be peeked at.
// scp reaches a machine the way hc does (its ssh target), and a copy between two other
// machines passes through this computer, so those two need not reach each other.
// Shared COPIES lists the copies under way and the ones that failed. The bar says how each
// one ended (settle): one that went well is forgotten, one that failed stays until dismissed.

import { hc, exec, shared, setShared, notify, openOverlay } from "herdr";
import { tilde, here } from "./data.js";

export const COPIES = "glyph.copies";
// ms a new copy is given to show up among the terminals before it can count as ended.
export const STARTING = 2000;

const text = (e) => String(e?.message ?? e);
export const base = (path) => path.replace(/\/+$/, "").split("/").pop() ?? "";
export const join = (dir, name) => (dir.endsWith("/") ? dir : dir + "/") + name;
export const nameOf = (machine) => machine ?? here();
// What a copy carries, in a few words: its first name, and how many more.
export const what = (c) => c.name + (c.n > 1 ? ` +${c.n - 1}` : "");
const lastLine = (out) => (out ?? "").split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean).pop() ?? "";

// A file's size as a list shows it.
export function bytes(n) {
  const units = ["B", "K", "M", "G", "T"];
  let i = 0, v = n;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return (i === 0 || v >= 10 ? String(Math.round(v)) : v.toFixed(1)) + units[i];
}

// The transfer window: one, floating over the layout; opening it again puts it back where
// it was left, with its left side where you are now.
export function openTransfer() {
  openOverlay({ mod: "glyph", kind: "window", key: "glyph.transfer", width: 880, height: 560, props: { role: "transfer" } });
}

// What a folder holds, asked of its machine's own sh: the folder ("" is home) and home as
// that machine writes them, then each entry's kind and name. Fields end in a NUL, so any
// name gets through. After an empty field comes `ls -l`, read only for the files' sizes.
export const MOST = 1000;
export const LIST = [
  'cd "${1:-$HOME}" || exit 2',
  'printf "%s\\0%s\\0" "$PWD" "$HOME"',
  "n=0",
  "for p in * .[!.]* ..?*; do",
  '  [ -e "$p" ] || [ -L "$p" ] || continue',
  '  if [ -d "$p" ]; then k=d; else k=f; fi',
  '  printf "%s\\0%s\\0" "$k" "$p"',
  `  n=$((n+1)); [ "$n" -gt ${MOST} ] && break`,
  "done",
  'printf "\\0"',
  `LC_ALL=C ls -lnA 2>/dev/null | head -n ${MOST + 100}`,
].join("\n");

// Names in the order a person reads them: whatever their case, and numbers by their value.
// (The app's own compare goes by letter codes: every capital before every small letter.)
function byName(a, b) {
  const x = a.toLowerCase().match(/\d+|\D+/g) ?? [], y = b.toLowerCase().match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    const both = /^\d/.test(x[i]) && /^\d/.test(y[i]);
    return (both ? Number(x[i]) - Number(y[i]) : 0) || (x[i] < y[i] ? -1 : 1);
  }
  return x.length - y.length || (a < b ? -1 : a > b ? 1 : 0);
}

// Folders first, then files; in each, names that start with a dot come last.
export function parse(out) {
  const f = out.split("\0");
  const entries = [];
  let i = 2;
  for (; i + 1 < f.length && f[i] !== ""; i += 2) entries.push({ name: f[i + 1], dir: f[i] === "d", size: null });
  const sizes = new Map();
  for (const line of f.slice(i + 1).join("\0").split("\n")) {
    const m = /^-\S*\s+\d+\s+\d+\s+\d+\s+(\d+)\s+\S+\s+\S+\s+\S+\s(.*)$/.exec(line);
    if (m) sizes.set(m[2], Number(m[1]));
  }
  for (const e of entries) if (!e.dir && sizes.has(e.name)) e.size = sizes.get(e.name);
  const more = entries.length > MOST;
  const dot = (e) => e.name.startsWith(".");
  entries.length = Math.min(entries.length, MOST);
  entries.sort((a, b) => Number(b.dir) - Number(a.dir) || Number(dot(a)) - Number(dot(b)) || byName(a.name, b.name));
  return { path: f[0] ?? "", home: f[1] ?? "", entries, more };
}

// Reads a folder of a machine (null: this computer). Rejects with why it can't be read.
export async function listing(on, path) {
  let r;
  try {
    r = await exec("sh", ["-c", LIST, "glyph", path ?? ""], { on });
  } catch (e) {
    throw new Error(text(e));
  }
  if (r.code !== 0) throw new Error(lastLine(r.stderr).replace(/^.*\bcd: /, "") || "This folder can't be read");
  return parse(r.stdout);
}

// The scp that does a job: { from, paths, to, dir } copies `paths` of machine `from` into
// folder `dir` of machine `to` (null: this computer). `machines` is fleet().
// A source on another machine is matched as a pattern there, so its special letters are
// escaped. scp of OpenSSH 9 or later takes every other path as it is written.
export function scpArgs(job, machines) {
  const host = {}, ports = new Set();
  for (const k of [job.from, job.to]) {
    if (k === null) continue;
    const info = (machines ?? []).find((x) => x.name === k);
    if (!info?.target || info.via) throw new Error(`${k} is not reached over ssh, so scp can't get there`);
    const m = /^(.*):(\d+)$/.exec(info.target);
    host[k] = m ? m[1] : info.target;
    ports.add(m ? m[2] : "");
  }
  if (ports.size > 1) throw new Error("The two machines listen for ssh on different ports");
  const port = [...ports][0];
  const at = (k, path, source) => (k === null ? path : `${host[k]}:${source ? path.replace(/[\\*?[\]{}]/g, "\\$&") : path}`);
  return [
    "scp", "-3", "-r", "-o", "BatchMode=yes", "-o", "ConnectTimeout=20", ...(port ? ["-P", port] : []), "--",
    ...job.paths.map((p) => at(job.from, p, true)),
    at(job.to, join(job.dir, ""), false),
  ];
}

export const copies = () => shared(COPIES) ?? [];
const keep = (list) => setShared(COPIES, list);

// Starts a job and lists it. `one`: it is a single plain file, so scp's percent is its own.
// Rejects when it can't start.
export async function startCopy(job, machines, one = false) {
  const argv = scpArgs(job, machines);
  const r = await hc(["run", "--bg", "--no-parent", "--no-notify", "--json", "--label", "glyph.copy=1", "--", ...argv]);
  let id = null;
  try {
    id = JSON.parse(r.stdout).address;
  } catch {}
  if (r.code !== 0 || !id) {
    let why = lastLine(r.stderr);
    try {
      why = JSON.parse(r.stderr).error.message;
    } catch {}
    throw new Error(why || "hc could not start scp");
  }
  keep([...copies(), { id, from: job.from, to: job.to, dir: job.dir, name: base(job.paths[0]), n: job.paths.length, one, at: Date.now() }]);
  return id;
}

// Forgets a copy and removes what is left of its terminal: a failed one is dismissed.
export function dropCopy(id) {
  keep(copies().filter((c) => c.id !== id));
  hc(["rm", id]).catch(() => {});
}

// How far a copy under way says it is: scp's meter, as its terminal shows it.
export async function meter(id) {
  const r = await hc(["read", id, "--lines", "0"]);
  const line = lastLine(r.stdout).replace(/\s+/g, " ");
  const m = /(\d{1,3})%/.exec(line);
  return { line, pct: m ? Number(m[1]) : null };
}

// A copy whose terminal is no longer live has ended: says how, once. Asked too early (hc
// still has it live), or when hc can't be asked, it does nothing and can be asked again.
export async function settle(c) {
  const r = await hc(["get", c.id, "--json"]);
  let fact = null;
  try {
    fact = JSON.parse(r.stdout);
  } catch {}
  if (!fact?.state) {
    // 3: hc has no such terminal (removed by hand), so there is nothing to tell.
    if (r.code === 3) keep(copies().filter((x) => x.id !== c.id));
    return;
  }
  if (fact.state === "live") return;
  const open = { name: "glyph.transfer" };
  if (fact.exit_code === 0) {
    keep(copies().filter((x) => x.id !== c.id));
    notify({ title: `Copied ${what(c)}`, body: `${nameOf(c.from)} → ${nameOf(c.to)}  ·  ${tilde(c.dir)}`, level: "success", action: open });
    await hc(["rm", c.id]);
    return;
  }
  const out = await hc(["read", c.id, "--lines", "30"]);
  const why = lastLine(out.stdout).slice(0, 240) || `scp ended with ${fact.exit_code === null ? "a signal" : `code ${fact.exit_code}`}`;
  keep(copies().map((x) => (x.id === c.id ? { ...x, failed: why } : x)));
  notify({ title: `Could not copy ${what(c)}`, body: why, level: "error", action: open });
}
