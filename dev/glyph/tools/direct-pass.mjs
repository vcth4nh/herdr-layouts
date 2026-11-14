// direct-pass.mjs: the mod's own copy.js on the straight way between real machines (run by
// direct-pass.sh, which puts it beside a copy of the mod).
//
//   direct-pass.sh --survey   For every two ssh machines of `hc machine ls` that are
//                             connected: which one gets to the other's password prompt.
//                             Nothing is written anywhere. Each machine tries one login
//                             to each other one, with nothing to log in with, which
//                             their ssh servers record.
//   direct-pass.sh A B        Starts a straight copy from A to B and stops at the password
//                             prompt: no password is typed, so nothing is copied. Then one
//                             with a wrong host key, which must be refused, and a pretend
//                             prompt on the machine scp runs on, which is typed into.
//   direct-pass.sh A B --ask  Asks for the far machine's password on this terminal (not
//                             shown, kept nowhere), then copies files with awkward names
//                             from A to B and back, and compares them.
//
// What it writes is in a folder of its own, /tmp/glyph-direct-pass-N on A and B, removed at
// the end with the terminals it started.
import { execFile } from "node:child_process";
import { fleet } from "./data.mjs";
import { hops, hopFor, reach, startCopy, settle, meter, feed, endCopy, dropCopy, copies, listing } from "./copy.mjs";
import { NOTES } from "./herdr-real.mjs";

const flags = process.argv.slice(2).filter((a) => a.startsWith("--")), [A, B] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ask = flags.includes("--ask"), survey = flags.includes("--survey");
if (!survey && (!A || !B)) { console.log("usage: direct-pass.sh A B [--ask]   or   direct-pass.sh --survey"); process.exit(2); }
let failed = 0, passed = 0;
const ok = (cond, what) => { if (cond) passed++; else failed++; console.log(cond ? "ok  " : "FAIL", what); };
const hc = (...args) => new Promise((resolve) => execFile("hc", args, { maxBuffer: 64 << 20 }, (err, stdout) => resolve({ code: err ? err.code : 0, stdout })));
const on = (m, ...argv) => hc("exec", "--on", m, "--", ...argv);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const says = (h) => (h.ok ? `yes: ${h.on} gets to ${h.user}@${h.addr} port ${h.port}, which takes a password` : `no: ${h.why}`);

const machines = await fleet();
if (survey) {
  const names = (machines ?? []).filter((k) => k.state === "connected" && k.target && !k.via && !k.temporary).map((k) => k.name);
  const pairs = names.flatMap((a, i) => names.slice(i + 1).map((b) => [a, b]));
  for (const list of await Promise.all(pairs.map(([a, b]) => hops(a, b, machines)))) for (const h of list) console.log(`${h.on} -> ${h.far}  ${says(h)}`);
  process.exit(0);
}

// A copy from its start: types the password at each prompt as the window does, once each,
// and never after a login was refused. Ends when the copy is told, or stands at a prompt
// with nothing to type.
const started = [];
async function run(job, hop, secret = null) {
  NOTES.length = 0;
  const id = await startCopy(job, machines, false, hop);
  started.push(id);
  let armed = true, left = secret === null ? 0 : hop.on === job.from ? 1 : job.paths.length, asked = null;
  for (const until = Date.now() + 480000; Date.now() < until && copies().some((c) => c.id === id && !c.failed);) {
    await sleep(300);
    const far = await meter(id).catch(() => null);
    if (far?.denied && left > 0) { left = 0; await endCopy(id); }
    else if (far && !far.ask) armed = true;
    else if (far?.ask && armed && left > 0) { armed = false; left -= 1; await feed(id, secret); }
    else if (far?.ask && left === 0 && secret === null) { asked = far.line; break; }
    const c = copies().find((x) => x.id === id);
    if (c) await settle(c);
  }
  return { id, asked, note: NOTES[0] ?? null, left: copies().find((c) => c.id === id) ?? null };
}
// The copy is ended, told as failed, and dismissed.
async function stop(id) {
  await endCopy(id);
  for (let i = 0; i < 40 && !copies().find((c) => c.id === id)?.failed; i++) {
    await sleep(250);
    const c = copies().find((x) => x.id === id);
    if (c) await settle(c);
  }
  const why = copies().find((c) => c.id === id)?.failed ?? null;
  dropCopy(id);
  await sleep(800);
  return { why, gone: (await hc("get", id, "--json")).code === 3 };
}
// A line typed on this terminal without showing it.
const hidden = (prompt) => new Promise((resolve) => {
  process.stdout.write(prompt);
  let line = "";
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", function take(buf) {
    for (const ch of buf.toString()) {
      if (ch === "\r" || ch === "\n") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.off("data", take);
        process.stdout.write("\n");
        resolve(line);
        return;
      }
      if (ch === "\u0003") process.exit(130);
      if (ch === "\u007f") line = line.slice(0, -1);
      else line += ch;
    }
  });
});

