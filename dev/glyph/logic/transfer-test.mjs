// The transfer window, what copy.js builds and reads, and the bar's part in a copy.
// Run: ACTIVE=sp2 sh logic/run.sh transfer-test.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Transfer } from "./transfer.mjs";
import { Bar } from "./bar.mjs";
import { LIST, parse, scpArgs, bytes, settle, reach, hops, hopFor, directArgs, meter, listing, NO_SH } from "./copy.mjs";
import { byId, walk } from "./kit-stub.mjs";
import { CALLS, ASKS, SHARED, spaces, terminals } from "./herdr-fake.mjs";

let failed = 0, passed = 0;
const ok = (cond, what) => { if (cond) passed++; else { failed++; console.log("FAIL:", what); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
let drawn = 0; // how often the mod asked to be drawn again
let stopped = 0; // how many presses the mod kept to itself
let held = 0; // how often the mod took the keyboard
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
const timers = [];
const cx = {
  notify() { drawn += 1; }, stop_propagation() { stopped += 1; }, spawn(fn) { return Promise.resolve().then(() => fn(cx)); },
  timer: { every() {}, after(_ms, fn) { timers.push(fn); } }, focus_handle: () => ({ focus() { held += 1; } }),
};
const settled = () => new Promise((r) => setTimeout(r, 10));
const runs = () => CALLS.filter((c) => c[0] === "run").map((c) => [c[1], c[2]]);
const said = () => CALLS.filter((c) => c[0] === "notify").map((c) => [c[1].level, c[1].title]);
const asked = (verb) => ASKS.filter((a) => a[0] === "hc" && a[1][0] === verb).map((a) => a[1]);
// The folders read: a machine's sh asked for a listing (not what ssh is asked about another machine).
const reads = () => ASKS.filter((a) => a[0] === "exec" && a[1] === "sh" && !String(a[2][1]).includes("getent"));
const under = (node) => { const all = []; const go = (n) => { if (n.id) all.push(n.id); for (const c of n.children) if (c?.__node) go(c.__node); }; go(node); return all; };
const text = (node) => { const out = []; const go = (n) => { for (const c of n.children) { if (typeof c === "string") out.push(c); else if (c?.__node) go(c.__node); } }; go(node); return out.join(" "); };
const icons = (node) => { const out = []; walk({ __node: node }, (n) => { if (n.kind === "svg") out.push(n.arg.split("/").pop().replace(".svg", "")); }); return out; };
// A press on a row or on the empty part of a list: `count` as the app counts presses, the
// keys held, and where in the window. The button stays down until lift().
const CMD = { platform: true }, SHIFT = { shift: true };
const press = (root, id, count = 1, keys = {}, at = { x: 100, y: 100 }) => byId(root, id).handlers["on_mouse_down:left"]({ click_count: count, modifiers: keys, position: at }, cx);
// The button comes up over a side, or over the window ("transfer").
const lift = (root, id) => byId(root, id).handlers["on_mouse_up:left"]({}, cx);
// The pointer moves over an element, to a point in the window. True when the mod redrew.
const glide = (root, id, at) => { const was = drawn; byId(root, id).handlers.on_mouse_move({ position: at, local_position: at, bounds: { x: 0, y: 0, width: 880, height: 560 }, modifiers: {} }, cx); return drawn > was; };
// A click on a row: down and up in place. also(): with Cmd held, one more row or one fewer.
const tap = (root, id, keys = {}) => { press(root, id, 1, keys); lift(w.render(), `side${id[1]}`); };
const also = (root, id) => tap(root, id, CMD);
const click = (root, id) => byId(root, id).handlers.on_click({}, cx);
// The words a hover shows over an element, or null when it has none.
const tipOf = (root, id) => byId(root, id).props.tooltip?.[0] ?? null;
// What the picked rows would do: how many, where to, and how many names are already there.
const planned = () => { const p = w.plan(); return p ? [p.names.length === 1 ? p.names[0] : p.names.length, p.dst.on, p.dst.path, p.clash.length] : null; };
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
eq(byId(root, "p0-sp2").props.tooltip[0], "inventory-and-order-reports, ~/code/inventory-and-order-reports/services/api", "a project's tile says where it is");
eq(tipOf(root, "send"), null, "nothing picked: the arrow has no words of its own");
eq(icons(byId(root, "send")), ["transfer"], "and points nowhere");
eq(icons(byId(root, "c1-0")), ["home"], "the way down starts at home, drawn as a house");
eq([text(byId(root, "c1-1")), text(byId(root, "c0-0")), text(byId(root, "c0-3"))], ["acme-shop-backend", "…", "api"], "a long way shows its end");

// A machine out of reach can't be chosen; another one opens at its home.
ASKS.length = 0;
click(root, "m0-echo");
click(root, "m0-delta-2");
eq(reads().length, 0, "a click on a machine out of reach reads nothing");
click(root, "m0-bravo");
await settled();
root = w.render();
eq([at()[0], rows(root, 0)], [["bravo", "/home/me"], ["fieldnotes", "kettle", "notes.txt"]], "another machine: its home");
eq(reads().map((a) => [a[1], a[2][0], a[2][3], a[3]]), [["sh", "-c", "", { on: "bravo" }]], "asked of that machine's own sh");
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
lift(w.render(), "side1");
eq([...w.sides[1].picked], ["README.md"], "a double-click on a file leaves it picked");
tap(w.render(), "e1-README.md");
eq([...w.sides[1].picked], [], "a click on the one picked row lets it go");
// A folder that can't be read says why, and the way back up still works.
click(w.render(), "in1-logs");
await settled();
root = w.render();
eq([at()[1], rows(root, 1), text(byId(root, "list1"))], [["alpha", `${SHOP}/logs`], [], `${SHOP}/logs: No such file or directory`], "a folder that can't be read");
ok(!w.plan(), "nothing to send");
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
tap(root, "e0-import.py");
also(w.render(), "e0-fixtures");
root = w.render();
eq([[...w.sides[0].picked], icons(byId(root, "send"))], [["import.py", "fixtures"], ["arrow-right"]], "picked on the left: the arrow points right");
eq([tipOf(root, "send"), planned()], [null, [2, "alpha", "/home/me/acme-shop-backend", 0]], "two items would go to the other side, and the arrow needs no words for it");
{
  const first = byId(root, "list1").children.slice(0, 2).map((c) => c.__node);
  eq(first.map((n) => [text(n), icons(n)[0], Boolean(n.props.border_dashed), n.id]), [["import.py", "file", true, null], ["fixtures", "folder", true, null]], "dashed rows on the other side show what would land");
}
tap(root, "e1-Makefile");
root = w.render();
eq([[...w.sides[0].picked], [...w.sides[1].picked], icons(byId(root, "send"))], [[], ["Makefile"], ["arrow-left"]], "a pick on the other side takes over, and the arrow turns");
eq(planned(), ["Makefile", null, "/Users/me/code/inventory-and-order-reports/services/api", 0], "one item, to this computer");
// One press copies when nothing is in the way.
CALLS.length = 0; ASKS.length = 0; delete SHARED["glyph.copies"];
click(root, "send");
await settled();
eq(asked("run"), [["run", "--bg", "--no-parent", "--no-notify", "--json", "--label", "glyph.copy=1", "--", "scp", "-3", "-r", "-o", "BatchMode=yes", "-o", "ConnectTimeout=20", "--", `alpha:${SHOP}/Makefile`, `${API}/`]], "the copy: scp in a terminal of hc's, with no pane and no parent");
eq(SHARED["glyph.copies"].map(({ at: _at, ...c }) => c), [{ id: "t90", from: "alpha", to: null, dir: API, name: "Makefile", n: 1, one: true }], "it is listed as under way");
eq([[...w.sides[1].picked], said()], [[], []], "nothing stays picked, and nothing is said yet");
// A name that is already there: the first press only arms.
tap(w.render(), "e0-README.md");
also(w.render(), "e0-suppliers.csv");
also(w.render(), "e0-tests");
root = w.render();
eq([tipOf(root, "send"), planned()], [null, [3, "alpha", "/home/me/acme-shop-backend", 2]], "two of the three names are already there");
eq(["README.md", "suppliers.csv", "Makefile"].map((n) => Boolean(byId(root, `e1-${n}`).props.border_dashed)), [true, true, false], "the rows that would be replaced are outlined");
ASKS.length = 0; timers.length = 0;
click(root, "send");
await settled();
root = w.render();
eq([asked("run").length, byId(root, "send").props.tooltip[0], byId(root, "send").props.bg[0], Boolean(byId(root, "send").props.loop)], [0, "Again to replace 2 items", "#f38ba8", true], "first press: nothing is copied, the arrow turns red");
ok(byId(root, "e1-README.md").props.bg?.[0].startsWith("#f38ba8") && !byId(root, "e1-Makefile").props.bg, "and so do the rows it would replace");
timers.splice(0).forEach((fn) => fn(cx));
eq([tipOf(w.render(), "send"), planned()?.[0]], [null, 3], "left alone, the press is taken back");
click(w.render(), "send");
click(w.render(), "send");
await settled();
eq(asked("run").map((a) => a.slice(a.lastIndexOf("--") + 1)), [[`${API}/README.md`, `${API}/suppliers.csv`, `${API}/tests`, `alpha:${SHOP}/`]], "second press in time: the copy starts");
eq(SHARED["glyph.copies"].slice(-1).map((c) => [c.name, c.n, c.one]), [["README.md", 3, false]], "three items are no single file");
// A pick that changes takes the first press back.
tap(w.render(), "e0-README.md");
click(w.render(), "send");
also(w.render(), "e0-import.py");
eq([tipOf(w.render(), "send"), planned()?.[0]], [null, 2], "another pick takes a first press back");
also(w.render(), "e0-README.md");
also(w.render(), "e0-import.py");
// Both sides on one folder: nowhere to copy to.
click(w.render(), "m1-local");
await settled();
click(w.render(), "p1-sp2");
await settled();
tap(w.render(), "e1-import.py");
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
eq(["t90", "t91", "t92"].map((id) => text(byId(root, `copy-${id}`))), ["stock-2026-11.parquet alpha 42% 11.2MB/s 00:07 left", "logs +2 bravo 11.2MB/s", "notes.txt This Mac"], "a single file shows scp's percent, its speed and the time left; several show the speed alone");
eq(byId(root, "copy-t91").props.tooltip[0], "logs +2: alpha → bravo, through this computer, into ~/kettle. stock-2026-11.parquet 42% 59MB 11.2MB/s 00:07 ETA", "hovering says the rest, with scp's own line");
eq(["t90", "t91", "t92"].map((id) => icons(byId(root, `copy-${id}`))[0]), ["arrow-right", "laptop", "arrow-right"], "a copy between two other machines that passes through this computer wears its laptop");
eq(byId(root, "copy-t92").props.tooltip[0], "notes.txt: bravo → This Mac, into ~/Downloads. scp: /home/me/notes.txt: Permission denied. Click to dismiss", "a failed one says why");
CALLS.length = 0; ASKS.length = 0;
click(root, "copy-t90");
click(root, "copy-t92");
await settled();
eq([runs(), asked("rm"), SHARED["glyph.copies"].map((c) => c.id)], [[["terminal.peek", { terminal: "t90" }]], [["rm", "t92"]], ["t90", "t91"]], "a copy under way is peeked at; a failed one is dismissed");
// A copy that ended may have changed a folder on show: both are read again, in place.
tap(w.render(), "e0-Makefile");
ASKS.length = 0;
SHARED["glyph.copies"] = [SHARED["glyph.copies"][1]];
w.tick(cx);
await settled();
eq([reads().map((a) => [a[3].on ?? null, a[2][3]]), [...w.sides[0].picked]], [[["alpha", SHOP], [null, API]], ["Makefile"]], "after a copy ends the folders are read again, and what is picked stays");
ASKS.length = 0;
w.tick(cx);
await settled();
eq(reads().length, 0, "and not again until something changes");
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

// Picking, as in a file manager. A fresh window: this computer's project on the left,
// alpha's on the right.
SHARED["glyph.side"] = { on: "alpha", path: SHOP };
delete SHARED["glyph.copies"];
w = new Transfer(cx);
await settled();
const picked = (i = 0) => rows(w.render(), i).filter((n) => w.sides[i].picked.has(n));
tap(w.render(), "e0-import.py");
tap(w.render(), "e0-README.md");
eq(picked(), ["README.md"], "a click picks that row alone");
tap(w.render(), "e0-tests", SHIFT);
eq(picked(), ["tests", ".venv", "import.py", "README.md"], "Shift-click: every row from the last one clicked to this one");
tap(w.render(), "e0-suppliers.csv", SHIFT);
eq(picked(), ["README.md", "stock-2026-11.parquet", "suppliers.csv"], "another Shift-click counts from the same row, in place of the first range");
also(w.render(), "e0-fixtures");
also(w.render(), "e0-stock-2026-11.parquet");
eq(picked(), ["fixtures", "README.md", "suppliers.csv"], "Cmd-click: one more, or one fewer");
tap(w.render(), "e0-.env", { shift: true, platform: true });
eq(picked(), ["fixtures", "README.md", "stock-2026-11.parquet", "suppliers.csv", ".env"], "Shift and Cmd: a range from the last one clicked, added to what is picked");
tap(w.render(), "e0-src", { control: true });
eq([picked().includes("src"), text(byId(w.render(), "send-count")), planned()?.[0]], [true, "6", 6], "Ctrl counts as Cmd; the arrow wears how many are picked");
tap(w.render(), "e0-README.md");
eq([picked(), Boolean(byId(w.render(), "send-count"))], [["README.md"], false], "a click on one of several picked rows leaves that one, and one row needs no count");
tap(w.render(), "e0-README.md");
eq(picked(), [], "a click on the one picked row lets it go");
tap(w.render(), "e0-src", SHIFT);
eq(picked(), ["src"], "Shift-click with no row to count from picks that row");
also(w.render(), "e0-tests");
press(w.render(), "blank0", 1, SHIFT);
lift(w.render(), "side0");
eq(picked(), ["src", "tests"], "a press on the empty part of a list with a key held changes nothing");
press(w.render(), "blank0");
lift(w.render(), "side0");
eq([picked(), w.sides[0].anchor], [[], null], "a press on the empty part lets go of what is picked");

// A sweep: hold a row and move down or up the list.
eq(glide(w.render(), "e0-.venv", { x: 100, y: 130 }), false, "the pointer over the rows with nothing held picks nothing");
press(w.render(), "e0-tests", 1, {}, { x: 100, y: 100 });
eq([glide(w.render(), "e0-tests", { x: 101, y: 103 }), w.hold.kind], [false, null], "a held row that barely moved is still a click");
glide(w.render(), "e0-.venv", { x: 102, y: 130 });
glide(w.render(), "e0-README.md", { x: 104, y: 190 });
eq([picked(), w.hold.kind], [["tests", ".venv", "import.py", "README.md"], "sweep"], "held and moved down: every row on the way is picked");
eq(glide(w.render(), "e0-README.md", { x: 110, y: 195 }), false, "moving within a row draws nothing again");
glide(w.render(), "e0-src", { x: 104, y: 70 });
eq(picked(), ["src", "tests"], "back up past the held row: the rows on its other side");
glide(w.render(), "e1-build", { x: 600, y: 70 });
glide(w.render(), "side1", { x: 600, y: 70 });
glide(w.render(), "transfer", { x: 600, y: 70 });
ASKS.length = 0;
root = w.render();
eq([Boolean(byId(root, "carried")), byId(root, "list1").props.bg[0] === byId(root, "list0").props.bg[0]], [false, true], "over the other side a sweep is still a sweep: nothing is carried");
lift(root, "side1");
await settled();
eq([picked(), asked("run").length, w.hold], [["src", "tests"], 0, null], "let go there, it copies nothing");
tap(w.render(), "e0-.env", SHIFT);
eq(picked(), ["tests", ".venv", "import.py", "README.md", "stock-2026-11.parquet", "suppliers.csv", ".env"], "a Shift-click after a sweep counts from the row the sweep began on");
press(w.render(), "blank0", 1, {}, { x: 100, y: 400 });
glide(w.render(), "e0-suppliers.csv", { x: 100, y: 300 });
lift(w.render(), "side0");
eq(picked(), ["suppliers.csv", ".env"], "held on the empty part and moved up: the rows from the last one");

// A carry: hold a picked row, move, and let go over the other side.
tap(w.render(), "e0-import.py");
also(w.render(), "e0-fixtures");
also(w.render(), "e0-tests");
press(w.render(), "e0-fixtures", 1, {}, { x: 200, y: 100 });
eq(picked(), ["fixtures", "tests", "import.py"], "a press on a picked row leaves the others picked");
glide(w.render(), "e0-tests", { x: 201, y: 112 });
root = w.render();
eq([w.hold.kind, picked(), byId(root, "e0-tests").props.opacity?.[0], byId(root, "e0-src").props.opacity, Boolean(byId(root, "carried"))], ["carry", ["fixtures", "tests", "import.py"], 0.5, undefined, false],
  "moved, whichever way: the picked rows are carried, faint in their place, and no other row is picked");
glide(root, "transfer", { x: 300, y: 140 });
root = w.render();
eq([text(byId(root, "carried")), icons(byId(root, "carried")), byId(root, "carried").props.left[0], byId(root, "carried").props.top[0]], ["import.py +2", ["file"], 312, 154], "what is carried is drawn by the pointer: the first name and how many more");
eq(glide(root, "transfer", { x: 301, y: 140 }), false, "a pointer that barely moved draws nothing again");
glide(root, "side1", { x: 600, y: 200 });
root = w.render();
eq([w.hold.over, byId(root, "list1").props.bg[0] === byId(root, "list0").props.bg[0], byId(root, "list1").props.border_color[0]], [1, false, "#cba6f7ff"], "over the other side: its list lights up");
byId(root, "side1").handlers.on_hover(false, cx);
root = w.render();
eq([w.hold.over, byId(root, "list1").props.bg[0] === byId(root, "list0").props.bg[0]], [null, true], "and no longer once the pointer has left it");
glide(root, "side1", { x: 600, y: 200 });
ASKS.length = 0; CALLS.length = 0;
lift(w.render(), "side1");
lift(w.render(), "transfer");
await settled();
eq(asked("run").map((a) => a.slice(a.lastIndexOf("--") + 1)), [[`${API}/import.py`, `${API}/fixtures`, `${API}/tests`, `alpha:${SHOP}/`]], "let go there: one copy starts, as from the arrow");
eq([picked(), w.hold, Boolean(byId(w.render(), "carried"))], [[], null, false], "and nothing is held or picked any more");
// A name that is already there: the carry is the first press.
tap(w.render(), "e0-README.md");
press(w.render(), "e0-README.md", 1, {}, { x: 200, y: 100 });
glide(w.render(), "e0-README.md", { x: 240, y: 101 });
glide(w.render(), "side1", { x: 600, y: 200 });
ASKS.length = 0; timers.length = 0;
lift(w.render(), "side1");
await settled();
root = w.render();
eq([asked("run").length, byId(root, "send").props.tooltip[0], picked()], [0, "Again to replace 1 item", ["README.md"]], "carried onto a name that is there: nothing is copied, and the arrow turns red");
click(root, "send");
await settled();
eq(asked("run").map((a) => a.slice(a.lastIndexOf("--") + 1)), [[`${API}/README.md`, `alpha:${SHOP}/`]], "a press on the red arrow replaces");
// A row that was not picked, held and moved sideways.
press(w.render(), "e0-import.py", 1, {}, { x: 200, y: 100 });
glide(w.render(), "e0-import.py", { x: 230, y: 104 });
eq([picked(), w.hold.kind], [["import.py"], "carry"], "a row that was not picked, held and moved sideways: picked alone, and carried");
glide(w.render(), "e0-src", { x: 260, y: 60 });
eq(picked(), ["import.py"], "the rows it passes are not picked");
ASKS.length = 0;
lift(w.render(), "side0");
await settled();
eq([asked("run").length, picked(), w.hold], [0, ["import.py"], null], "let go over its own side: nothing is copied, and it stays picked");
press(w.render(), "e0-import.py", 1, {}, { x: 200, y: 100 });
glide(w.render(), "e0-import.py", { x: 260, y: 100 });
glide(w.render(), "side1", { x: 600, y: 100 });
byId(w.render(), "side1").handlers.on_hover(false, cx);
lift(w.render(), "transfer");
await settled();
eq([asked("run").length, picked(), w.hold], [0, ["import.py"], null], "let go between the sides: the same");
// A hold whose release is never heard.
press(w.render(), "e0-import.py", 1, {}, { x: 200, y: 100 });
glide(w.render(), "e0-import.py", { x: 260, y: 100 });
timers.length = 0;
byId(w.render(), "transfer").handlers.on_hover(false, cx);
byId(w.render(), "transfer").handlers.on_hover(true, cx);
timers.splice(0).forEach((fn) => fn(cx));
ok(w.hold?.kind === "carry", "the pointer out of the window and back in a moment: still held");
byId(w.render(), "transfer").handlers.on_hover(false, cx);
timers.splice(0).forEach((fn) => fn(cx));
eq(w.hold, null, "out for longer: the hold is over");
glide(w.render(), "e0-src", { x: 100, y: 60 });
glide(w.render(), "side1", { x: 600, y: 100 });
lift(w.render(), "side1");
await settled();
eq([picked(), asked("run").length], [["import.py"], 0], "and the pointer back in the window picks and copies nothing");
press(w.render(), "e0-import.py", 1, {}, { x: 200, y: 100 });
glide(w.render(), "e0-import.py", { x: 260, y: 100 });
byId(w.render(), "m0-echo").handlers["on_mouse_down:left"]({}, cx);
eq(w.hold, null, "a press on a control ends a hold");
press(w.render(), "e0-tests", 1, {}, { x: 100, y: 100 });
w.hold.at -= 16000;
eq([glide(w.render(), "e0-README.md", { x: 100, y: 190 }), w.hold, picked()], [true, null, ["tests"]], "a hold nothing was heard of for a while is over too");
// Both sides on one folder: carried rows have nowhere to go.
click(w.render(), "m1-local");
await settled();
click(w.render(), "p1-sp2");
await settled();
tap(w.render(), "e0-import.py");
press(w.render(), "e0-import.py", 1, {}, { x: 200, y: 100 });
glide(w.render(), "e0-import.py", { x: 260, y: 100 });
glide(w.render(), "side1", { x: 600, y: 100 });
root = w.render();
ASKS.length = 0;
lift(root, "side1");
await settled();
eq([byId(root, "list1").props.bg[0] === byId(root, "list0").props.bg[0], asked("run").length], [true, 0], "the same folder on both sides: the other list does not light up, and nothing is copied");

// Directly between two other machines. First what copy.js learns: how this computer's ssh
// gets to a machine, and which of two machines gets to the other's password prompt.
const SEALED = (pin) => ["-F", "none", "-o", "StrictHostKeyChecking=yes", "-o", "UserKnownHostsFile=/dev/null", "-o", "GlobalKnownHostsFile=/dev/null",
  "-o", `KnownHostsCommand=/bin/echo * ${pin}`, "-o", "PubkeyAuthentication=no", "-o", "IdentityAgent=none",
  "-o", "PreferredAuthentications=password,keyboard-interactive", "-o", "ControlMaster=no", "-o", "ControlPath=none"];
const BRAVO = "ssh-ed25519 AAAAC3bravo";
const toBravo = { on: "alpha", far: "bravo", ok: true, user: "me", addr: "10.0.0.6", port: "22", pin: BRAVO };
{
  ASKS.length = 0;
  eq(await reach("bravo"), { user: "me", name: "bravo.lan", port: "22", addrs: ["bravo.lan", "10.0.0.6"], pin: BRAVO }, "a machine: its user, name and port as ssh has them, the number found for the name, and the ed25519 key on record");
  eq(await reach("me@10.0.0.7:2222"), { user: "me", name: "10.0.0.7", port: "2222", addrs: ["10.0.0.7"], pin: "ecdsa-sha2-nistp256 AAAAE2foxtrot" }, "a target with a port; a number is not looked up");
  eq(await reach("delta-2"), { user: "me", name: "delta-2", port: "22", addrs: ["delta-2"], pin: null }, "a machine with no host key on record here, and no number found for its name");
  // bravo was learned of when the window above showed it, so only the other two are asked about here.
  const execs = ASKS.filter((a) => a[0] === "exec").map((a) => [a[1], ...a[2].filter((x) => !x.includes("getent"))]);
  eq(execs, [["ssh", "-G", "-p", "2222", "--", "me@10.0.0.7"], ["ssh-keygen", "-F", "[10.0.0.7]:2222", "-f", "/Users/me/.ssh/known_hosts"],
    ["ssh", "-G", "--", "delta-2"], ...["/Users/me/.ssh/known_hosts", "/Users/me/.ssh/known_hosts2", "/etc/ssh/ssh_known_hosts"].map((f) => ["ssh-keygen", "-F", "delta-2", "-f", f]), ["sh", "-c", "glyph", "delta-2"]],
    "asked of this computer's ssh, of each of its lists of known hosts, and for the name's number");
  ASKS.length = 0;
  await reach("bravo");
  eq(ASKS.length, 0, "what was learned is kept a while");
  const fleet = globalThis.__fleet;
  ASKS.length = 0;
  eq(await hops("alpha", "bravo", fleet), [toBravo, { on: "bravo", far: "alpha", why: "connect to host 10.0.0.5 port 22: Connection timed out" }], "alpha gets to bravo's prompt, by its number; bravo does not get to alpha");
  const tries = ASKS.filter((a) => a[0] === "exec" && a[1] === "ssh" && a[3].on === "alpha" && a[2][0] !== "-V");
  eq(tries.map((a) => a[2]), ["me@bravo.lan", "me@10.0.0.6"].map((to) => [...SEALED(BRAVO), "-n", "-o", "BatchMode=yes", "-o", "ConnectTimeout=6", "-p", "22", "--", to, "true"]),
    "asked of alpha's own ssh: no settings, no key, the one host key, and nothing to log in with");
  eq(await hops("alpha", "foxtrot", fleet), [{ on: "alpha", far: "foxtrot", why: "it takes no password" }, { on: "foxtrot", far: "alpha", why: "its scp is OpenSSH 8.2, and 9 or later is needed" }], "a machine that takes no password, and one whose scp is too old");
  eq((await hops("bravo", "foxtrot", fleet))[0], { on: "bravo", far: "foxtrot", ok: true, user: "me", addr: "10.0.0.7", port: "2222", pin: "ecdsa-sha2-nistp256 AAAAE2foxtrot" }, "another port");
  eq((await hops("alpha", "charlie", fleet)).map((h) => h.why), ["charlie is not reached over ssh", "charlie is not reached over ssh"], "a machine reached by a command");
  eq((await hops("alpha", "echo", fleet))[0].why, "this computer has no host key on record for it", "a machine this computer has no host key for");
  const a = { on: "a", far: "b", ok: true }, b = { on: "b", far: "a", ok: true }, no = { on: "a", far: "b", why: "x" };
  eq([hopFor([a, b], "a"), hopFor([a, b], "b"), hopFor([no, b], "a"), hopFor([no, { ...b, ok: false }], "a"), hopFor(null, "a")], [a, b, b, null, null], "started where the files are when it can be, else where they go");
  const head = ["scp", "-r", ...SEALED(BRAVO), "-o", "ConnectTimeout=20", "-o", "NumberOfPasswordPrompts=1", "-P", "22", "--"];
  eq(directArgs({ from: "alpha", paths: ["/home/me/a b.txt", "/home/me/c [1]"], to: "bravo", dir: "/srv/in {y}" }, toBravo), [...head, "/home/me/a b.txt", "/home/me/c [1]", "me@10.0.0.6:/srv/in {y}/"],
    "started where the files are: every path as it is written");
  eq(directArgs({ from: "bravo", paths: ["/home/me/a[1] *.txt", "/home/me/b"], to: "alpha", dir: "/home/me" }, toBravo), [...head, "me@10.0.0.6:/home/me/a\\[1\\] \\*.txt", "me@10.0.0.6:/home/me/b", "/home/me/"],
    "started where they go: each one fetched from the far machine, its pattern letters escaped");
  const screen = async (out) => { globalThis.__hc = (args) => (args[0] === "read" ? { code: 0, stdout: out, stderr: "" } : null); const m = await meter("t1"); globalThis.__hc = null; return [m.ask, m.denied]; };
  eq([await screen("me@10.0.0.6's password: \n"), await screen("(me@10.0.0.6) Password:\n\n"), await screen("scp: /home/me/x: Permission denied\r\nx.txt  40%  1MB\n"), await screen("me@10.0.0.6: Permission denied (publickey,password).\r\nme@10.0.0.6's password: ")],
    [[true, false], [true, false], [false, false], [true, true]], "a screen that stands at a password prompt, and one where a login was refused (a file that may not be read is not that)");
  // scp's meter: how fast, how long is left, and its word for a copy that stopped moving.
  const read = async (out) => { globalThis.__hc = (args) => (args[0] === "read" ? { code: 0, stdout: out, stderr: "" } : null); const m = await meter("t1"); globalThis.__hc = null; return [m.pct, m.speed, m.eta, m.stalled]; };
  eq([await read("Makefile                 40%   1MB  11.2MB/s   00:07 ETA\n"), await read("big.iso    3%  512KB   0.0KB/s   --:-- ETA\n"), await read("big.iso   12%    1GB   1.2GB/s 1:02:33 ETA\n"),
    await read("big.iso   12%  100MB   0.0KB/s - stalled -\n"), await read("done.txt 100%  150MB  12.0MB/s   00:12    \n"), await read("me@10.0.0.6's password: ")],
    [[40, "11.2MB/s", "00:07", false], [3, "0.0KB/s", null, false], [12, "1.2GB/s", "1:02:33", false], [12, "0.0KB/s", null, true], [100, "12.0MB/s", null, false], [null, null, null, false]],
    "scp's meter gives the speed and the time left; a time without ETA is how long it took, and is not shown as time left");
}

// The window with two other machines on show.
spaces().forEach((s) => { s.active = s.id === "alpha/sp4"; });
SHARED["glyph.side"] = { on: "bravo", path: "/home/me" };
delete SHARED["glyph.copies"];
globalThis.__props = { role: "transfer", overlay: "ov8" };
delete SHARED["glyph.routes"];
const heldBefore = held;
timers.length = 0;
w = new Transfer(cx);
root = w.render();
eq([icons(byId(root, "direct-way")), byId(root, "direct-way").props.tooltip[0], Boolean(byId(root, "direct-key"))], [["ring"], "Checking if direct copy is available", false], "two other machines: the window asks whether one can log in to the other, and says only that it is checking");
{
  // The window takes the keyboard as it opens, so that keys stop going to the terminal behind it, and Esc closes it.
  const pending = timers.length;
  timers.forEach((fn) => fn(cx));
  timers.length = 0;
  CALLS.length = 0;
  const top = byId(w.render(), "transfer");
  top.handlers.on_key_down({ key: "a" }, cx);
  const quiet = CALLS.length;
  top.handlers.on_key_down({ key: "escape" }, cx);
  eq([held - heldBefore, pending > 0, Boolean(top.props.track_focus), quiet, CALLS.filter((c) => c[0] === "closeOverlay").map((c) => c[1])], [2, true, true, 0, ["ov8"]], "the window takes the keyboard as it opens and a moment later; a letter does nothing, Esc closes it");
  CALLS.length = 0;
}
await settled();
root = w.render();
eq([w.secret.masked, w.secret.placeholder], [true, "password"], "the password field hides what is typed");
eq([icons(byId(root, "direct-way")), text(byId(root, "direct-way")), byId(root, "direct-key").children[0].__node.kind, Boolean(byId(root, "send-way"))],
  [["bolt", "server"], "me @ bravo", "Input", false], "one can: a bolt, the user and the machine whose password a copy takes, and the field, before any row is picked");
eq(byId(root, "direct-way").props.tooltip[0], "alpha logs in to bravo. Enter me@bravo's password to enable direct copy",
  "it says which of the two logs in to the other, and what the password does");
stopped = 0;
byId(root, "direct-key").handlers["on_mouse_down:left"]({}, cx);
eq([w.secret.focused, stopped], [1, 1], "a press on the field's box gives it the keyboard, and does not move the window");
tap(root, "e0-Makefile");
root = w.render();
eq([text(byId(root, "direct-way")), Boolean(byId(root, "direct-key"))], ["me @ bravo", true], "with a row picked: the same user, machine and field");
eq([tipOf(root, "send"), icons(byId(root, "send-way")), tipOf(root, "send-way")], [null, ["laptop"], "Through this computer"],
  "no password: the arrow wears this computer's laptop, which says the copy passes through here");
// Left empty, the copy is the one there always was.
ASKS.length = 0;
click(root, "send");
await settled();
eq(asked("run").map((a) => a.slice(0, 12)), [["run", "--bg", "--no-parent", "--no-notify", "--json", "--label", "glyph.copy=1", "--", "scp", "-3", "-r", "-o"]], "left empty: through this computer, as before");
// With a password: started on the machine the files are on, and the password typed at its prompt.
let screenNow = "";
const sent = [];
globalThis.__hc = (args) => {
  if (args[0] === "run") return { code: 0, stdout: JSON.stringify({ address: `alpha/t${7 + sent.length}`, state: "live" }), stderr: "" };
  if (args[0] === "read") return { code: 0, stdout: screenNow, stderr: "" };
  return null;
};
delete SHARED["glyph.copies"];
tap(w.render(), "e0-Makefile");
w.secret.type("pw -one", cx);
root = w.render();
eq([byId(root, "direct-key").props.border_color[0], byId(root, "direct-way").props.text_color[0]], ["#cba6f7", "#cba6f7"], "a password typed: the field's border and the bolt light up");
eq([icons(byId(root, "send-way")), byId(root, "send-way").props.tooltip[0], byId(root, "send-way").props.text_color[0]], [["bolt"], "Direct copy from alpha to bravo", "#cba6f7"], "and the arrow wears a bolt, which says the copy is direct");
ASKS.length = 0; timers.length = 0; screenNow = "";
w.secret.submit(cx);
await settled();
eq(asked("run"), [["run", "--on", "alpha", "--bg", "--no-parent", "--no-notify", "--json", "--label", "glyph.copy=1", "--", "scp", "-r", ...SEALED(BRAVO), "-o", "ConnectTimeout=20", "-o", "NumberOfPasswordPrompts=1", "-P", "22", "--", `${SHOP}/Makefile`, "me@10.0.0.6:/home/me/"]],
  "Enter in the field starts it: scp on alpha, in a terminal of hc's there");
eq(SHARED["glyph.copies"].map(({ at: _at, ...c }) => c), [{ id: "alpha/t7", from: "alpha", to: "bravo", dir: "/home/me", name: "Makefile", n: 1, one: true, direct: "bravo" }], "it is listed, with the machine it logs in to");
eq([w.secret.value(), JSON.stringify(SHARED).includes("pw -one"), w.keys.get("alpha/t7")], ["", false, { secret: "pw -one", armed: true, left: 1 }], "the field is emptied, and the password is held by the window alone, for that copy");
eq([asked("send"), timers.length], [[], 1], "no prompt yet: nothing is typed, and the screen is looked at again soon");
screenNow = "me@10.0.0.6's password: ";
timers.splice(0).forEach((fn) => fn(cx));
await settled();
eq([asked("send"), w.keys.size], [[["send", "--force", "--", "alpha/t7", "pw -one"]], 0], "at the prompt: typed once, and let go of");
timers.splice(0).forEach((fn) => fn(cx));
w.tick(cx);
await settled();
root = w.render();
eq([asked("send").length, asked("kill").length, timers.length], [1, 0, 0], "the prompt still on the screen is not typed into twice");
eq([icons(byId(root, "copy-alpha/t7")).includes("bolt"), byId(root, "copy-alpha/t7").props.tooltip[0]], [true, "Makefile: alpha → bravo, direct, into ~. me@10.0.0.6's password:"], "its pill wears the bolt");
screenNow = "Makefile                 40%   1MB  11.2MB/s   00:07 ETA\n";
w.tick(cx);
await settled();
eq(text(byId(w.render(), "copy-alpha/t7")), "Makefile bravo 40% 11.2MB/s 00:07 left", "then scp's percent, speed and time left, as for any copy");
screenNow = "Makefile                 40%   1MB   0.0KB/s - stalled -\n";
w.tick(cx);
await settled();
eq(text(byId(w.render(), "copy-alpha/t7")), "Makefile bravo 40% 0.0KB/s stalled", "a copy that stopped moving says so, in scp's word");
// A window that holds no password for a copy at its prompt says so, and the peek takes the typing.
screenNow = "me@10.0.0.6's password: ";
w.fed.clear();
w.tick(cx);
await settled();
root = w.render();
eq([asked("send").length, byId(root, "copy-alpha/t7").props.tooltip[0]], [1, "Makefile: alpha → bravo, direct, into ~. Click to type bravo's password"], "a prompt this window has no password for: the pill asks");
CALLS.length = 0;
click(root, "copy-alpha/t7");
eq(runs(), [["terminal.peek", { terminal: "alpha/t7" }]], "a click peeks at its terminal, where it can be typed");
// Files that come from the far machine are a login each: every prompt gets the password, once.
delete SHARED["glyph.copies"]; sent.push(1);
tap(w.render(), "e1-fieldnotes");
also(w.render(), "e1-kettle");
root = w.render();
eq([text(byId(root, "direct-way")), icons(byId(root, "send-way"))], ["me @ bravo", ["laptop"]], "the other way round: bravo can't log in to alpha, so alpha would fetch, with bravo's password again");
eq(byId(root, "direct-way").props.tooltip[0].split(". ")[0], "alpha logs in to bravo", "and the bolt says which of them logs in");
w.secret.type("pw two", cx);
ASKS.length = 0; timers.length = 0; screenNow = "";
click(w.render(), "send");
await settled();
eq(asked("run").map((a) => [a.slice(0, 3), a.slice(a.lastIndexOf("--") + 1)]), [[["run", "--on", "alpha"], ["me@10.0.0.6:/home/me/fieldnotes", "me@10.0.0.6:/home/me/kettle", `${SHOP}/`]]], "started on alpha, which fetches each one from bravo");
eq(w.keys.get("alpha/t8"), { secret: "pw two", armed: true, left: 2 }, "two logins to come");
const look = async (out) => { screenNow = out; w.tick(cx); await settled(); return asked("send").length; };
eq([await look("me@10.0.0.6's password: "), await look("me@10.0.0.6's password: "), await look("fieldnotes/a.md 100% 2KB\n"), w.keys.get("alpha/t8")?.left, await look("fieldnotes/a.md 100% 2KB\nme@10.0.0.6's password: "), w.keys.size],
  [1, 1, 1, 1, 2, 0], "each prompt is typed into once, and after the last the password is let go of");
// A login that was refused ends the copy: the same password is not tried again.
delete SHARED["glyph.copies"]; sent.push(1);
tap(w.render(), "e1-fieldnotes");
also(w.render(), "e1-kettle");
w.secret.type("wrong", cx);
ASKS.length = 0; timers.length = 0; screenNow = "";
click(w.render(), "send");
await settled();
eq([await look("me@10.0.0.6's password: "), await look("me@10.0.0.6: Permission denied (publickey,password).\r\nscp: Connection closed\r\nme@10.0.0.6's password: "), asked("kill"), w.keys.size],
  [1, 1, [["kill", "alpha/t9"]], 0], "refused: the copy is ended, and nothing more is typed");
// The password in the field is for one machine: it goes when the field would be for another, or for none.
tap(w.render(), "e0-Makefile");
w.secret.type("for bravo", cx);
tap(w.render(), "e0-Makefile");
eq([[...w.sides[0].picked], w.secret.value(), Boolean(byId(w.render(), "direct-key"))], [[], "for bravo", true], "nothing picked any more: the field is still for bravo, and keeps what was typed");
// Typed before any row is picked, it is the password of the copy that follows.
ASKS.length = 0; timers.length = 0; screenNow = ""; sent.push(1);
tap(w.render(), "e0-Makefile");
click(w.render(), "send");
await settled();
eq([asked("run").map((a) => a.slice(0, 3)), w.secret.value(), w.keys.get("alpha/t10")?.secret], [[["run", "--on", "alpha"]], "", "for bravo"], "a password typed first, then a row picked: the copy goes directly with it");
w.keys.clear(); timers.length = 0;
delete SHARED["glyph.copies"];
// Two machines that can each log in to the other: the password is that of the machine the
// files go to, so with nothing picked the field is for the right side's.
const bothWays = [{ on: "alpha", far: "bravo", ok: true, user: "me", addr: "10.0.0.6", port: "22", pin: BRAVO }, { on: "bravo", far: "alpha", ok: true, user: "you", addr: "10.0.0.5", port: "22", pin: BRAVO }];
const oneWay = w.routes.get("alpha\nbravo");
w.routes.set("alpha\nbravo", { asking: false, at: Date.now(), hops: bothWays });
w.guard();
root = w.render();
eq([text(byId(root, "direct-way")), byId(root, "direct-way").props.tooltip[0].split(". ")[0]],
  ["me @ bravo", "alpha logs in to bravo"],
  "both can: with nothing picked, the field is for the machine on the right");
w.secret.type("for bravo", cx);
tap(w.render(), "e1-fieldnotes");
root = w.render();
eq([text(byId(root, "direct-way")), w.secret.value(), byId(root, "direct-way").props.tooltip[0].split(". ")[0]], ["you @ alpha", "", "bravo logs in to alpha"],
  "a row picked on the right: the copy would log in to alpha, and bravo's password is not left in the field");
tap(w.render(), "e1-fieldnotes");
w.routes.set("alpha\nbravo", oneWay);
w.guard();
tap(w.render(), "e0-Makefile");
w.secret.type("for bravo", cx);
click(w.render(), "m1-foxtrot");
await settled();
root = w.render();
eq([w.secret.value(), byId(root, "direct-way").props.opacity?.[0], byId(root, "direct-way").props.tooltip[0]],
  ["", 0.45, "No direct copy. alpha → foxtrot: it takes no password. foxtrot → alpha: its scp is OpenSSH 8.2, and 9 or later is needed"], "another machine on show: the field is emptied. Two of which neither can log in to the other: a faint bolt that says why");
eq([[...w.sides[0].picked], Boolean(byId(root, "direct-key")), icons(byId(root, "send-way"))], [["Makefile"], false, ["laptop"]], "and, with the row still picked, no field for them");
click(w.render(), "m1-local");
await settled();
eq(Boolean(byId(w.render(), "direct")), false, "this computer on one side: nothing about a direct way");
// What was learned of two machines is kept for the next window, which shows it at once.
{
  const kept = SHARED["glyph.routes"]["alpha\nbravo"];
  SHARED["glyph.side"] = { on: "bravo", path: "/home/me" };
  const next = new Transfer(cx);
  eq([kept.hops.map((h) => Boolean(h.ok)), icons(byId(next.render(), "direct-way")), Boolean(byId(next.render(), "direct-key")), JSON.stringify(SHARED["glyph.routes"]).includes("for bravo")],
    [[true, false], ["bolt", "server"], true, false], "a window opened again shows the bolt and the field at once, from what the last one learned; no password is kept with it");
  SHARED["glyph.routes"]["alpha\nbravo"] = { ...kept, at: 1 };
  const later = new Transfer(cx);
  const first = icons(byId(later.render(), "direct-way"));
  await settled();
  eq([first, SHARED["glyph.routes"]["alpha\nbravo"].at > 1], [["bolt", "server"], true], "an old answer is shown while the machines are asked again, and the new one is kept");
}
// The window closing takes its passwords with it.
click(w.render(), "m1-bravo");
await settled();
tap(w.render(), "e0-Makefile");
w.secret.type("held", cx);
w.keys.set("alpha/t99", { secret: "held", armed: true, left: 1 });
w.gone();
eq([w.secret.value(), w.keys.size], ["", 0], "closing the window lets go of every password");
globalThis.__hc = null;
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
// Asked for again while the window shows, it closes.
{
  const overlays = () => CALLS.filter((c) => c[0].endsWith("Overlay"));
  globalThis.__props = { role: "transfer", overlay: "ov9" };
  let open = new Transfer(cx);
  globalThis.__props = { role: "bar" };
  CALLS.length = 0;
  globalThis.__deliver("transfer");
  await settled();
  eq(overlays(), [["closeOverlay", "ov9"]], "the key again, with the window on show: it closes");
  open.gone();
  CALLS.length = 0;
  click(bar.render(), "transfer");
  eq(overlays(), [["openOverlay", spec]], "and once more opens it");
  globalThis.__props = { role: "transfer", overlay: "ov10" };
  open = new Transfer(cx);
  globalThis.__props = { role: "bar" };
  CALLS.length = 0;
  click(bar.render(), "transfer");
  eq(overlays(), [["closeOverlay", "ov10"]], "the button closes it too");
  CALLS.length = 0;
  click(bar.render(), "transfer");
  eq(overlays(), [["openOverlay", spec]], "a window that did not go when told is not asked twice: the next press opens one");
  open.gone();
  globalThis.__props = { role: "transfer", overlay: "ov11" };
  open = new Transfer(cx);
  open.gone();
  globalThis.__props = { role: "bar" };
  CALLS.length = 0;
  globalThis.__deliver("transfer");
  await settled();
  eq(overlays(), [["openOverlay", spec]], "a window closed by its own x: the key opens it again");
  // What a copy's notice sends when clicked: it opens the window, and leaves an open one alone.
  CALLS.length = 0;
  globalThis.__deliver("transfer-show");
  await settled();
  eq(overlays(), [["openOverlay", spec]], "a clicked notice opens the window");
  globalThis.__props = { role: "transfer", overlay: "ov12" };
  open = new Transfer(cx);
  globalThis.__props = { role: "bar" };
  CALLS.length = 0;
  globalThis.__deliver("transfer-show");
  await settled();
  eq(overlays(), [], "and does nothing when it shows already");
  open.gone();
}
const copy = (id, more = {}) => ({ id, from: null, to: "alpha", dir: SHOP, name: "import.py", n: 2, one: false, at: Date.now() - 5000, ...more });
const scp = { key: "program", name: "scp", icon: null, shell: false, agent: false };
terminals().push({ address: "t70", state: "live", status: null, parent: null, program: scp, report: {} });
SHARED["glyph.copies"] = [copy("t70"), copy("t71", { at: Date.now() }), copy("t72", { failed: "scp: nope" })];
root = bar.render();
eq(byId(root, "transfer").props.tooltip[0], "Copy files between machines  ⇧⌘T, 2 under way, 1 failed", "it counts the copies");
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
eq(CALLS.filter((c) => c[0] === "notify").map((c) => [c[1].body, c[1].action]), [["This Mac → alpha, into ~/acme-shop-backend", { name: "glyph.transfer-show" }], ["scp: /home/me/x: No space left on device", { name: "glyph.transfer-show" }]], "where it went, or scp's last line; a click on either opens the window");
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
// A direct copy whose login was refused says so by the machine's name; a host key that is
// not the one on record is said as ssh says it.
globalThis.__hc = (args) => {
  if (args[0] === "get") return { code: 0, stdout: JSON.stringify({ state: "finished", exit_code: 1 }), stderr: "" };
  const screens = { "alpha/t80": "me@10.0.0.6: Permission denied (publickey,password).\r\nscp: Connection closed\r\n", "alpha/t81": "Host key verification failed.\r\nscp: Connection closed\r\n", "alpha/t82": "me@10.0.0.6's password: \r\n" };
  if (args[0] === "read") return { code: 0, stdout: screens[args[1]], stderr: "" };
  return null;
};
SHARED["glyph.copies"] = ["alpha/t80", "alpha/t81", "alpha/t82"].map((id) => copy(id, { from: "alpha", to: "bravo", direct: "bravo" }));
for (const c of SHARED["glyph.copies"]) await settle(c);
eq(SHARED["glyph.copies"].map((c) => c.failed), ["bravo did not take the password", "Host key verification failed.", "ended at bravo's password prompt"],
  "a direct copy that was refused says which machine refused; a wrong host key is told as ssh tells it; one ended at its prompt says that");
// A copy between two other machines that ended well says which way it went.
globalThis.__hc = (args) => (args[0] === "get" ? { code: 0, stdout: JSON.stringify({ state: "finished", exit_code: 0 }), stderr: "" } : null);
SHARED["glyph.copies"] = [copy("alpha/t83", { from: "alpha", to: "bravo", direct: "bravo" }), copy("t84", { from: "alpha", to: "bravo" })];
CALLS.length = 0;
for (const c of [...SHARED["glyph.copies"]]) await settle(c);
eq(CALLS.filter((c) => c[0] === "notify").map((c) => c[1].body), ["alpha → bravo, direct, into ~/acme-shop-backend", "alpha → bravo, through this computer, into ~/acme-shop-backend"], "the notice of a copy between two other machines says which way it went");
// A copy dismissed while hc was being asked how it ended is not told.
SHARED["glyph.copies"] = [];
CALLS.length = 0;
await settle(copy("alpha/t80", { direct: "bravo" }));
eq([said(), SHARED["glyph.copies"]], [[], []], "one that is no longer listed: nothing is said");
SHARED["glyph.copies"] = [copy("t74", { failed: "x" }), copy("t75")];
// settle() by itself: hc out of reach changes nothing.
globalThis.__hc = (args) => (args[0] === "get" ? { code: 1, stdout: "", stderr: "core did not answer" } : null);
await settle(copy("t75"));
eq(SHARED["glyph.copies"].map((c) => c.id), ["t74", "t75"], "hc out of reach: the copy stays listed");
globalThis.__hc = (args) => (args[0] === "get" ? { code: 3, stdout: "", stderr: '{"error":{"kind":"machine_unreachable","message":"alpha is connecting"}}' } : null);
await settle(copy("t75"));
eq(SHARED["glyph.copies"].map((c) => c.id), ["t74", "t75"], "a machine that can't be asked just now: its copy stays listed too");
globalThis.__hc = null;

// A folder is read with the machine's own sh. A Windows computer has none unless someone
// installed one: a side there says so, where any other says what Herdr said.
{
  const said = (on) => listing(on, "/nowhere").then(() => "listed", (e) => e.message);
  globalThis.__nosh = true;
  const mac = await said(null);
  globalThis.__platform = "windows";
  const here = await said(null), there = await said("alpha");
  delete globalThis.__platform;
  delete globalThis.__nosh;
  eq([mac, here], ["could not start sh: program not found", NO_SH], "sh missing: a Mac says Herdr's words, a Windows computer that it has no sh");
  ok(there !== NO_SH && /No such file/.test(there), "another machine, shown from a Windows computer, is still read with its own sh");
  globalThis.__platform = "windows";
  const fine = await listing(null, "").then((r) => r.entries.length > 0, () => false);
  delete globalThis.__platform;
  ok(fine, "a Windows computer that has an sh is read like any other");
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
