// The Go-to list (goto.js), and the three ways the bar opens it.
// Run: sh logic/run.sh goto-test.mjs (the shown tab is alpha/tb9, "relay").
import { Goto } from "./goto.mjs";
import { Bar } from "./bar.mjs";
import { byId, walk } from "./kit-stub.mjs";
import { CALLS, SHARED } from "./herdr-fake.mjs";

let failed = 0, passed = 0;
const ok = (cond, what) => { if (cond) passed++; else { failed++; console.log("FAIL:", what); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const timers = [];
const cx = {
  notify() {}, stop_propagation() {}, spawn(fn) { return Promise.resolve().then(() => fn(cx)); },
  timer: { every() {}, after(ms, fn) { timers.push({ ms, fn }); } }, focus_handle: () => ({ focus() {} }),
};
const fire = (ms) => { for (const t of timers.splice(0)) if (t.ms === ms) t.fn(cx); else timers.push(t); };
const text = (node) => { const out = []; const go = (n) => { for (const c of n.children) { if (typeof c === "string") out.push(c); else if (c?.__node) go(c.__node); } }; go(node); return out.join(" "); };
const ids = (root) => { const all = []; walk(root, (n) => { if (n.id?.startsWith("go-")) all.push(n.id); }); return all; };
const rowsOf = (root) => ids(root).filter((i) => !i.startsWith("go-space-") && i !== "go-list");
const SPEC = { mod: "glyph", kind: "popup", at: "top", offset: 40, width: 560, height: 0.8, props: { role: "goto" } };
const ctrlD = { key: "d", modifiers: { control: true } };
// A list as the popup would hold it. `key` presses a key and draws again. The list before
// it is gone, as the app tells a copy whose overlay closed.
let last = null;
const fresh = () => {
  globalThis.__props = { role: "goto", overlay: "ov7" };
  last?.gone();
  CALLS.length = 0; timers.length = 0; delete SHARED["glyph.shut"];
  const g = (last = new Goto(cx));
  const api = { g, root: g.render() };
  api.draw = () => (api.root = g.render());
  api.key = (e) => { byId(api.root, "goto").handlers.on_key_down(typeof e === "string" ? { key: e, modifiers: {} } : e, cx); return api.draw(); };
  api.type = (words) => { g.input.type(words, cx); return api.draw(); };
  return api;
};

// What it lists: every tab, in the rail's order and by the rail's words.
{
  const a = fresh();
  eq(ids(a.root).slice(0, 9), ["go-list", "go-space-sp1", "go-tb1", "go-tb2", "go-space-sp2", "go-tb3", "go-tb4", "go-tb5", "go-space-sp3"], "projects and their tabs, top to bottom");
  eq(rowsOf(a.root).length, 21, "every tab has a row");
  eq(["tb1", "tb2", "tb4", "tb5", "alpha/tb8", "alpha/tb15", "alpha/tb16"].map((id) => text(byId(a.root, `go-${id}`))),
    ["Sync design notes", "Action review of the diff", "notes", "api", "acme.cpp", "Codex", "acme.cpp"],
    "an unnamed tab goes by its agent's title, else its folder or program; a named one by its name");
  ok(!rowsOf(a.root).some((id) => /^\d+$/.test(text(byId(a.root, id)))), "no tab is listed by its number");
  const lines = []; walk(a.root, (n) => { if (n.kind === "h_flex" && !n.id && n.children.some((c) => c?.__node?.kind === "svg" && /laptop|server/.test(c.__node.arg))) lines.push(text(n)); });
  eq(lines, ["This Mac", "alpha", "bravo", "foxtrot"], "a line for each machine with tabs, none for the rest");
  // It opens on where you are, and that row is in sight.
  eq([a.g.list().sel?.id, Boolean(byId(a.root, "go-alpha/tb9").props.bg), Boolean(byId(a.root, "go-alpha/tb8").props.bg)], ["alpha/tb9", true, false], "it opens on the shown tab");
  eq(a.g.scroll.asked, [14], "and asks for that row to be in sight");
  fire(600);
  eq(a.g.scroll.asked, [14, 14], "once more when the popup has been laid out");
  eq(byId(a.root, "go-tb3").props.tooltip[0], "Stock importer: supplier detection  ·  inventory-and-order-reports  ·  needs you", "hovering a row says the rest");
  // A scrolling area has no height of its own: the list is given one, and no more than 520.
  eq(byId(a.root, "go-list").props.h[0], 520, "a long list is as tall as it may be, and scrolls");
  a.type("bravo");
  eq([rowsOf(a.root).length, byId(a.root, "go-list").props.h[0]], [2, 26 + 30 * 4 + 4], "a short one is as tall as its rows: a machine, two projects, a tab each");
}

// Moving and going.
{
  const a = fresh();
  a.key("down");
  eq([a.g.list().sel.id, a.g.scroll.asked.at(-1)], ["alpha/tb10", 15], "down picks the next tab and keeps it in sight");
  a.key("enter");
  eq(CALLS, [["closeOverlay", "ov7"], ["run", "pane.focus", { pane: "p10" }]], "Enter closes the list and goes to the picked tab, as a rail row does");
  a.key("enter"); a.g.input.submit(cx); byId(a.root, "go-tb1").handlers.on_click({}, cx);
  eq(CALLS.length, 2, "once gone it does nothing more");
}
{
  const a = fresh();
  for (let i = 0; i < 3; i++) a.key("up");
  // Up from alpha/tb9: tb8, tb7, then This Mac's last tab; a project's first tab brings its lines along.
  eq([a.g.list().sel.id, a.g.scroll.asked.slice(-2)], ["tb6", [10, 8]], "up walks across projects and machines; a first tab shows its project's and machine's lines");
  const b = fresh();
  b.g.at = 0; b.draw(); b.key("up");
  eq([b.g.list().sel.id, b.g.scroll.asked.at(-1)], ["foxtrot/tb21", 32], "up from the first tab goes around to the last, which is asked for itself");
  b.key("down");
  eq([b.g.list().sel.id, b.g.scroll.asked.at(-1)], ["tb1", 0], "and down from the last goes back to the top of the list");
  // The field's own Enter, and a click.
  const c = fresh();
  c.g.input.submit(cx);
  eq(CALLS, [["closeOverlay", "ov7"], ["run", "pane.focus", { pane: "p9" }]], "Enter in the field goes too");
  const d = fresh();
  byId(d.root, "go-bravo/tb20").handlers.on_click({}, cx);
  eq(CALLS, [["closeOverlay", "ov7"], ["run", "pane.focus", { pane: "p20" }]], "a click on a row goes there");
  const e = fresh();
  byId(e.root, "go-space-bravo/sp7").handlers.on_click({}, cx);
  eq(CALLS, [["closeOverlay", "ov7"], ["run", "space.select", { id: "bravo/sp7" }]], "a click on a project's line shows the project");
  const f = fresh();
  f.key("escape");
  eq(CALLS, [["closeOverlay", "ov7"]], "Esc leaves");
}

// Typing narrows the list: every word has to be in a tab's words, project, machine or program.
{
  const a = fresh();
  a.type("codex al");
  eq(rowsOf(a.root), ["go-alpha/tb8", "go-alpha/tb9", "go-alpha/tb10", "go-alpha/tb15", "go-alpha/tb16", "go-alpha/tb17", "go-alpha/tb18"], "two words: Codex tabs on alpha, and the tabs of a project called codex there");
  eq([a.g.list().sel.id, a.g.scroll.asked.at(-1)], ["alpha/tb8", 0], "the first match is picked, from the top of the list");
  ok(!ids(a.root).includes("go-space-sp1") && ids(a.root).includes("go-space-alpha/sp4"), "a project with no match has no line");
  a.type("SUPPLIER");
  eq(rowsOf(a.root), ["go-tb3"], "an agent's own title is found, whatever the case");
  a.type("fuzz");
  eq([rowsOf(a.root), text(byId(a.root, "go-alpha/tb8"))], [["go-alpha/tb8"], "acme.cpp"], "a named tab is found by what its agent says, too");
  a.type("zzz");
  eq([rowsOf(a.root), text(byId(a.root, "go-list")), byId(a.root, "go-list").props.h[0]], [[], "No tab by that name", 36], "nothing matches: the list says so");
  a.key("down"); a.key("up"); a.key("enter"); a.key(ctrlD);
  eq(CALLS, [], "and no key does anything there");
  a.type("");
  eq([rowsOf(a.root).length, a.g.list().sel.id], [21, "tb1"], "cleared: everything again, from the top");
}

// Ctrl+D closes the picked tab: a shell at once, anything else at the second press.
{
  const a = fresh();
  a.key(ctrlD);
  const row = byId(a.root, "go-alpha/tb9");
  eq([CALLS, row.props.tooltip[0], row.props.bg[0].length], [[], "Again to close", 9], "an agent's tab, first press: nothing closes, its row turns red");
  a.key(ctrlD);
  eq([CALLS, SHARED["glyph.shut"]?.id], [[["closeOverlay", "ov7"], ["run", "glyph.shut", undefined]], "alpha/tb9"], "second press: the list closes and the bar is asked to close that tab");
  const b = fresh();
  b.key(ctrlD); b.key("down");
  eq([b.g.sure, byId(b.root, "go-alpha/tb9").props.tooltip[0] === "Again to close"], [null, false], "moving off takes the first press back");
  b.key(ctrlD); b.key("up"); b.key("down"); b.key(ctrlD);
  eq(CALLS, [], "a press on one tab does not count for another");
  const c = fresh();
  c.key(ctrlD); fire(3000); c.draw(); c.key(ctrlD);
  eq([CALLS, Boolean(c.g.sure)], [[], true], "a second press after 3 s counts as a first");
  const d = fresh();
  d.type("notes inventory");
  d.key(ctrlD);
  eq([rowsOf(d.root), CALLS, SHARED["glyph.shut"]?.id], [["go-tb4"], [["closeOverlay", "ov7"], ["run", "glyph.shut", undefined]], "tb4"], "a plain shell closes at one press");
}

// The bar opens it: the key's command, the project's name, the search button.
{
  last?.gone();
  globalThis.__props = { role: "bar" };
  CALLS.length = 0;
  const bar = new Bar(cx);
  const root = bar.render();
  await new Promise((r) => setTimeout(r, 5));
  globalThis.__deliver("goto");
  await new Promise((r) => setTimeout(r, 5));
  byId(root, "crumb").handlers.on_click({}, cx);
  byId(root, "search").handlers.on_click({}, cx);
  eq(CALLS.filter((c) => c[0] === "openOverlay").map((c) => c[1]), [SPEC, SPEC, SPEC], "glyph.goto, a click on the project's name and the search button open the list");
  ok(!CALLS.some((c) => c[0] === "run" && c[1] === "mod.open"), "Herdr's own picker is not opened");
  eq(byId(root, "search").props.tooltip[0], "Go to a tab  ⌘P", "the search button's words, with the key keys.json gives it");
  // Asked for again while a list shows, the list closes. Once it is gone, however it went,
  // the next ask opens one.
  const ask = async () => { CALLS.length = 0; globalThis.__deliver("goto"); await new Promise((r) => setTimeout(r, 5)); return CALLS.map((c) => c[0] + (c[0] === "closeOverlay" ? " " + c[1] : "")); };
  globalThis.__props = { role: "goto", overlay: "ov1" };
  const list = new Goto(cx);
  eq(await ask(), ["closeOverlay ov1"], "the key again closes the list on show");
  list.gone();
  eq(await ask(), ["openOverlay"], "closed from outside (Esc, a press beside it): the key opens it again");
  const next = new Goto(cx);
  byId(next.render(), "goto").handlers.on_key_down({ key: "escape", modifiers: {} }, cx);
  eq(await ask(), ["openOverlay"], "closed by its own Esc: the same");
  // A list that is gone does not take a newer one's place with it.
  globalThis.__props = { role: "goto", overlay: "ov2" };
  new Goto(cx);
  globalThis.__props = { role: "goto", overlay: "ov1" };
  list.gone();
  eq(await ask(), ["closeOverlay ov2"], "an older list going leaves the newer one known");
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
