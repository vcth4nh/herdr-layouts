// Closing, as the bar does it: two presses for what isn't a plain shell, the tab of its
// project used last shown next, a project's empty page in place of its last tab, the page that
// stands by for a last tab that ends by itself, the project beside it on its machine when
// one closes, and the keys that start things. Also the number the bar puts on the Dock icon.
// Run: ACTIVE=sp2 sh logic/run.sh close-test.mjs
// The fake app does nothing by itself: after each command the test changes the flock the
// way Herdr was seen to (a new tab is shown; one made with focus false goes last and is not
// shown; closing the shown tab shows the one after it, the one before it for the last, put
// away or not; closing an unshown tab moves nothing; a project goes with its last tab; a
// closed peek gives the keyboard back to the pane under it). By Herdr's manual, not seen: a
// tab that was put away comes back when a command shows it.
import { Bar } from "./bar.mjs";
import { model } from "./data.mjs";
import { byId } from "./kit-stub.mjs";
import { spaces, panes, CALLS, SHARED, FOCUS, BADGES } from "./herdr-fake.mjs";

let failed = 0, passed = 0;
const ok = (cond, what) => { if (cond) passed++; else { failed++; console.log("FAIL:", what); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const timers = [];
const cx = {
  notify() {}, stop_propagation() {}, spawn(fn) { Promise.resolve().then(() => fn(cx)); },
  timer: { every() {}, after(ms, fn) { timers.push({ ms, fn }); } },
};
const tick = () => new Promise((r) => setTimeout(r, 5));
const fire = (ms) => { for (const t of timers.splice(0)) if (t.ms === ms) t.fn(cx); else timers.push(t); };
const runs = () => CALLS.filter((c) => c[0] === "run").map((c) => [c[1], c[2]]);
const sp = (id) => spaces().find((s) => s.id === id);
const SHAPE = JSON.stringify([spaces(), panes()]);

// The flock as it was, with project `id` on show and its tab number `n` (from 0) the shown one.
function world(id, n) {
  const [S, P] = JSON.parse(SHAPE);
  spaces().splice(0, spaces().length, ...S);
  panes().splice(0, panes().length, ...P);
  for (const s of spaces()) s.active = s.id === id;
  if (n !== undefined) sp(id).tabs.forEach((c, i) => { c.active = i === n; });
  for (const k of Object.keys(SHARED)) delete SHARED[k];
  FOCUS.pane = undefined; FOCUS.peek = null;
  CALLS.length = 0; timers.length = 0;
}
// What the bar asks for the project on show when it is down to one tab: an empty page to
// stand by behind that tab, made without being shown.
const standby = (space) => ["tab.new", { space, mod: "glyph", props: { role: "blank" }, focus: false }];
// With one tab on show, the bar asks for that page at its second look, the first that finds
// the same project on show again (`first`: what those two looks ran). The page stays on its
// way, so a test that is not about it sees none of it, until the test lets it come (`come`).
// `standing`: it has come and been put away before the test starts.
async function bar(standing = false) {
  const b = new Bar(cx);
  // A render, then the bar's look at what changed (in the app, a timer's; the bar runs
  // commands of its own only from there), then what that leaves on screen.
  const draw = () => { b.render(); b.look(cx); return b.render(); };
  let root = draw();
  await tick(); // knownAgents answers
  root = draw();
  const first = runs();
  CALLS.length = 0;
  const come = () => { for (const [name, args] of first) CALLS.push(["run", name, args]); obey(); };
  if (standing) { come(); root = draw(); obey(); root = draw(); }
  const api = {
    b, first, come, render: () => (root = draw()), root: () => root,
    key: async (name) => { globalThis.__deliver(name); await tick(); root = draw(); },
    x: (id) => { byId(root, `close-${id}`).handlers.on_click({}, cx); root = draw(); },
    red: (id) => Boolean(byId(root, `close-${id}`)?.props.bg),
  };
  return api;
}
// Project `id` as it is once its last tab was closed: holding only its empty page. Its id.
function paged(id) {
  const s = sp(id), page = `${id}~page`;
  panes().splice(0, panes().length, ...panes().filter((p) => !s.tabs.some((c) => c.id === p.tab)));
  s.tabs.splice(0, s.tabs.length, { id: page, index: 1, name: "1", named: false, active: true, status: null, panes: 1, zoomed: false });
  panes().push({ pane: `p-${page}`, terminal: null, mod: "glyph", tab: page, title: "Glyph", focused: true, zoomed: false });
  return page;
}
// The flock without those projects.
const drop = (...ids) => spaces().splice(0, spaces().length, ...spaces().filter((s) => !ids.includes(s.id)));
// A project as it was left on its tab number `n` (from 0).
const leftOn = (id, n) => sp(id).tabs.forEach((c, i) => { c.active = i === n; });
// What Herdr does with the commands the mod ran since the last call.
let made = 0;
function obey() {
  for (const [name, args] of runs().splice(0)) {
    const s = spaces().find((x) => x.tabs.some((c) => c.id === args?.id)) ?? sp(args?.space);
    if (name === "overlay.close") FOCUS.peek = null;
    else if (!s) continue; // what it names is gone
    else if (name === "tab.select") {
      for (const x of spaces()) x.active = x === s;
      s.tabs.forEach((c) => { c.active = c.id === args.id; if (c.active) c.settled = false; });
    } else if (name === "tab.settle") s.tabs.find((c) => c.id === args.id).settled = true;
    else if (name === "tab.close") {
      const at = s.tabs.findIndex((c) => c.id === args.id);
      const [gone] = s.tabs.splice(at, 1);
      panes().splice(0, panes().length, ...panes().filter((p) => p.tab !== gone.id));
      if (!s.tabs.length) {
        const i = spaces().indexOf(s);
        spaces().splice(i, 1);
        if (s.active && spaces().length) spaces()[i % spaces().length].active = true;
      } else if (gone.active) (s.tabs[at] ?? s.tabs[at - 1]).active = true;
    } else if (name === "tab.new") {
      made += 1;
      const id = `${s.machine ? s.machine + "/" : ""}new${made}`;
      const shown = args.focus !== false;
      if (shown) s.tabs.forEach((c) => { c.active = false; });
      s.tabs.push({ id, index: s.tabs.length + 1, name: String(s.tabs.length + 1), named: false, active: shown, status: null, panes: 1, zoomed: false, settled: false });
      const shellP = panes().find((p) => p.program?.shell).program;
      panes().push(args.mod ? { pane: `p-${id}`, terminal: null, mod: args.mod, tab: id, title: "Glyph", focused: shown, zoomed: false }
        : { pane: `p-${id}`, terminal: `t-${id}`, tab: id, title: "", cwd: args.folder ?? s.folder, branch: null, status: null, app: null, program: shellP, focused: shown, zoomed: false });
    }
  }
  CALLS.length = 0;
}
// A tab ends by itself (its shell exits): it goes the way a closed one does.
const exits = (id) => { CALLS.push(["run", "tab.close", { id }]); obey(); };

// 1. A plain shell closes at the first press, and the tab after it is shown: no other tab
// has been used yet (5a).
{
  world("sp2", 1); // tb3 claude, tb4 shell (shown), tb5 python
  const a = await bar();
  await a.key("close");
  eq(runs(), [["tab.select", { id: "tb5" }], ["tab.close", { id: "tb4", confirmed: true }]], "shell: one press, then the tab after it");
}
// 2. An agent takes two.
{
  world("sp2", 0);
  const a = await bar();
  await a.key("close");
  eq(runs(), [], "agent: the first press closes nothing");
  ok(a.red("tb3"), "agent: its x is red while it waits");
  await a.key("close");
  eq(runs(), [["tab.select", { id: "tb4" }], ["tab.close", { id: "tb3", confirmed: true }]], "agent: the second press closes, the tab after it is shown");
  ok(a.b.armed === null, "nothing stays armed");
}
// 3. The second press has to come in time.
{
  world("sp2", 0);
  const a = await bar();
  await a.key("close");
  fire(3000); a.render();
  ok(!a.red("tb3"), "the red goes after 3 s");
  await a.key("close");
  eq(runs(), [], "a late second press is a first one again");
  ok(a.red("tb3"), "and arms it again");
}
// 4. The tab's own x does the same. A program that isn't a shell counts like an agent.
{
  world("sp2", 2);
  const a = await bar();
  a.x("tb5");
  eq(runs(), [], "x on a running program: first click closes nothing");
  ok(a.red("tb5"), "x turns red");
  a.x("tb5");
  eq(runs(), [["tab.select", { id: "tb4" }], ["tab.close", { id: "tb5", confirmed: true }]], "x again closes; the last tab hands over to the one before it");
}
// 5. Showing another tab takes a first press back.
{
  world("sp2", 0);
  const a = await bar();
  await a.key("close");
  sp("sp2").tabs.forEach((c, i) => { c.active = i === 2; });
  a.render();
  sp("sp2").tabs.forEach((c, i) => { c.active = i === 0; });
  a.render();
  await a.key("close");
  eq(runs(), [], "armed, away, back: the next press is a first one");
}
// 5a. After the shown tab closes, the tab of its project used last before it is shown. A tab
// counts as used once it stayed on show for a second: one passed on the way does not. The
// same goes for a shown tab that ends by itself. The clock is the test's own.
{
  const real = Date.now;
  let clock = real();
  Date.now = () => clock;
  try {
    world("alpha/sp4", 0); // nine agents' tabs
    const [A, B, C, D, E, F] = sp("alpha/sp4").tabs.map((c) => c.id);
    const a = await bar();
    // Tab `id` comes on show and stays `ms`.
    const show = (id, ms) => { CALLS.push(["run", "tab.select", { id }]); obey(); a.render(); clock += ms; a.render(); };
    const shut = async (id) => { SHARED["glyph.shut"] = { id, at: clock }; await a.key("shut"); };
    clock += 1500; a.render(); // on A for a while
    show(B, 1500);             // a new tab, beside A
    show(C, 200);              // passed on the way to D
    show(D, 1500);
    show(A, 1500);
    CALLS.length = 0;
    await shut(A);
    eq(runs(), [["tab.select", { id: D }], ["tab.close", { id: A, confirmed: true }]], "closing A shows D, the tab used before it, not B beside it");
    obey();
    leftOn("alpha/sp4", sp("alpha/sp4").tabs.findIndex((c) => c.id === C)); // a click on C before the bar looks
    a.render();
    eq(runs(), [], "the bar's own close is not corrected after it, even with another tab picked since");
    show(D, 300);              // back on D for a moment
    await shut(D);
    eq(runs(), [["tab.select", { id: B }], ["tab.close", { id: D, confirmed: true }]], "closing D shows B, not C, which was only passed");
    obey(); a.render();
    show(B, 1500);
    show(E, 1500);
    show(B, 1500);
    CALLS.length = 0;
    exits(B); // Herdr shows C, the tab after it
    eq(model().active.tabs.find((c) => c.active)?.id, C, "(the fake shows the tab after it)");
    a.render();
    eq(runs(), [["tab.select", { id: E }]], "B ends by itself: E, the tab used before it, is shown");
    obey(); a.render();
    eq(runs(), [], "once");
    // A tab of another project, used in between, is not what a close shows. With no other
    // tab of the project used, the tab after it is.
    show(E, 1500);
    show("alpha/tb16", 1500); // alpha/sp5's first tab
    show(E, 1500);
    CALLS.length = 0;
    await shut(E);
    eq(runs(), [["tab.select", { id: F }], ["tab.close", { id: E, confirmed: true }]], "closing E: no other tab of its project was used, so the one after it");
  } finally {
    Date.now = real;
  }
}
// 5b. A tab you open counts as used at once, however soon you open the next one. Tabs opened
// faster than the bar looks are first seen together and count from left to right. The fake
// puts a new tab last, which is right after the shown one when the last tab is on show, as
// Herdr does. The clock is the test's own.
{
  const real = Date.now;
  let clock = real();
  Date.now = () => clock;
  try {
    let a;
    const shownId = () => sp("alpha/sp4").tabs.find((c) => c.active).id;
    const shut = async (id) => { SHARED["glyph.shut"] = { id, at: clock }; await a.key("shut"); };
    const closes = async (id, to, what) => { CALLS.length = 0; await shut(id); eq(runs(), [["tab.select", { id: to }], ["tab.close", { id, confirmed: true }]], what); obey(); a.render(); };
    world("alpha/sp4", 8);
    const I = shownId();
    a = await bar();
    clock += 1500; a.render(); // on I for a while
    // Three new tabs, a fifth of a second apart: the bar looks at each.
    const opened = [];
    for (let k = 0; k < 3; k++) { await a.key("new"); obey(); a.render(); opened.push(shownId()); clock += 200; a.render(); }
    await closes(opened[2], opened[1], "the third of three tabs opened quickly closes: the second shows, not the tab they were opened from");
    await closes(opened[1], opened[0], "then the first");
    await closes(opened[0], I, "then the tab they were opened from");
    // Three more, all before the bar looks again.
    const burst = [];
    for (let k = 0; k < 3; k++) { a.b.command("new", cx); obey(); burst.push(shownId()); }
    a.render();
    await closes(burst[2], burst[1], "three opened between two looks: the third closes, the second shows");
    await closes(burst[1], burst[0], "then the first");
    // A tab that comes on show by itself, made last in the project with focus false and then
    // picked, is not new by then: it counts only after a second.
    CALLS.push(["run", "tab.new", { space: "alpha/sp4", focus: false }]); obey(); a.render();
    const quiet = sp("alpha/sp4").tabs.at(-1).id;
    CALLS.push(["run", "tab.select", { id: quiet }]); obey(); a.render(); clock += 200; a.render();
    CALLS.push(["run", "tab.select", { id: burst[0] }]); obey(); a.render(); clock += 200; a.render();
    await closes(burst[0], I, "a tab made out of sight and passed on the way does not count");
  } finally {
    Date.now = real;
  }
}
// 6. A project's last tab, closed while the page asked to stand by is still on its way: the
// page is waited for, not asked for twice. Once it is there it is shown, the tab goes, and
// the project stays.
{
  world("bravo/sp6", 0); // fieldnotes: one Claude tab, bravo/tb19
  const a = await bar();
  eq(a.first, [standby("bravo/sp6")], "one tab on show: a page is asked to stand by, not to be shown");
  await a.key("close"); await a.key("close");
  eq(runs(), [], "last tab, its page on the way: no second page is asked for, nothing closes yet");
  eq(SHARED["glyph.blank"], { "bravo/sp6": { name: "fieldnotes", folder: "/home/me/fieldnotes" } }, "its name and folder are kept");
  a.come();
  const page = sp("bravo/sp6").tabs[1].id;
  a.render();
  eq(runs(), [["tab.select", { id: page }], ["tab.close", { id: "bravo/tb19", confirmed: true }]], "the page is there: it is shown, and now the tab closes");
  obey(); a.render(); a.render();
  eq(runs(), [], "and nothing more");
  const m = model();
  eq([m.active?.id, m.active?.empty, m.active?.tabs.length, m.active?.label, m.counts.total], ["bravo/sp6", true, 0, "fieldnotes", 17], "the project is still on show, empty, and its page is no tab");
  ok(spaces().some((s) => s.id === "bravo/sp6"), "the project was not closed");
  // Starting something there starts it where the last tab was, and the page stands by for it.
  await a.key("new");
  eq(runs(), [["tab.new", { space: "bravo/sp6", folder: "/home/me/fieldnotes" }]], "new tab on an empty page: in the folder the last tab was in");
  CALLS.length = 0;
  await a.key("new-codex");
  eq(runs(), [["tab.new", { space: "bravo/sp6", argv: ["codex", "--no-daemon"], folder: "/home/me/fieldnotes" }]], "new-codex there too");
  obey(); a.render();
  eq(runs(), [["tab.settle", { id: page }]], "a tab beside the page: the page stays, and is put away again");
  obey(); a.render();
  eq([runs(), model().active.empty, model().active.tabs.length, model().active.blanks.map((b) => [b.id, b.settled])], [[], false, 1, [[page, true]]], "one tab on show, and the page behind it");
}
// 6a. The usual way: the page has come before anything closes. It is put away, and is no tab.
// The close key on the one tab then shows it and closes the tab, with no wait.
{
  world("bravo/sp6", 0);
  const a = await bar();
  a.render(); a.render();
  eq(runs(), [], "the page is on its way: not asked for again");
  a.come();
  const page = sp("bravo/sp6").tabs[1].id;
  eq([sp("bravo/sp6").tabs.map((c) => c.active), spaces().find((s) => s.active).id], [[true, false], "bravo/sp6"], "(the fake makes it last and does not show it)");
  a.render();
  eq(runs(), [["tab.settle", { id: page }]], "the page is there: it is put away");
  a.render();
  eq(runs().length, 1, "asked once");
  obey(); a.render(); a.render();
  eq(runs(), [], "and nothing more");
  const m = model();
  eq([m.active.id, m.active.empty, m.active.tabs.map((c) => [c.id, c.active]), m.counts.total, m.active.blanks.map((b) => [b.settled, b.active])],
    ["bravo/sp6", false, [["bravo/tb19", true]], 18, [[true, false]]], "the tab is still the one on show, and the page is no tab");
  await a.key("close");
  eq(runs(), [], "an agent's tab: the first press closes nothing");
  await a.key("close");
  eq(runs(), [["tab.select", { id: page }], ["tab.close", { id: "bravo/tb19", confirmed: true }]], "the second: the page that stood by is shown, and the tab goes at once");
  ok(a.b.leaving === null, "nothing is waited for");
  obey(); a.render(); a.render();
  eq([runs(), model().active?.id, model().active?.empty, model().active?.label], [[], "bravo/sp6", true, "fieldnotes"], "the project is on show as its empty page");
}
// 6b. The one tab ends by itself (its shell exits). Herdr closes a project with its last tab:
// with the page standing by there is a tab left, so the project stays on show, as its empty
// page, by the name and the folder noted while the tab was there.
{
  world("bravo/sp6", 0);
  const a = await bar(true);
  exits("bravo/tb19");
  eq([spaces().find((s) => s.active)?.id, sp("bravo/sp6")?.tabs.map((c) => [c.active, c.settled])], ["bravo/sp6", [[true, true]]], "(the fake: the project has its page left, which it shows)");
  a.render(); a.render();
  eq(runs(), [], "a last tab ending by itself: nothing to correct");
  sp("bravo/sp6").name = "me"; // with no terminal left Herdr calls it after the folder it was made in
  const m = model();
  eq([m.active?.id, m.active?.empty, m.active?.tabs.length, m.active?.label, m.counts.total], ["bravo/sp6", true, 0, "fieldnotes", 17], "the project is still on show, as its empty page, by the name it had");
  await a.key("new");
  eq(runs(), [["tab.new", { space: "bravo/sp6", folder: "/home/me/fieldnotes" }]], "a tab started there starts in the folder the tab was in");
  // Before the page has come, the project still goes with its tab.
  world("bravo/sp6", 0);
  await bar();
  exits("bravo/tb19");
  ok(!sp("bravo/sp6"), "(the fake: with no page there yet, the project closes with its tab)");
}
// 6c. A page stands by only for the one tab of the project on show.
{
  world("sp2", 0);
  eq((await bar()).first, [], "three tabs on show: no page, and none for a one-tab project that is not on show");
  world("sp1", 0);
  eq((await bar()).first, [], "two tabs on show: no page");
  // Another project on show: the page goes, and its project keeps its tab.
  world("bravo/sp6", 0);
  const a = await bar(true);
  const page = sp("bravo/sp6").tabs[1].id;
  for (const s of spaces()) s.active = s.id === "sp1";
  a.render();
  eq(runs(), [["tab.close", { id: page, confirmed: true }]], "another project on show: the page goes");
  a.render();
  eq(runs().length, 1, "asked once");
  obey(); a.render();
  eq([runs(), sp("bravo/sp6").tabs.map((c) => c.id)], [[], ["bravo/tb19"]], "and its project keeps its tab");
  for (const s of spaces()) s.active = s.id === "bravo/sp6";
  a.b.render(); a.b.look(cx);
  eq([runs(), a.b.dirty], [[], true], "on show again: no page at the first look, which asks for another look at once");
  a.b.look(cx);
  eq([runs(), a.b.dirty], [[standby("bravo/sp6")], false], "still on show at the next look: a page is asked for again");
  // A second tab: the page goes. Down to one again: a page again.
  world("bravo/sp6", 0);
  const b = await bar(true);
  const first = sp("bravo/sp6").tabs[1].id;
  await b.key("new");
  eq(runs(), [["tab.new", { space: "bravo/sp6" }]], "(a new tab beside a tab starts where Herdr starts it)");
  obey(); b.render();
  eq(runs(), [["tab.close", { id: first, confirmed: true }]], "a second tab: the page goes");
  obey(); b.render();
  eq([runs(), sp("bravo/sp6").tabs.length], [[], 2], "two tabs, no page");
  const second = sp("bravo/sp6").tabs[1].id; // a plain shell, on show
  await b.key("close");
  eq(runs(), [["tab.select", { id: "bravo/tb19" }], ["tab.close", { id: second, confirmed: true }], standby("bravo/sp6")], "the second tab is closed: a page is asked for at once, for the one that stays");
}
// 6d. What the page will show is noted while the tab can still tell, and only when it changes.
{
  world("bravo/sp6", 0);
  const a = await bar(true);
  const was = SHARED["glyph.blank"];
  eq(was, { "bravo/sp6": { name: "fieldnotes", folder: "/home/me/fieldnotes" } }, "one tab on show: the project's name and the tab's folder are noted");
  a.render(); a.render();
  ok(SHARED["glyph.blank"] === was, "not written again while nothing changed");
  panes().find((p) => p.tab === "bravo/tb19").cwd = "/home/me/fieldnotes/docs";
  a.render();
  eq(SHARED["glyph.blank"]["bravo/sp6"], { name: "fieldnotes", folder: "/home/me/fieldnotes/docs" }, "the tab is in another folder: noted");
  sp("bravo/sp6").name = "docs";
  a.render();
  eq(SHARED["glyph.blank"]["bravo/sp6"], { name: "docs", folder: "/home/me/fieldnotes/docs" }, "the project goes by another name: noted");
  eq(runs(), [], "and no command is run for it");
}
// 6e. The page on show beside the tab hands back to the tab. A page that never comes is asked
// for again after 4 s.
{
  world("bravo/sp6", 0);
  const a = await bar(true);
  const [tab, page] = sp("bravo/sp6").tabs;
  tab.active = false; page.active = true; page.settled = false; // something showed the page
  a.render();
  eq(runs(), [["tab.select", { id: "bravo/tb19" }], ["tab.settle", { id: page.id }]], "the page on show beside the tab: the tab is shown again, and the page put away again");
  obey(); a.render();
  eq([runs(), sp("bravo/sp6").tabs.map((c) => [c.active, c.settled])], [[], [[true, false], [false, true]]], "and nothing more");
  world("bravo/sp6", 0);
  const b = await bar();
  b.b.paged.at -= 4000;
  b.render();
  eq(runs(), [standby("bravo/sp6")], "no page after 4 s: it is asked for again");
  b.render();
  eq(runs().length, 1, "once");
}
// 6h. The page that stood by is gone and the bar did not close it: something else did (Herdr
// on another computer, with this layout on show, closes the pages of projects it is not
// showing). The bar does not ask for another at once, which would never end, but a minute later.
{
  world("bravo/sp6", 0);
  const a = await bar(true);
  const page = sp("bravo/sp6").tabs.pop();
  panes().splice(0, panes().length, ...panes().filter((p) => p.tab !== page.id));
  a.render(); a.render();
  eq(runs(), [], "the page was closed by something else: no other is asked for at once");
  a.b.shy.set("bravo/sp6", Date.now() - 60000);
  a.render();
  eq(runs(), [standby("bravo/sp6")], "a minute later: one is asked for again");
  // One the bar closed itself is not held against the project (6c: asked for again at once).
}
// 6f. A close key before the bar has looked at all: the page is asked for and shown, and the
// tab waits for it, as before pages stood by.
{
  world("bravo/sp6", 0);
  const b = new Bar(cx);
  await tick();
  globalThis.__deliver("close"); await tick();
  globalThis.__deliver("close"); await tick();
  eq(runs(), [["tab.new", { space: "bravo/sp6", mod: "glyph", props: { role: "blank" } }]], "last tab, no page asked for yet: one is asked for, to be shown");
  obey(); b.render(); b.look(cx);
  eq(runs(), [["tab.close", { id: "bravo/tb19", confirmed: true }]], "the page is there, on show: now the tab closes");
  obey(); b.render(); b.look(cx);
  eq([runs(), model().active?.id, model().active?.empty], [[], "bravo/sp6", true], "and the project stays");
}
// 6g. A look that goes wrong does not end the looking: a notice says why, once.
{
  world("sp2", 0);
  const a = await bar();
  const said = () => CALLS.filter((c) => c[0] === "notify").map((c) => c[1].body);
  Object.defineProperty(spaces()[0], "tabs", { get() { throw new Error("no list"); }, configurable: true });
  a.b.dirty = true; a.b.look(cx);
  a.b.dirty = true; a.b.look(cx);
  eq(said(), ["no list"], "two looks that go wrong the same way: one notice, and nothing thrown");
  world("sp2", 0);
  a.b.dirty = true; a.b.look(cx);
  eq([said(), a.b.tripped], [[], ""], "a look that goes well: nothing said");
}
// 7. Looking at another project closes one left with only its page.
{
  world("bravo/sp6", 0);
  const a = await bar(true);
  await a.key("close"); await a.key("close");
  obey(); a.render(); obey(); a.render();
  for (const s of spaces()) s.active = s.id === "sp1";
  a.render();
  eq(runs().map((r) => [r[0], r[1].confirmed]), [["tab.close", true]], "left behind: its page is closed");
  a.render();
  eq(runs().length, 1, "asked once");
  obey(); a.render();
  ok(!spaces().some((s) => s.id === "bravo/sp6"), "and the project went with it");
}
// 8. The close key on an empty page closes the project, and the first tab of the project
// after it on its machine is shown before it goes. The close-pane key there does the same.
for (const key of ["close", "close-pane"]) {
  world("bravo/sp6", 0);
  const a = await bar(true);
  await a.key("close"); await a.key("close");
  obey(); a.render(); obey(); a.render();
  const page = sp("bravo/sp6").tabs[0].id;
  await a.key(key);
  eq(runs(), [["tab.select", { id: "bravo/tb20" }], ["tab.close", { id: page, confirmed: true }]], `${key} on the page: the first tab of the project after it on its machine, then the page goes`);
  obey(); a.render();
  ok(!spaces().some((s) => s.id === "bravo/sp6"), `${key} on the page closes the project`);
  eq([runs(), spaces().find((s) => s.active)?.id], [[], "bravo/sp7"], "and nothing more moves");
  a.render();
  eq(runs(), [standby("bravo/sp7")], "at the next look the project now on show, which has one tab, gets its page");
}
// 8a. Which tab that is, by where the project stood: the row after it in the rail, else the
// row before it, on its own machine while that has another project.
//   This Mac: sp1 (tb1, tb2), sp2 (tb3 to tb5), sp3 (tb6). alpha: sp4 (tb7 to tb15), sp5 (tb16
//   to tb18). bravo: sp6 (tb19), sp7 (tb20). foxtrot: sp8 (tb21).
const onPage = async (id, set = () => {}) => {
  world(id); set();
  const page = paged(id);
  const a = await bar();
  CALLS.length = 0;
  await a.key("close");
  return { a, page };
};
{
  let { a, page } = await onPage("sp1", () => leftOn("sp2", 1));
  eq(runs(), [["tab.select", { id: "tb3" }], ["tab.close", { id: page, confirmed: true }]], "page of a machine's first project: the first tab of the one after it, not the tab that was left on");
  ({ a, page } = await onPage("sp2"));
  eq(runs(), [["tab.select", { id: "tb6" }], ["tab.close", { id: page, confirmed: true }]], "of one in the middle: the one after it, not the one before");
  ({ a, page } = await onPage("sp3", () => leftOn("sp2", 0)));
  eq(runs(), [["tab.select", { id: "tb5" }], ["tab.close", { id: page, confirmed: true }]], "of a machine's last project: the last tab of the one before it there, not the next machine's");
  obey(); a.render(); a.render();
  eq([runs(), spaces().find((s) => s.active)?.id, Boolean(sp("sp3"))], [[], "sp2", false], "the project goes, and the window moves that once");
  ({ a, page } = await onPage("alpha/sp5"));
  eq(runs(), [["tab.select", { id: "alpha/tb15" }], ["tab.close", { id: page, confirmed: true }]], "of another machine's last project: the same, on that machine");
  obey(); a.render(); a.render();
  eq([runs(), spaces().find((s) => s.active)?.id], [[], "alpha/sp4"], "and it stays there");
  // Only a machine's only project hands over to another machine.
  ({ a, page } = await onPage("sp3", () => drop("sp1", "sp2")));
  eq(runs(), [["tab.select", { id: "alpha/tb7" }], ["tab.close", { id: page, confirmed: true }]], "of a machine's only project: the first tab of the next project in the list");
  ({ a, page } = await onPage("foxtrot/sp8", () => drop("bravo/sp6", "bravo/sp7")));
  eq(runs(), [["tab.select", { id: "alpha/tb18" }], ["tab.close", { id: page, confirmed: true }]], "of the list's last project, alone on its machine: the last tab of the one before it");
  ({ a, page } = await onPage("sp3", () => drop(...spaces().map((s) => s.id).filter((id) => id !== "sp3"))));
  eq(runs(), [["tab.close", { id: page, confirmed: true }]], "of the only project there is: the page goes, and nothing is shown first");
  // A project left with only its page closes by itself, so it is passed over.
  ({ a, page } = await onPage("bravo/sp6", () => paged("bravo/sp7")));
  eq(runs(), [["tab.select", { id: "foxtrot/tb21" }], ["tab.close", { id: page, confirmed: true }]], "the one after it holds only its page: the next project with a tab");
}
// 9. If the page never comes, the tab closes all the same.
{
  world("bravo/sp6", 0);
  const a = await bar();
  await a.key("close"); await a.key("close");
  CALLS.length = 0;
  fire(4000);
  eq(runs(), [["tab.close", { id: "bravo/tb19", confirmed: true }]], "no page in time: the tab closes anyway");
}
// 10. A tab that ends by itself: Herdr shows the one after it, and with no other tab used
// yet (5a) the bar leaves it there.
{
  world("sp2", 1);
  const a = await bar();
  CALLS.push(["run", "tab.close", { id: "tb4" }]); obey(); // its shell exited: tb5 is shown
  eq(sp("sp2").tabs.map((c) => [c.id, c.active]), [["tb3", false], ["tb5", true]], "(the fake shows the tab after it)");
  a.render();
  sp("sp2").tabs.reverse();
  a.render();
  eq(runs(), [], "a tab ending by itself, a reorder: nothing to correct");
}
// 10a. The project on show closes (here, from Herdr's side): Herdr shows the next one in its
// list on the tab it was left on, and the bar shows the tab its own rule gives (8a).
const herdrCloses = (id, next) => {
  spaces().splice(spaces().findIndex((s) => s.id === id), 1);
  sp(next).active = true;
};
// The window on project `id`, which then closes, Herdr showing `next`: what the bar runs.
const closes = async (id, next, set = () => {}) => {
  world(id); set();
  const a = await bar();
  herdrCloses(id, next);
  a.render();
  return a;
};
{
  let a = await closes("alpha/sp4", "alpha/sp5", () => leftOn("alpha/sp5", 2));
  eq(runs(), [["tab.select", { id: "alpha/tb16" }]], "the shown project closes: the first tab of the one after it on its machine");
  obey(); a.render();
  eq(runs(), [], "once");
  // After a machine's last project Herdr shows the next machine's first one.
  a = await closes("alpha/sp5", "bravo/sp6");
  eq(runs(), [["tab.select", { id: "alpha/tb15" }]], "a machine's last project closes: the last tab of the one before it there, not the next machine's");
  obey(); a.render(); a.render();
  eq([runs(), spaces().find((s) => s.active)?.id], [[], "alpha/sp4"], "once, and the window is back on that machine");
  a = await closes("sp3", "alpha/sp4");
  eq(runs(), [["tab.select", { id: "tb5" }]], "this computer's last project closes: the last tab of the one before it");
  // Only a machine's only project hands over to another machine.
  a = await closes("sp3", "alpha/sp4", () => drop("sp1", "sp2")); // alpha/sp4 was left on its third tab
  eq(runs(), [["tab.select", { id: "alpha/tb7" }]], "a machine's only project closes: the first tab of the next project in the list");
  a = await closes("foxtrot/sp8", "sp1");
  eq(runs(), [["tab.select", { id: "bravo/tb20" }]], "the list's last project closes, alone on its machine: the one before it, whichever Herdr shows");
  a = await closes("foxtrot/sp8", "bravo/sp7");
  eq(runs(), [], "and nothing when Herdr shows that tab already");
  a = await closes("bravo/sp6", "bravo/sp7", () => paged("bravo/sp7"));
  eq(runs().filter((r) => r[0] === "tab.select"), [["tab.select", { id: "foxtrot/tb21" }]], "a project holding only its page is passed over");
  // Going to another project yourself is not a close.
  world("sp3", 0);
  const b = await bar();
  for (const s of spaces()) s.active = s.id === "alpha/sp4";
  b.render();
  eq(runs(), [], "showing another project: it stays, on the tab it was left on");
  // A project whose machine goes out of reach is missing, not closed.
  world("sp3", 0);
  spaces().push({ id: "echo/sp10", index: 9, name: "ledger", named: false, folder: "/home/me/ledger", machine: "echo", branch: null, active: false, status: null,
    tabs: [{ id: "echo/tb30", index: 1, name: "1", named: false, active: true, status: null, panes: 1, zoomed: false }] });
  for (const s of spaces()) s.active = s.id === "echo/sp10";
  const c = await bar();
  herdrCloses("echo/sp10", "alpha/sp4");
  c.render();
  eq(runs(), [], "its machine is out of reach: nothing is corrected");
}
// 10b. Drawing runs no command: only the look after it does.
{
  world("sp3", 0);
  const a = await bar();
  herdrCloses("sp3", "alpha/sp4");
  a.b.render(); a.b.render();
  eq(runs(), [], "a render alone runs nothing");
  a.b.look(cx);
  eq(runs(), [["tab.select", { id: "tb5" }]], "the look does");
  CALLS.length = 0;
  a.b.look(cx);
  eq(runs(), [], "and a look with nothing drawn since does nothing");
  // Unless nothing is drawn for a while: then it looks anyway, about once a second.
  obey();
  herdrCloses("alpha/sp4", "alpha/sp5");
  sp("alpha/sp5").tabs.forEach((c, i) => { c.active = i === 2; });
  for (let i = 0; i < 6; i++) a.b.look(cx);
  eq(runs(), [], "seven looks at rest: still nothing");
  a.b.look(cx);
  eq(runs(), [["tab.select", { id: "alpha/tb16" }]], "the eighth looks without a render");
}
// 10c. Both rules at once. The project Herdr shows for a moment after another closed gets no
// page to stand by: the bar moves the window on from it. The project it moves to has one tab
// here, and gets its page once it has stayed on show for a look.
{
  world("bravo/sp7", 0); // bravo's last project. After it in Herdr's list: foxtrot/sp8, one tab
  const a = await bar(true);
  herdrCloses("bravo/sp7", "foxtrot/sp8");
  a.render();
  eq(runs(), [["tab.select", { id: "bravo/tb19" }]], "a machine's last project closes: the one before it there is shown, and no page is asked for the project Herdr showed meanwhile");
  obey(); a.render();
  eq([runs(), spaces().find((s) => s.active)?.id], [[], "bravo/sp6"], "the window is on that project: nothing at the first look");
  a.render();
  eq(runs(), [standby("bravo/sp6")], "at the next it gets its page");
}
// 11. Close pane: a tab's only pane is the tab; in a split, an agent's pane takes two.
{
  world("sp2", 0);
  const a = await bar();
  await a.key("close-pane");
  eq(runs(), [], "close-pane on a lone agent pane: first press arms");
  await a.key("close-pane");
  eq(runs(), [["tab.select", { id: "tb4" }], ["tab.close", { id: "tb3", confirmed: true }]], "second closes the tab, as close does");
  world("sp2", 0);
  const shellP = panes().find((p) => p.program?.shell).program;
  panes().push({ pane: "p-split", terminal: "t-split", tab: "tb3", title: "", cwd: "/Users/me", branch: null, status: null, app: null, program: shellP, focused: false, zoomed: false });
  const b = await bar();
  FOCUS.pane = "p-split";
  await b.key("close-pane");
  eq(runs(), [["pane.close", { pane: "p-split" }]], "split: a shell pane closes at once");
  CALLS.length = 0;
  FOCUS.pane = "p3";
  await b.key("close-pane");
  eq(runs(), [], "split: the agent's pane arms");
  ok(b.red("tb3"), "and its tab shows it");
  await b.key("close-pane");
  eq(runs(), [["pane.close", { pane: "p3" }]], "split: second press closes the pane only");
}
// 11a. Herdr's peek on show over a tab: a sub-agent's terminal has the keyboard, and no pane
// does. Either close key closes the peek and nothing else.
for (const key of ["close", "close-pane"]) {
  world("sp3", 0); // tb6: a Claude tab whose agent started t6-1, t6-1-1 and t6-2
  const a = await bar();
  FOCUS.peek = "t6-2";
  await a.key(key);
  eq(runs().map((r) => r[0]), ["overlay.close"], `${key} with a peek on show: the peek closes, and nothing else is asked`);
  ok(!a.red("tb6") && a.b.armed === null, `${key} with a peek on show: the tab under it is not armed`);
  obey(); a.render(); // the peek is gone, and the tab's pane has the keyboard again
  await a.key(key);
  eq(runs(), [], `${key} once the peek is gone: a first press on the tab, which closes nothing`);
  ok(a.red("tb6"), `${key} once the peek is gone: the tab is armed`);
}
// A first press on the tab, then a peek: the press that closes the peek takes it back.
{
  world("sp3", 0);
  const a = await bar();
  await a.key("close");
  ok(a.red("tb6"), "(a first press arms the tab)");
  FOCUS.peek = "t6-1";
  await a.key("close");
  eq(runs().map((r) => r[0]), ["overlay.close"], "armed, then a peek: the next press closes the peek, not the tab");
  ok(!a.red("tb6"), "and the tab is no longer armed");
  obey(); a.render();
  await a.key("close");
  eq(runs(), [], "so the press after that is a first one again");
}
// 12. What the other parts ask (closeTab in data.js): the tab named in shared, already sure.
{
  world("sp2", 0);
  const a = await bar();
  SHARED["glyph.shut"] = { id: "tb5", at: Date.now() };
  await a.key("shut");
  eq(runs(), [["tab.close", { id: "tb5", confirmed: true }]], "shut an unshown tab: it just goes");
  CALLS.length = 0;
  SHARED["glyph.shut"] = { id: "alpha/tb9", at: Date.now() };
  await a.key("shut");
  eq(runs(), [["tab.close", { id: "alpha/tb9", confirmed: true }]], "another project's shown tab: no tab is shown for it (that would show its project)");
  CALLS.length = 0;
  SHARED["glyph.shut"] = { id: "tb3", at: Date.now() };
  await a.key("shut");
  // tb5 and tb3 are both on their way out by now: tb4, the one that stays, gets its page.
  eq(runs(), [["tab.select", { id: "tb4" }], ["tab.close", { id: "tb3", confirmed: true }], standby("sp2")], "shut the shown tab: no second press, same order");
  CALLS.length = 0;
  SHARED["glyph.shut"] = { id: "tb4", at: Date.now() - 60000 };
  await a.key("shut");
  eq(runs(), [], "an old request is not obeyed");
}
// 13. The keys that start things, and the pill.
{
  world("sp2", 0);
  const a = await bar();
  await a.key("new");
  await a.key("new-claude");
  await a.key("new-codex");
  eq(runs(), [["tab.new", { space: "sp2" }], ["tab.new", { space: "sp2", argv: ["claude"] }], ["tab.new", { space: "sp2", argv: ["codex", "--no-daemon"] }]], "new, new-claude, new-codex");
  CALLS.length = 0;
  await a.key("new-nosuch"); await tick();
  eq([runs(), CALLS.filter((c) => c[0] === "notify").length], [[], 1], "an agent Herdr doesn't know: a notice, no tab");
  CALLS.length = 0;
  byId(a.root(), "start-shell").handlers.on_click({}, cx);
  byId(a.root(), "start-codex").handlers.on_click({}, cx);
  eq(runs(), [["tab.new", { space: "sp2" }], ["tab.new", { space: "sp2", argv: ["codex", "--no-daemon"] }]], "the pill starts the same things");
  eq([byId(a.root(), "start-shell").props.tooltip[0], byId(a.root(), "start-claude").props.tooltip[0], byId(a.root(), `close-tb3`).props.tooltip[0]],
    ["New terminal tab  ⌘T", "New Claude Code tab  ⇧⌘C", "Close tab  ⌘W"], "hover labels name the keys");
  // The plain terminal's starter wears what a shell tab wears.
  let pic = null;
  for (const ch of byId(a.root(), "start-shell").children) if (ch?.__node?.kind === "svg") pic = ch.__node;
  eq([pic?.arg, pic?.props.text_color?.[0]], ["icons/shell.svg", "#4ec95f"], "terminal starter: the shell tab's logo and color");
}

// 14. The Dock icon wears the number of tabs that need you, wherever they are.
{
  world("sp2", 0);
  BADGES.length = 0;
  const need = () => model().counts.blocked;
  const a = await bar();
  eq([need(), BADGES], [2, ["2"]], "the bar's first look puts the number on the icon, and its second says nothing more");
  sp("sp2").tabs[0].status = "idle";
  a.render();
  eq([need(), BADGES], [1, ["2", "1"]], "the number changes: the icon is told");
  a.render(); a.render();
  eq(BADGES.length, 2, "and not again while it stays");
  // A tab that finished is the tick's, not the badge's.
  sp("sp2").tabs[0].status = "done";
  a.render();
  eq([model().counts.done > 0, BADGES.length], [true, 2], "a tab that finished is not counted");
  // The app loaded the mod again: the bar that went may have taken the badge off after this
  // one put it on. A moment after it started, this one says its number once more.
  a.b.born -= 2000;
  a.render(); a.render();
  eq(BADGES, ["2", "1", "1"], "a moment after the start the icon is told once more, and only once");
  // None left that needs you: the badge comes off.
  const quiet = spaces().filter((s) => s.id === "sp1");
  spaces().splice(0, spaces().length, ...quiet);
  quiet[0].active = true;
  a.render();
  eq([need(), BADGES.at(-1), BADGES.length], [0, null, 4], "no tab needs you: no badge");
  // The bar goes (another layout, the mod loaded again): the badge goes with it.
  world("sp2", 0);
  BADGES.length = 0;
  const b = await bar();
  b.b.gone();
  eq(BADGES, ["2", null], "the bar going takes the badge off");
  // With nothing that needs you from the start, the icon is still told once: a badge left
  // by a bar before this one would stay.
  world("sp2", 0);
  spaces().splice(0, spaces().length, ...spaces().filter((s) => s.id === "sp1"));
  spaces()[0].active = true;
  BADGES.length = 0;
  await bar();
  eq(BADGES, [null], "a bar that starts with no tab needing you clears the icon once");
  // Under `herdr-app check` the mod is only loaded to be looked at: the icon is left alone.
  world("sp2", 0);
  BADGES.length = 0;
  globalThis.__checking = true;
  const c = await bar();
  c.b.gone();
  delete globalThis.__checking;
  eq(BADGES, [], "under herdr-app check nothing is put on the icon or taken off");
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
