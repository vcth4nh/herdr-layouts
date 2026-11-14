// copy-pass.mjs A B: the mod's own copy.js against real machines (run by copy-pass.sh, which
// puts it beside a copy of the mod). A and B are two machines of `hc machine ls`.
// It reads folders, copies files with awkward names from this computer to A, from A to B
// through here, and from B back, compares what came back byte for byte, and lets one copy
// fail. Everything it writes is in a folder of its own, /tmp/glyph-copy-pass-N on A and B
// and beside this script here, and is removed at the end, as are the terminals it started.
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fleet } from "./data.mjs";
import { listing, startCopy, settle, meter, dropCopy, copies } from "./copy.mjs";
// Run by copy-pass.sh, which gives it two machine names.
import { NOTES } from "./herdr-real.mjs";

const [A, B] = process.argv.slice(2);
if (!A || !B) { console.log("usage: copy-pass.sh A B (two machines of `hc machine ls`)"); process.exit(2); }
let failed = 0, passed = 0;
const ok = (cond, what) => { if (cond) passed++; else failed++; console.log(cond ? "ok  " : "FAIL", what); };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b) ? what : `${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const hc = (...args) => new Promise((resolve) => execFile("hc", args, { maxBuffer: 64 << 20 }, (err, stdout) => resolve({ code: err ? err.code : 0, stdout })));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const here = path.join(path.dirname(fileURLToPath(import.meta.url)), "files");
const tag = `/tmp/glyph-copy-pass-${1000 + Math.floor(Math.random() * 9000)}`;
const src = path.join(here, "src"), back = path.join(here, "back");
const dirA = `${tag}/in a [dir]`, dirB = `${tag}/dst {x} $y`;
const NAMES = ["plain.txt", "sp ace.txt", "br[1]ack.txt", "st*ar.txt", "cur{l,y}.txt", "quo'te.txt", "dollar$HOME.txt", "back\\slash.txt", "q?mark.txt", "-dash.txt", "ti~lde.txt", "co:lon.txt", "ünï.txt", ".dot"];
const ALL = [...NAMES, "big.bin", "d ir"];

// One copy from start to its end: what the bar would say, and what is left listed. A copy
// is given eight minutes: a far machine can take seconds for each file, however small.
const started = [];
async function run(job, one = false) {
  NOTES.length = 0;
  const id = await startCopy(job, machines, one);
  started.push(id);
  let far = null;
  for (const until = Date.now() + 480000; Date.now() < until && copies().some((c) => c.id === id && !c.failed);) {
    await sleep(200);
    const now = await meter(id).catch(() => null);
    if (now?.line) far = now;
    const c = copies().find((x) => x.id === id);
    if (c) await settle(c);
  }
  const gone = (await hc("get", id, "--json")).code === 3;
  return { id, far, note: NOTES[0] ?? null, left: copies().find((c) => c.id === id) ?? null, gone };
}
const names = async (on, dir) => (await listing(on, dir)).entries.map((e) => e.name).sort();

rmSync(here, { recursive: true, force: true });
mkdirSync(path.join(src, "d ir", "deep"), { recursive: true });
mkdirSync(back);
for (const n of NAMES) writeFileSync(path.join(src, n), `content of ${n}\n`);
writeFileSync(path.join(src, "d ir", "deep", "inner file.txt"), "inner\n");
writeFileSync(path.join(src, "big.bin"), randomBytes(6 * 1024 * 1024));

const machines = await fleet();
ok(machines?.some((k) => k.name === A && k.state === "connected") && machines?.some((k) => k.name === B && k.state === "connected"), "hc knows both machines and reaches them");
try {
  eq([(await hc("exec", "--on", A, "--", "mkdir", "-p", dirA)).code, (await hc("exec", "--on", B, "--", "mkdir", "-p", dirB)).code], [0, 0], "a folder of its own on each");

  // Reading folders: here, and through each machine's own sh and ls.
  const mine = await listing(null, src);
  eq([mine.path, mine.entries.map((e) => e.name).sort()], [src, [...ALL].sort()], "this computer's folder, every name");
  eq([mine.entries[0].name, mine.entries.find((e) => e.name === "big.bin").size, mine.entries.at(-1).name], ["d ir", 6 * 1024 * 1024, ".dot"], "folders first, sizes, dot names last");
  for (const [m, dir] of [[A, dirA], [B, dirB]]) {
    const home = await listing(m, "");
    ok(home.path === home.home && home.path.startsWith("/"), `${m === A ? "A" : "B"}: no folder asked gives its home`);
    eq((await listing(m, dir)).entries, [], `${m === A ? "A" : "B"}: its new folder is empty`);
  }
  let why = "";
  try { await listing(A, `${tag}/nope`); } catch (e) { why = e.message; }
  ok(/nope/.test(why), `a folder that isn't there says so: ${why}`);

  // Here to A, A to B through here, B back here.
  let r = await run({ from: null, paths: ALL.map((n) => path.join(src, n)), to: A, dir: dirA });
  eq([r.note?.level, r.note?.title, r.left, r.gone], ["success", "Copied plain.txt +15", null, true], "here to A: told, forgotten, its terminal removed");
  eq(await names(A, dirA), [...ALL].sort(), "every name arrived on A");
  eq((await listing(A, dirA)).entries.find((e) => e.name === "big.bin").size, 6 * 1024 * 1024, "A's own ls gives the size");
  r = await run({ from: A, paths: ALL.map((n) => `${dirA}/${n}`), to: B, dir: dirB });
  eq([r.note?.level, r.left, r.gone], ["success", null, true], "A to B, through here");
  eq(await names(B, dirB), [...ALL].sort(), "every name arrived on B");
  r = await run({ from: B, paths: ALL.map((n) => `${dirB}/${n}`), to: null, dir: back });
  eq([r.note?.level, r.left, r.gone], ["success", null, true], "B back to here");
  ok([...NAMES, "big.bin", "d ir/deep/inner file.txt"].every((n) => readFileSync(path.join(src, n)).equals(readFileSync(path.join(back, n)))), "what came back is byte for byte what left");
  r = await run({ from: null, paths: [path.join(src, "big.bin")], to: A, dir: `${tag}` }, true);
  ok(r.note?.level === "success" && (r.far === null || /big\.bin/.test(r.far.line)), `one file: scp's meter was read (${r.far?.line ?? "it ended first"})`);

  // A copy that fails stays listed with scp's words until it is dismissed.
  r = await run({ from: A, paths: [`${dirA}/nope.txt`], to: B, dir: dirB });
  eq([r.note?.level, r.note?.title, r.gone], ["error", "Could not copy nope.txt", false], "a source that isn't there: told as failed, its terminal kept");
  ok(/No such file/.test(r.left?.failed ?? ""), `it keeps scp's last line: ${r.left?.failed}`);
  dropCopy(r.id);
  await sleep(600);
  eq([copies().length, (await hc("get", r.id, "--json")).code], [0, 3], "dismissed: forgotten, and its terminal removed");
} finally {
  // A copy still under way is ended before its folders go.
  for (const id of started) {
    await hc("kill", id);
    await hc("rm", id);
  }
  const left = await Promise.all([A, B].map(async (m) => [(await hc("exec", "--on", m, "--", "rm", "-rf", tag)).code, (await hc("exec", "--on", m, "--", "sh", "-c", `ls -d ${tag} 2>/dev/null | wc -l`)).stdout.trim()]));
  rmSync(here, { recursive: true, force: true });
  await sleep(300);
  const mineLeft = JSON.parse((await hc("ls", "--all", "--json", "--label", "glyph.copy=1")).stdout).terminals.length;
  eq([left, mineLeft], [[[0, "0"], [0, "0"]], 0], "its folders are removed from both machines, and no copy terminal is left");
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
