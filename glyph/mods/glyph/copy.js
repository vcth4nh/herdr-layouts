// Copying files from one machine to another: what the transfer window (transfer.js) asks
// for, and what the bar watches over once it is under way.
// A copy is one `scp`, run on this computer in a terminal of herdr-core's that has no pane:
// it goes on when the window or the app closes, has no time limit, and can be peeked at.
// scp reaches a machine the way hc does (its ssh target), and a copy between two other
// machines passes through this computer, so those two need not reach each other.
// Shared COPIES lists the copies under way and the ones that failed. The bar says how each
// one ended (settle): one that went well is forgotten, one that failed stays until dismissed.
// Two other machines can also copy directly to each other, given a password: see hops().

import { hc, exec, shared, setShared, notify, openOverlay, closeOverlay, window as win } from "herdr";
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
// Whether a copy goes from one other machine to another through this computer.
export const through = (c) => c.from !== null && c.to !== null && !c.direct;
// Where a copy goes from and to, and by which way when both are other machines.
export const wayOf = (c) => `${nameOf(c.from)} → ${nameOf(c.to)}${c.direct ? ", direct" : through(c) ? ", through this computer" : ""}`;
const lines = (out) => (out ?? "").split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
const lastLine = (out) => lines(out).pop() ?? "";
// The letters a source on another machine is matched by, as a pattern, over there.
const PATTERN = /[\\*?[\]{}]/g;

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

