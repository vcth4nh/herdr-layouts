// The transfer window, what copy.js builds and reads, and the bar's part in a copy.
// Run: ACTIVE=sp2 sh logic/run.sh transfer-test.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Transfer } from "./transfer.mjs";
import { Bar } from "./bar.mjs";
import { LIST, parse, scpArgs, bytes, settle } from "./copy.mjs";
import { byId, walk } from "./kit-stub.mjs";
import { CALLS, ASKS, SHARED, spaces, terminals } from "./herdr-fake.mjs";

let failed = 0, passed = 0;
const ok = (cond, what) => { if (cond) passed++; else { failed++; console.log("FAIL:", what); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
const timers = [];
const cx = {
  notify() {}, stop_propagation() {}, spawn(fn) { return Promise.resolve().then(() => fn(cx)); },
  timer: { every() {}, after(_ms, fn) { timers.push(fn); } }, focus_handle: () => ({ focus() {} }),
};
const settled = () => new Promise((r) => setTimeout(r, 10));
const runs = () => CALLS.filter((c) => c[0] === "run").map((c) => [c[1], c[2]]);
const said = () => CALLS.filter((c) => c[0] === "notify").map((c) => [c[1].level, c[1].title]);
const asked = (verb) => ASKS.filter((a) => a[0] === "hc" && a[1][0] === verb).map((a) => a[1]);
const under = (node) => { const all = []; const go = (n) => { if (n.id) all.push(n.id); for (const c of n.children) if (c?.__node) go(c.__node); }; go(node); return all; };
const text = (node) => { const out = []; const go = (n) => { for (const c of n.children) { if (typeof c === "string") out.push(c); else if (c?.__node) go(c.__node); } }; go(node); return out.join(" "); };
const icons = (node) => { const out = []; walk({ __node: node }, (n) => { if (n.kind === "svg") out.push(n.arg.split("/").pop().replace(".svg", "")); }); return out; };
const press = (root, id, count = 1) => byId(root, id).handlers["on_mouse_down:left"]({ click_count: count }, cx);
const click = (root, id) => byId(root, id).handlers.on_click({}, cx);
const rows = (root, i) => under(byId(root, `list${i}`)).filter((id) => id.startsWith(`e${i}-`)).map((id) => id.slice(3));

// What a machine's sh prints for a folder, on this computer's own sh and ls, and how it is read.
{
  const dir = mkdtempSync(path.join(tmpdir(), "glyph-list-"));
  mkdirSync(path.join(dir, "sub dir"));
  mkdirSync(path.join(dir, ".cache"));
  mkdirSync(path.join(dir, "empty"));
  const files = [["b10.txt", 5], ["b9.txt", 6], ["a b [1] {x}.txt", 1500], [".env", 3], ["big.bin", 2 * 1024 * 1024], ["-dash", 1], ["it's $HOME *.txt", 7]];
  for (const [n, size] of files) writeFileSync(path.join(dir, n), Buffer.alloc(size));
  const sh = (at) => execFileSync("sh", ["-c", LIST, "glyph", at], { env: { ...process.env, HOME: dir }, stdio: ["ignore", "pipe", "ignore"] }).toString();
  const got = parse(sh(dir));
  eq([got.path, got.home, got.more], [dir, dir, false], "the folder and home as the machine writes them");
  eq(got.entries.filter((e) => e.dir).map((e) => e.name), ["empty", "sub dir", ".cache"], "folders first, a dot name last");
  eq(got.entries.filter((e) => !e.dir).map((e) => e.name).slice(-1), [".env"], "among the files too");
  eq(got.entries.filter((e) => !e.dir).map((e) => e.name).sort(), files.map((f) => f[0]).sort(), "every file, whatever its name");
  eq(files.map(([n]) => got.entries.find((e) => e.name === n)?.size), files.map((f) => f[1]), "each file's size");
  ok(got.entries.find((e) => e.name === "b9.txt") && got.entries.findIndex((e) => e.name === "b9.txt") < got.entries.findIndex((e) => e.name === "b10.txt"), "numbers in names count as numbers");
  ok(got.entries.filter((e) => e.dir).every((e) => e.size === null), "a folder has no size");
  eq(parse(sh(path.join(dir, "empty"))).entries, [], "an empty folder");
  eq(parse(sh("")).path, dir, "no folder asked: home");
  let code = 0;
  try { sh(path.join(dir, "nope")); } catch (e) { code = e.status; }
  eq(code, 2, "a folder that isn't there ends the listing with 2");
  rmSync(dir, { recursive: true, force: true });
}

// The scp a job becomes.
{
  const fleet = [
    { name: "alpha", target: "alpha", via: false }, { name: "bravo", target: "me@bravo.example", via: false },
    { name: "charlie", target: "fly ssh console -a charlie -C", via: true }, { name: "foxtrot", target: "me@10.0.0.7:2222", via: false }, { name: "golf", target: "golf:2222", via: false }, { name: "hotel", target: "hotel:22", via: false },
  ];
  const head = ["scp", "-3", "-r", "-o", "BatchMode=yes", "-o", "ConnectTimeout=20"];
  eq(scpArgs({ from: null, paths: ["/Users/me/a b.txt", "/Users/me/c [1].txt"], to: "alpha", dir: "/home/me/dst [x]" }, fleet),
    [...head, "--", "/Users/me/a b.txt", "/Users/me/c [1].txt", "alpha:/home/me/dst [x]/"], "from here: every path as it is written");
  eq(scpArgs({ from: "alpha", paths: ["/home/me/a[1] {x}*?\\.txt"], to: "bravo", dir: "/srv/in {y}" }, fleet),
    [...head, "--", "alpha:/home/me/a\\[1\\] \\{x\\}\\*\\?\\\\.txt", "me@bravo.example:/srv/in {y}/"], "from another machine: the source's pattern letters are escaped, the folder it goes to is not");
  eq(scpArgs({ from: "foxtrot", paths: ["/data/x"], to: null, dir: "/" }, fleet), [...head, "-P", "2222", "--", "me@10.0.0.7:/data/x", "/"], "a target with a port");
  eq(scpArgs({ from: "foxtrot", paths: ["/x"], to: "golf", dir: "/y" }, fleet).slice(7), ["-P", "2222", "--", "me@10.0.0.7:/x", "golf:/y/"], "two machines on one port");
  const refuses = (job) => { try { scpArgs(job, fleet); return ""; } catch (e) { return e.message; } };
  eq(refuses({ from: "foxtrot", paths: ["/x"], to: "alpha", dir: "/y" }), "The two machines listen for ssh on different ports", "two ports");
  eq(refuses({ from: "golf", paths: ["/x"], to: "hotel", dir: "/y" }), "The two machines listen for ssh on different ports", "two ports, both given");
  eq(refuses({ from: null, paths: ["/x"], to: "charlie", dir: "/y" }), "charlie is not reached over ssh, so scp can't get there", "a machine reached by a command");
  eq(refuses({ from: "zulu", paths: ["/x"], to: null, dir: "/y" }), "zulu is not reached over ssh, so scp can't get there", "a machine hc doesn't know");
  eq([0, 999, 1000, 1536, 18734, 148229120, 2473901162].map(bytes), ["0B", "999B", "1.0K", "1.5K", "18K", "141M", "2.3G"], "sizes");
}

// The window. It opens with the left side where you are and the right where it was left.
const API = "/Users/me/code/inventory-and-order-reports/services/api", SHOP = "/home/me/acme-shop-backend";
globalThis.__props = { role: "transfer", overlay: "ov7" };
let w = new Transfer(cx);
await settled();
let root = w.render();
const at = () => w.sides.map((s) => [s.on, s.path]);
eq(at(), [[null, API], ["alpha", SHOP]], "left: the shown project's folder; right: where it was left");
eq(rows(root, 0), ["fixtures", "src", "tests", ".venv", "import.py", "README.md", "stock-2026-11.parquet", "suppliers.csv", ".env"], "left rows: folders, then files, whatever their case; dot names last");
eq([text(byId(root, "e0-suppliers.csv")), text(byId(root, "e0-fixtures"))], ["suppliers.csv 891K", "fixtures"], "a file shows its size, a folder its chevron");
ok(Boolean(byId(root, "in0-fixtures")) && !byId(root, "in0-README.md"), "only folders open");
eq(under(byId(root, "side0")).filter((i) => i.startsWith("m0-")), ["m0-local", "m0-alpha", "m0-bravo", "m0-charlie", "m0-delta-2", "m0-echo", "m0-foxtrot"], "every machine: this computer, then the others by name");
eq([Boolean(byId(root, "m0-local").props.bg), Boolean(byId(root, "m0-alpha").props.bg), Boolean(byId(root, "m1-alpha").props.bg)], [true, false, true], "each side's machine is raised");
eq([byId(root, "m0-delta-2").props.tooltip[0], byId(root, "m0-echo").props.tooltip[0]], ["delta-2 needs a login: run hc machine login delta-2", "echo: unreachable"], "a machine out of reach says why");
eq(under(byId(root, "side0")).filter((i) => i.startsWith("p0-")), ["p0-home", "p0-root", "p0-sp1", "p0-sp2"], "places: home, the top, this machine's projects (the one at home is the house)");
eq(byId(root, "p0-sp2").props.tooltip[0], "inventory-and-order-reports  ·  ~/code/inventory-and-order-reports/services/api", "a project's tile says where it is");
eq(byId(root, "send").props.tooltip[0], "Pick files on one side to copy them to the other", "nothing picked: the arrow says what to do");
eq(icons(byId(root, "send")), ["transfer"], "and points nowhere");
eq(icons(byId(root, "c1-0")), ["home"], "the way down starts at home, drawn as a house");
eq([text(byId(root, "c1-1")), text(byId(root, "c0-0")), text(byId(root, "c0-3"))], ["acme-shop-backend", "…", "api"], "a long way shows its end");

// A machine out of reach can't be chosen; another one opens at its home.
ASKS.length = 0;
click(root, "m0-echo");
click(root, "m0-delta-2");
eq(ASKS.filter((a) => a[0] === "exec").length, 0, "a click on a machine out of reach reads nothing");
click(root, "m0-bravo");
await settled();
root = w.render();
eq([at()[0], rows(root, 0)], [["bravo", "/home/me"], ["fieldnotes", "kettle", "notes.txt"]], "another machine: its home");
eq(ASKS.filter((a) => a[0] === "exec").map((a) => [a[1], a[2][0], a[2][3], a[3]]), [["sh", "-c", "", { on: "bravo" }]], "asked of that machine's own sh");
ok(Boolean(byId(root, "p0-home").props.bg) && under(byId(root, "side0")).includes("p0-bravo/sp6"), "home's tile is filled there; that machine's projects are its places");
// A folder: its chevron opens it, and so does a double-click.
click(root, "in0-kettle");
await settled();
root = w.render();
eq([at()[0], rows(root, 0), text(byId(root, "list0"))], [["bravo", "/home/me/kettle"], [], "Empty"], "an empty folder says so");
click(root, "c0-0");
await settled();
root = w.render();
eq(at()[0], ["bravo", "/home/me"], "a part of the way goes back up");
press(root, "e0-kettle", 1);
eq([...w.sides[0].picked], ["kettle"], "the first press of a double-click picks");
press(w.render(), "e0-kettle", 2);
await settled();
eq([at()[0], [...w.sides[0].picked]], [["bravo", "/home/me/kettle"], []], "the second opens the folder, and nothing stays picked");
press(w.render(), "e1-README.md", 1);
press(w.render(), "e1-README.md", 2);
eq([...w.sides[1].picked], ["README.md"], "a double-click on a file leaves it picked");
press(w.render(), "e1-README.md", 1);
// A folder that can't be read says why, and the way back up still works.
click(w.render(), "in1-logs");
await settled();
root = w.render();
eq([at()[1], rows(root, 1), text(byId(root, "list1"))], [["alpha", `${SHOP}/logs`], [], `${SHOP}/logs: No such file or directory`], "a folder that can't be read");
ok(byId(root, "send").props.tooltip[0] !== undefined && !w.plan(), "nothing to send");
click(root, "p1-root");
await settled();
root = w.render();
eq([at()[1], rows(root, 1), text(byId(root, "c1-0"))], [["alpha", "/"], ["etc", "home", "tmp", "var"], "/"], "the top folder");
click(root, "p1-alpha/sp4");
await settled();
click(w.render(), "p0-home");
await settled();
click(w.render(), "m0-local");
await settled();
click(w.render(), "p0-sp2");
await settled();
root = w.render();
eq(at(), [[null, API], ["alpha", SHOP]], "a project's tile goes to its folder");
eq(SHARED["glyph.side"], { on: "alpha", path: SHOP }, "where the right side is, is kept");

// Picking. What is picked is on one side, and the arrow points at the other.
press(root, "e0-import.py");
press(w.render(), "e0-fixtures");
root = w.render();
eq([[...w.sides[0].picked], icons(byId(root, "send"))], [["import.py", "fixtures"], ["arrow-right"]], "picked on the left: the arrow points right");
eq(byId(root, "send").props.tooltip[0], "Copy 2 items to alpha  ·  ~/acme-shop-backend", "it says what would go where");
{
  const first = byId(root, "list1").children.slice(0, 2).map((c) => c.__node);
  eq(first.map((n) => [text(n), icons(n)[0], Boolean(n.props.border_dashed), n.id]), [["import.py", "file", true, null], ["fixtures", "folder", true, null]], "dashed rows on the other side show what would land");
}
press(root, "e1-Makefile");
root = w.render();
eq([[...w.sides[0].picked], [...w.sides[1].picked], icons(byId(root, "send"))], [[], ["Makefile"], ["arrow-left"]], "a pick on the other side takes over, and the arrow turns");
eq(byId(root, "send").props.tooltip[0], `Copy Makefile to This Mac  ·  ~/code/inventory-and-order-reports/services/api`, "one item goes by its name");
// One press copies when nothing is in the way.
CALLS.length = 0; ASKS.length = 0; delete SHARED["glyph.copies"];
click(root, "send");
await settled();
eq(asked("run"), [["run", "--bg", "--no-parent", "--no-notify", "--json", "--label", "glyph.copy=1", "--", "scp", "-3", "-r", "-o", "BatchMode=yes", "-o", "ConnectTimeout=20", "--", `alpha:${SHOP}/Makefile`, `${API}/`]], "the copy: scp in a terminal of hc's, with no pane and no parent");
eq(SHARED["glyph.copies"].map(({ at: _at, ...c }) => c), [{ id: "t90", from: "alpha", to: null, dir: API, name: "Makefile", n: 1, one: true }], "it is listed as under way");
eq([[...w.sides[1].picked], said()], [[], []], "nothing stays picked, and nothing is said yet");
// A name that is already there: the first press only arms.
press(w.render(), "e0-README.md");
press(w.render(), "e0-suppliers.csv");
press(w.render(), "e0-tests");
root = w.render();
eq(byId(root, "send").props.tooltip[0], "Copy 3 items to alpha  ·  ~/acme-shop-backend  ·  2 items already there: two presses replace", "the arrow says what is already there");
eq(["README.md", "suppliers.csv", "Makefile"].map((n) => Boolean(byId(root, `e1-${n}`).props.border_dashed)), [true, true, false], "the rows that would be replaced are outlined");
ASKS.length = 0; timers.length = 0;
click(root, "send");
await settled();
root = w.render();
eq([asked("run").length, byId(root, "send").props.tooltip[0], byId(root, "send").props.bg[0], Boolean(byId(root, "send").props.loop)], [0, "Again to replace 2 items", "#f38ba8", true], "first press: nothing is copied, the arrow turns red");
ok(byId(root, "e1-README.md").props.bg?.[0].startsWith("#f38ba8") && !byId(root, "e1-Makefile").props.bg, "and so do the rows it would replace");
timers.splice(0).forEach((fn) => fn(cx));
eq(w.render() && byId(w.render(), "send").props.tooltip[0].startsWith("Copy 3 items"), true, "left alone, the press is taken back");
click(w.render(), "send");
click(w.render(), "send");
await settled();
eq(asked("run").map((a) => a.slice(a.lastIndexOf("--") + 1)), [[`${API}/README.md`, `${API}/suppliers.csv`, `${API}/tests`, `alpha:${SHOP}/`]], "second press in time: the copy starts");
eq(SHARED["glyph.copies"].slice(-1).map((c) => [c.name, c.n, c.one]), [["README.md", 3, false]], "three items are no single file");
// A pick that changes takes the first press back.
press(w.render(), "e0-README.md");
click(w.render(), "send");
press(w.render(), "e0-import.py");
eq(byId(w.render(), "send").props.tooltip[0].startsWith("Copy 2 items"), true, "another pick takes a first press back");
press(w.render(), "e0-README.md");
press(w.render(), "e0-import.py");
// Both sides on one folder: nowhere to copy to.
click(w.render(), "m1-local");
await settled();
click(w.render(), "p1-sp2");
await settled();
press(w.render(), "e1-import.py");
ASKS.length = 0;
root = w.render();
click(root, "send");
await settled();
eq([byId(root, "send").props.tooltip[0], asked("run").length, Boolean(byId(root, "send").props.cursor_pointer)], ["Both sides show the same folder", 0, false], "the same folder on both sides copies nothing");
// A copy that can't start says so.
click(w.render(), "m0-charlie");
await settled();
CALLS.length = 0;
click(w.render(), "send");
await settled();
eq(said(), [["error", "The copy did not start"]], "a machine scp can't reach: the copy does not start");
eq(CALLS.find((c) => c[0] === "notify")[1].body, "charlie is not reached over ssh, so scp can't get there", "and says why");

// Files dropped from outside the app go into the side's folder; a drop replaces nothing.
click(w.render(), "m0-alpha");
await settled();
click(w.render(), "p0-alpha/sp4");
await settled();
CALLS.length = 0; ASKS.length = 0;
byId(w.render(), "side0").handlers.on_drop({ paths: ["/Users/me/Desktop/shot 1.png", "/Users/me/Desktop/notes"] }, cx);
await settled();
eq(asked("run").map((a) => a.slice(a.lastIndexOf("--") + 1)), [["/Users/me/Desktop/shot 1.png", "/Users/me/Desktop/notes", `alpha:${SHOP}/`]], "a drop is copied from this computer");
ASKS.length = 0;
byId(w.render(), "side0").handlers.on_drop({ paths: ["/Users/me/Desktop/new.txt", "/Users/me/elsewhere/README.md"] }, cx);
await settled();
eq([asked("run").length, said()], [0, [["warning", "README.md is already there"]]], "a drop on a name that is there copies nothing and says so");

// Copies under way and one that failed, in the head.
SHARED["glyph.copies"] = [
  { id: "t90", from: null, to: "alpha", dir: SHOP, name: "stock-2026-11.parquet", n: 1, one: true, at: Date.now() },
  { id: "t91", from: "alpha", to: "bravo", dir: "/home/me/kettle", name: "logs", n: 3, one: false, at: Date.now() },
  { id: "t92", from: "bravo", to: null, dir: "/Users/me/Downloads", name: "notes.txt", n: 1, one: true, at: Date.now(), failed: "scp: /home/me/notes.txt: Permission denied" },
];
w.seen = null;
ASKS.length = 0;
w.tick(cx);
await settled();
root = w.render();
eq(asked("read"), [["read", "t90", "--lines", "0"], ["read", "t91", "--lines", "0"]], "the ones under way are asked how far they are");
eq(["t90", "t91", "t92"].map((id) => text(byId(root, `copy-${id}`))), ["stock-2026-11.parquet alpha 42%", "logs +2 bravo", "notes.txt This Mac"], "a single file shows scp's percent; several don't");
eq(byId(root, "copy-t91").props.tooltip[0], "logs +2  ·  alpha → bravo  ·  ~/kettle  ·  stock-2026-11.parquet 42% 59MB 11.2MB/s 00:07 ETA", "hovering says the rest, with scp's own line");
eq(byId(root, "copy-t92").props.tooltip[0], "notes.txt  ·  bravo → This Mac  ·  ~/Downloads  ·  scp: /home/me/notes.txt: Permission denied  ·  click to dismiss", "a failed one says why");
CALLS.length = 0; ASKS.length = 0;
click(root, "copy-t90");
click(root, "copy-t92");
await settled();
eq([runs(), asked("rm"), SHARED["glyph.copies"].map((c) => c.id)], [[["terminal.peek", { terminal: "t90" }]], [["rm", "t92"]], ["t90", "t91"]], "a copy under way is peeked at; a failed one is dismissed");
// A copy that ended may have changed a folder on show: both are read again, in place.
press(w.render(), "e0-Makefile");
ASKS.length = 0;
SHARED["glyph.copies"] = [SHARED["glyph.copies"][1]];
w.tick(cx);
await settled();
eq([ASKS.filter((a) => a[0] === "exec").map((a) => [a[3].on ?? null, a[2][3]]), [...w.sides[0].picked]], [[["alpha", SHOP], [null, API]], ["Makefile"]], "after a copy ends the folders are read again, and what is picked stays");
ASKS.length = 0;
w.tick(cx);
await settled();
eq(ASKS.filter((a) => a[0] === "exec").length, 0, "and not again until something changes");
CALLS.length = 0;
click(w.render(), "transfer-close");
eq(CALLS, [["closeOverlay", "ov7"]], "the x closes the window");

// The first time, and a folder that is gone.
delete SHARED["glyph.side"];
w = new Transfer(cx);
await settled();
eq(at(), [[null, API], ["alpha", "/home/me"]], "first time from this computer: the first other machine's home");
spaces().forEach((s) => { s.active = s.id === "alpha/sp4"; });
delete SHARED["glyph.side"];
w = new Transfer(cx);
await settled();
eq(at(), [["alpha", SHOP], [null, "/Users/me"]], "first time from another machine: this computer's home");
SHARED["glyph.side"] = { on: "bravo", path: "/home/me/gone" };
w = new Transfer(cx);
await settled();
await settled();
eq([at()[1], w.sides[1].error], [["bravo", "/home/me"], null], "a remembered folder that is gone gives way to home");
spaces().forEach((s) => { s.active = s.id === "sp2"; });

// The bar: its button, its key, and how each copy ended.
globalThis.__props = { role: "bar" };
delete SHARED["glyph.copies"];
const bar = new Bar(cx);
await settled();
root = bar.render();
eq(byId(root, "transfer").props.tooltip[0], "Copy files between machines  ⇧⌘T", "the bar's button, with its key");
CALLS.length = 0;
click(root, "transfer");
globalThis.__deliver("transfer");
await settled();
const spec = { mod: "glyph", kind: "window", key: "glyph.transfer", width: 880, height: 560, props: { role: "transfer" } };
eq(CALLS.filter((c) => c[0] === "openOverlay"), [["openOverlay", spec], ["openOverlay", spec]], "the button and the key open the one window");
const copy = (id, more = {}) => ({ id, from: null, to: "alpha", dir: SHOP, name: "import.py", n: 2, one: false, at: Date.now() - 5000, ...more });
const scp = { key: "program", name: "scp", icon: null, shell: false, agent: false };
terminals().push({ address: "t70", state: "live", status: null, parent: null, program: scp, report: {} });
SHARED["glyph.copies"] = [copy("t70"), copy("t71", { at: Date.now() }), copy("t72", { failed: "scp: nope" })];
root = bar.render();
eq(byId(root, "transfer").props.tooltip[0], "Copy files between machines  ⇧⌘T  ·  2 under way  ·  1 failed", "it counts the copies");
ASKS.length = 0; CALLS.length = 0;
bar.look(cx);
await settled();
eq([asked("get"), said()], [[], []], "a live copy, one just started and one known to have failed are left alone");
// One that ended well is told and forgotten; one that failed stays, with scp's last line.
const facts = { t73: { state: "finished", exit_code: 0 }, t74: { state: "finished", exit_code: 1 }, t75: { state: "live" } };
globalThis.__hc = (args) => {
  if (args[0] === "get") return facts[args[1]] ? { code: 0, stdout: JSON.stringify(facts[args[1]]), stderr: "" } : { code: 3, stdout: "", stderr: '{"error":{"kind":"not_found"}}' };
  if (args[0] === "read") return { code: 0, stdout: "import.py   100%   18KB\r\nscp: /home/me/x: No space left on device\r\n\n", stderr: "" };
  return null;
};
SHARED["glyph.copies"] = [copy("t73"), copy("t74", { name: "x", n: 1 }), copy("t75"), copy("t76")];
ASKS.length = 0; CALLS.length = 0;
bar.render();
bar.look(cx);
await settled();
eq(asked("get").map((a) => a[1]), ["t73", "t74", "t75", "t76"], "copies whose terminals are no longer live are asked about");
eq(said(), [["success", "Copied import.py +1"], ["error", "Could not copy x"]], "the bar says how each ended");
eq(CALLS.filter((c) => c[0] === "notify").map((c) => [c[1].body, c[1].action]), [["This Mac → alpha  ·  ~/acme-shop-backend", { name: "glyph.transfer" }], ["scp: /home/me/x: No space left on device", { name: "glyph.transfer" }]], "where it went, or scp's last line; a click on either opens the window");
eq([asked("rm"), SHARED["glyph.copies"].map((c) => [c.id, c.failed ?? null])], [[["rm", "t73"]], [["t74", "scp: /home/me/x: No space left on device"], ["t75", null]]], "done: forgotten, its terminal removed. Failed: kept. Still live: kept. Gone from hc: forgotten");
ASKS.length = 0; CALLS.length = 0;
bar.render();
bar.look(cx);
await settled();
eq([asked("get"), said()], [[], []], "nothing is said twice, and hc is not asked again at once");
bar.settling.get("t75").at = 0;
bar.render();
bar.look(cx);
await settled();
eq(asked("get").map((a) => a[1]), ["t75"], "one hc still calls live is asked again later");
// settle() by itself: hc out of reach changes nothing.
globalThis.__hc = (args) => (args[0] === "get" ? { code: 1, stdout: "", stderr: "core did not answer" } : null);
await settle(copy("t75"));
eq(SHARED["glyph.copies"].map((c) => c.id), ["t74", "t75"], "hc out of reach: the copy stays listed");
globalThis.__hc = null;

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