ok(machines?.some((k) => k.name === A && k.state === "connected") && machines?.some((k) => k.name === B && k.state === "connected"), "hc knows both machines and reaches them");
const list = await hops(A, B, machines);
for (const h of list) console.log(`     ${h.on} -> ${h.far}  ${says(h)}`);
const there = hopFor(list, A);
if (!there) {
  console.log("Neither gets to the other's password prompt: copies between them pass through this computer. Nothing more to try.");
  process.exit(failed ? 1 : 0);
}
const tag = `/tmp/glyph-direct-pass-${1000 + Math.floor(Math.random() * 9000)}`;
const src = `${tag}/src [1]`, dst = `${tag}/dst {x}`, back = `${tag}/back`;
const NAMES = ["plain.txt", "sp ace.txt", "br[1]ack.txt", "st*ar.txt", "quo'te.txt", "dollar$HOME.txt", "back\\slash.txt", "-dash.txt", "ünï.txt"];
const MAKE = 'mkdir -p "$1/d ir" && cd "$1" && shift && for n; do printf "content of %s\\n" "$n" > "$n"; done && echo inner > "d ir/inner file.txt" && head -c 3000000 /dev/urandom > big.bin';
const SUMS = 'cd "$1" && find . -type f | LC_ALL=C sort | while IFS= read -r f; do cksum < "$f"; done';
const ALL = [...NAMES, "big.bin", "d ir"];
try {
  ok((await on(A, "sh", "-c", MAKE, "glyph", src, ...NAMES)).code === 0 && (await on(A, "mkdir", "-p", back)).code === 0 && (await on(B, "mkdir", "-p", dst)).code === 0, "a folder of its own on each, with files on A");
  const job = { from: A, paths: ALL.map((n) => `${src}/${n}`), to: B, dir: dst };

  // Up to the prompt, and no further.
  let r = await run(job, there);
  ok(Boolean(r.asked) && copies().some((c) => c.id === r.id && c.direct === there.far), `scp started on ${there.on} stands at ${there.far}'s password prompt: ${r.asked}`);
  ok(r.id.startsWith(`${there.on}/`), `its terminal is hc's on ${there.on}: ${r.id}`);
  let s = await stop(r.id);
  ok(Boolean(s.why) && s.gone, `ended without a password: told as failed (${s.why}), dismissed, its terminal removed`);
  ok((await listing(B, dst)).entries.length === 0, "nothing was copied");

  // A host key that is not the far machine's is refused before any prompt.
  const wrong = (await reach(machines.find((k) => k.name === there.on).target)).pin;
  r = await run(job, { ...there, pin: wrong });
  ok(r.asked === null && /Host key verification failed/.test(r.left?.failed ?? ""), `with another machine's host key on record: no prompt, and it fails (${r.left?.failed})`);
  dropCopy(r.id);

  // Typing into a prompt on that machine: it gets there, and the screen does not show it.
  const word = `typed-${Math.random().toString(36).slice(2, 10)}`;
  const PROMPT = `stty -echo; printf "someone@nowhere's password: "; IFS= read -r p; stty echo; echo; [ "$p" = "$0" ] && echo "the same ${word.length} letters" || echo "other letters"; sleep 2`;
  const t = JSON.parse((await hc("run", "--on", there.on, "--bg", "--no-parent", "--no-notify", "--json", "--label", "glyph.copy=1", "--", "sh", "-c", PROMPT, word)).stdout).address;
  started.push(t);
  let far = null;
  for (let i = 0; i < 30 && !far?.ask; i++) { await sleep(300); far = await meter(t).catch(() => null); }
  ok(Boolean(far?.ask), `a pretend prompt on ${there.on} is seen as one: ${far?.line}`);
  await feed(t, word);
  await sleep(1500);
  const screen = (await hc("read", t, "--lines", "20")).stdout;
  ok(screen.includes(`the same ${word.length} letters`) && !screen.includes(word), "what was typed got there, and the screen does not show it");

  if (ask) {
    const secret = await hidden(`Password of ${there.user} on ${there.far} (not shown): `);
    r = await run(job, there, secret);
    ok(r.note?.level === "success" && r.left === null, `A to B, straight (scp on ${there.on}): ${r.note?.title ?? r.left?.failed}`);
    ok(JSON.stringify((await listing(B, dst)).entries.map((e) => e.name).sort()) === JSON.stringify([...ALL].sort()), "every name arrived on B");
    const home = hopFor(list, B);
    r = await run({ from: B, paths: ALL.map((n) => `${dst}/${n}`), to: A, dir: back }, home, home.far === there.far ? secret : await hidden(`Password of ${home.user} on ${home.far} (not shown): `));
    ok(r.note?.level === "success" && r.left === null, `B back to A, straight (scp on ${home.on}): ${r.note?.title ?? r.left?.failed}`);
    const [one, two] = [(await on(A, "sh", "-c", SUMS, "glyph", src)).stdout, (await on(A, "sh", "-c", SUMS, "glyph", back)).stdout];
    ok(one.length > 0 && one === two, "what came back is what left, file for file");
  } else console.log("     (no --ask: no password was typed, so no file was copied)");
} finally {
  for (const id of started) {
    await hc("kill", id);
    await hc("rm", id);
  }
  const left = await Promise.all([A, B].map(async (m) => [(await on(m, "rm", "-rf", tag)).code, (await on(m, "sh", "-c", `ls -d ${tag} 2>/dev/null | wc -l`)).stdout.trim()]));
  const still = (await Promise.all(started.map((id) => hc("get", id, "--json")))).filter((x) => x.code !== 3).length;
  ok(JSON.stringify(left) === JSON.stringify([[0, "0"], [0, "0"]]) && still === 0, "its folders are removed from both machines, and none of its terminals is left");
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