// The transfer window: one, floating over the layout. It opens where it was left, with its
// left side where you are now. Asked for again while it shows, it closes, as the Go-to
// list does. `shown` is the overlay of the window on show: the window says when it comes
// and goes (shownTransfer, goneTransfer), and the bar asks. It is forgotten as the window
// is told to close, so a window that did not hear is opened afresh by the next press.
let shown = null;
export function openTransfer() {
  const id = shown;
  shown = null;
  if (id) closeOverlay(id);
  else openOverlay({ mod: "glyph", kind: "window", key: "glyph.transfer", width: 880, height: 560, props: { role: "transfer" } });
}
// For a notice that was clicked: the window, opened unless it shows already.
export function showTransfer() {
  if (!shown) openTransfer();
}
export function shownTransfer(id) {
  shown = id ?? null;
}
export function goneTransfer(id) {
  if (shown === id) shown = null;
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
export const NO_SH = "Folders are read with sh, which this Windows computer lacks";
export async function listing(on, path) {
  let r;
  try {
    r = await exec("sh", ["-c", LIST, "glyph", path ?? ""], { on });
  } catch (e) {
    // A Windows computer has no sh unless someone installed one: say that, not Herdr's
    // words for a program that could not start.
    throw new Error(on === null && win()?.platform === "windows" ? NO_SH : text(e));
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
  const at = (k, path, source) => (k === null ? path : `${host[k]}:${source ? path.replace(PATTERN, "\\$&") : path}`);
  return [
    "scp", "-3", "-r", "-o", "BatchMode=yes", "-o", "ConnectTimeout=20", ...(port ? ["-P", port] : []), "--",
    ...job.paths.map((p) => at(job.from, p, true)),
    at(job.to, join(job.dir, ""), false),
  ];
}

// Directly from one machine to another, not through this computer. No machine is given a
// standing way into another: the copy is one scp started on one of the two (`hc run --on`),
// which asks for the other's password on its terminal, where the window types the one it
// was given for that copy. That scp reads none of its machine's ssh settings, tries no key
// and no agent, shares no connection, and takes the other machine for itself only by the
// host key this computer has on record for it.
const sealed = (pin) => [
  "-F", "none", "-o", "StrictHostKeyChecking=yes", "-o", "UserKnownHostsFile=/dev/null", "-o", "GlobalKnownHostsFile=/dev/null",
  "-o", `KnownHostsCommand=/bin/echo * ${pin}`, "-o", "PubkeyAuthentication=no", "-o", "IdentityAgent=none",
  "-o", "PreferredAuthentications=password,keyboard-interactive", "-o", "ControlMaster=no", "-o", "ControlPath=none",
];
// The number this computer finds for a name, asked of whichever of the two is there.
const FIND = 'getent hosts "$1" 2>/dev/null || dscacheutil -q host -a name "$1" 2>/dev/null';
// ms what was learned about a target is kept.
const FRESH = 600000;
const REACHED = new Map();

// How this computer's ssh gets to a machine, from its target as hc has it: the user, the
// name and the port ssh ends up with, the addresses another machine could try for it (that
// name, and the number this computer finds for it), and its host key on record here.
export async function reach(target) {
  const was = REACHED.get(target);
  if (was && Date.now() - was.at < FRESH) return was.fact;
  const m = /^(.*):(\d+)$/.exec(target);
  const g = await exec("ssh", ["-G", ...(m ? ["-p", m[2]] : []), "--", m ? m[1] : target]);
  const conf = {};
  for (const line of g.stdout.split("\n")) {
    const i = line.indexOf(" ");
    if (i > 0 && !(line.slice(0, i) in conf)) conf[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  if (g.code !== 0 || !conf.hostname) throw new Error(lastLine(g.stderr) || "ssh did not say how it gets there");
  const name = conf.hostname, port = conf.port ?? "22";
  const known = conf.hostkeyalias ?? (port === "22" ? name : `[${name}]:${port}`);
  let pin = null;
  for (const file of `${conf.userknownhostsfile ?? ""} ${conf.globalknownhostsfile ?? ""}`.split(/\s+/).filter(Boolean)) {
    const k = await exec("ssh-keygen", ["-F", known, "-f", file]).catch(() => null);
    // A line of known_hosts: the names, the kind of key, the key.
    const keys = (k?.stdout ?? "").split("\n").filter((l) => l && !/^[#@]/.test(l)).map((l) => l.trim().split(/\s+/)).filter((f) => f.length >= 3).map((f) => `${f[1]} ${f[2]}`);
    pin = keys.find((x) => x.startsWith("ssh-ed25519 ")) ?? keys[0] ?? null;
    if (pin) break;
  }
  const addrs = [name];
  if (!/^[\d.]+$/.test(name) && !name.includes(":")) {
    const r = await exec("sh", ["-c", FIND, "glyph", name]).catch(() => null);
    const ip = /\b\d{1,3}(?:\.\d{1,3}){3}\b/.exec(r?.stdout ?? "");
    if (ip) addrs.push(ip[0]);
  }
  const fact = { user: conf.user ?? "", name, port, addrs, pin };
  REACHED.set(target, { at: Date.now(), fact });
  return fact;
}

// Whether scp started on machine `on` would get as far as the other's password prompt.
// That machine's ssh is asked to log in there with nothing to show, and says why it is
// refused: "Permission denied (…password…)" is as far as it can get, and means yes.
async function probe(on, f) {
  if (!f.pin) return { why: "this computer has no host key on record for it" };
  try {
    const v = await exec("ssh", ["-V"], { on, timeout: 15000 });
    const ver = /OpenSSH_(\d+)\.(\d+)/.exec(`${v.stderr}${v.stdout}`);
    if (!ver || Number(ver[1]) < 9) return { why: `its scp is ${ver ? `OpenSSH ${ver[1]}.${ver[2]}` : "not OpenSSH"}, and 9 or later is needed` };
    let last = "";
    for (const addr of f.addrs) {
      const r = await exec("ssh", [...sealed(f.pin), "-n", "-o", "BatchMode=yes", "-o", "ConnectTimeout=6", "-p", f.port, "--", `${f.user}@${addr}`, "true"], { on, timeout: 20000 });
      last = lastLine(r.stderr) || lastLine(r.stdout);
      const m = /Permission denied \(([^)]*)\)/.exec(last);
      if (m) return /password|keyboard-interactive/.test(m[1]) ? { ok: true, addr } : { why: "it takes no password" };
      // Let in with nothing to show: there is nothing to ask a password for.
      if (r.code === 0) return { ok: true, addr };
    }
    return { why: last.replace(/^ssh: /, "") || "no answer" };
  } catch (e) {
    return { why: text(e) };
  }
}

// The two ways files could go directly between machines a and b: scp started on a, logging
// in to b, and the other way round. Each is { on, far } and, when that works, ok with the
// far machine's user, address, port and host key (pin); else `why` it does not.
export async function hops(a, b, machines) {
  const fact = {};
  for (const k of [a, b]) {
    const info = (machines ?? []).find((x) => x.name === k);
    if (!info?.target || info.via) return [a, b].map((on) => ({ on, far: on === a ? b : a, why: `${k} is not reached over ssh` }));
    try {
      fact[k] = await reach(info.target);
    } catch (e) {
      return [a, b].map((on) => ({ on, far: on === a ? b : a, why: text(e) }));
    }
  }
  return Promise.all([[a, b], [b, a]].map(async ([on, far]) => {
    const r = await probe(on, fact[far]);
    return r.ok ? { on, far, ok: true, user: fact[far].user, addr: r.addr, port: fact[far].port, pin: fact[far].pin } : { on, far, why: r.why };
  }));
}

// The way a copy out of machine `from` takes: started where the files are when that machine
// gets to the other (one login, whatever is picked), else on the machine they go to.
export const hopFor = (list, from) => list?.find((h) => h.ok && h.on === from) ?? list?.find((h) => h.ok) ?? null;

// The scp of a direct copy, as it is started on hop.on. The files are there, or come
// from the far machine, where each one is a login of its own.
export function directArgs(job, hop) {
  const far = (path, source) => `${hop.user}@${hop.addr.includes(":") ? `[${hop.addr}]` : hop.addr}:${source ? path.replace(PATTERN, "\\$&") : path}`;
  return [
    "scp", "-r", ...sealed(hop.pin), "-o", "ConnectTimeout=20", "-o", "NumberOfPasswordPrompts=1", "-P", hop.port, "--",
    ...(hop.on === job.from ? [...job.paths, far(join(job.dir, ""), false)] : [...job.paths.map((p) => far(p, true)), join(job.dir, "")]),
  ];
}

export const copies = () => shared(COPIES) ?? [];
const keep = (list) => setShared(COPIES, list);

// Starts a job and lists it. `one`: it is a single plain file, so scp's percent is its own.
// `hop`: directly between the two machines, that way (a copy lists the far machine as
// `direct`); without it, through this computer. Rejects when it can't start.
export async function startCopy(job, machines, one = false, hop = null) {
  const argv = hop ? directArgs(job, hop) : scpArgs(job, machines);
  const r = await hc(["run", ...(hop ? ["--on", hop.on] : []), "--bg", "--no-parent", "--no-notify", "--json", "--label", "glyph.copy=1", "--", ...argv]);
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
  keep([...copies(), { id, from: job.from, to: job.to, dir: job.dir, name: base(job.paths[0]), n: job.paths.length, one, at: Date.now(), ...(hop ? { direct: hop.far } : {}) }]);
  return id;
}

// Types a direct copy's password into scp's prompt, and Enter. It goes to that terminal,
// which does not show it, and nowhere else.
export const feed = (id, secret) => hc(["send", "--force", "--", id, secret]);
// Ends a copy under way: the bar then tells it as failed.
export const endCopy = (id) => hc(["kill", id]);

// Forgets a copy and removes what is left of its terminal: a failed one is dismissed.
export function dropCopy(id) {
  keep(copies().filter((c) => c.id !== id));
  hc(["rm", id]).catch(() => {});
}

// How far a copy under way says it is: scp's meter, as its terminal shows it. `speed` and
// `eta` are scp's own words ("11.2MB/s", and "00:07" before its "ETA"), and `stalled` is
// its "- stalled -", for when nothing has moved in a while. `ask`: it stands at a password
// prompt. `denied`: a login was refused (a file that may not be read says "Permission
// denied" too, without the ways to log in after it).
export async function meter(id) {
  const r = await hc(["read", id, "--lines", "0"]);
  const line = lastLine(r.stdout).replace(/\s+/g, " ");
  const m = /(\d{1,3})%/.exec(line);
  const speed = /(\d+(?:\.\d+)?) ?([KMGT]?B\/s)/.exec(line);
  const eta = /(\d+:\d\d(?::\d\d)?) ETA/.exec(line);
  return {
    line, pct: m ? Number(m[1]) : null, speed: speed ? speed[1] + speed[2] : null, eta: eta ? eta[1] : null, stalled: /- stalled -/.test(line),
    ask: /password[^:]*:$/i.test(line), denied: /Permission denied \(/.test(r.stdout),
  };
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
    // 3: hc has no such terminal (removed by hand), so there is nothing to tell. A machine
    // that can't be asked just now is another matter: its copy stays listed.
    let kind = null;
    try {
      kind = JSON.parse(r.stderr || r.stdout).error.kind;
    } catch {}
    if (r.code === 3 && (kind === null || kind === "not_found")) keep(copies().filter((x) => x.id !== c.id));
    return;
  }
  if (fact.state === "live") return;
  // Dismissed while hc was being asked: there is nothing left to tell.
  const listed = () => copies().some((x) => x.id === c.id);
  const open = { name: "glyph.transfer-show" };
  if (fact.exit_code === 0) {
    if (!listed()) return;
    keep(copies().filter((x) => x.id !== c.id));
    notify({ title: `Copied ${what(c)}`, body: `${wayOf(c)}, into ${tilde(c.dir)}`, level: "success", action: open });
    await hc(["rm", c.id]);
    return;
  }
  const out = await hc(["read", c.id, "--lines", "30"]);
  if (!listed()) return;
  // A login that was refused is why, whatever scp said after it.
  const refused = lines(out.stdout).find((l) => /Permission denied \(|Host key verification failed/.test(l));
  const last = lastLine(out.stdout);
  const why = (c.direct && /Permission denied \(/.test(refused ?? "") ? `${c.direct} did not take the password`
    // Ended while it stood at its prompt: the prompt itself says nothing.
    : !refused && /password[^:]*:$/i.test(last) ? `ended at ${c.direct ? `${c.direct}'s` : "a"} password prompt`
    : (refused ?? last).slice(0, 240))
    || `scp ended with ${fact.exit_code === null ? "a signal" : `code ${fact.exit_code}`}`;
  keep(copies().map((x) => (x.id === c.id ? { ...x, failed: why } : x)));
  notify({ title: `Could not copy ${what(c)}`, body: why, level: "error", action: open });
}
