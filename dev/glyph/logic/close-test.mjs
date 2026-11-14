// Closing, as the bar does it: two presses for what isn't a plain shell, the tab after the
// closed one shown next, a project's empty page in place of its last tab, the first tab of
// the next project when one closes, and the keys that start things.
// Run: ACTIVE=sp2 sh logic/run.sh close-test.mjs
// The fake app does nothing by itself: after each command the test changes the flock the
// way Herdr was seen to (a new tab is shown; closing the shown tab shows the one after it,
// the one before it for the last; closing an unshown tab moves nothing).
import { Bar } from "./bar.mjs";
import { model } from "./data.mjs";
import { byId } from "./kit-stub.mjs";
import { spaces, panes, CALLS, SHARED, FOCUS } from "./herdr-fake.mjs";

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
  FOCUS.pane = undefined;
  CALLS.length = 0; timers.length = 0;
}
async function bar() {
  const b = new Bar(cx);
  // A render, then the bar's look at what changed (in the app, a timer's; the bar runs
  // commands of its own only from there), then what that leaves on screen.
  const draw = () => { b.render(); b.look(cx); return b.render(); };
  let root = draw();
  await tick(); // knownAgents answers
  const api = {
    b, render: () => (root = draw()), root: () => root,
    key: async (name) => { globalThis.__deliver(name); await tick(); root = draw(); },
    x: (id) => { byId(root, `close-${id}`).handlers.on_click({}, cx); root = draw(); },
    red: (id) => Boolean(byId(root, `close-${id}`)?.props.bg),
  };
  return api;
}
// What Herdr does with the commands the mod ran since the last call.
let made = 0;
function obey() {
  for (const [name, args] of runs().splice(0)) {
    const s = spaces().find((x) => x.tabs.some((c) => c.id === args?.id)) ?? sp(args?.space);
    if (name === "tab.select") {
      for (const x of spaces()) x.active = x === s;
      s.tabs.forEach((c) => { c.active = c.id === args.id; });
    } else if (name === "tab.close") {
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
      s.tabs.forEach((c) => { c.active = false; });
      s.tabs.push({ id, index: s.tabs.length + 1, name: String(s.tabs.length + 1), named: false, active: true, status: null, panes: 1, zoomed: false });
      const shellP = panes().find((p) => p.program?.shell).program;
      panes().push(args.mod ? { pane: `p-${id}`, terminal: null, mod: args.mod, tab: id, title: "Glyph", focused: true, zoomed: false }
        : { pane: `p-${id}`, terminal: `t-${id}`, tab: id, title: "", cwd: args.folder ?? s.folder, branch: null, status: null, app: null, program: shellP, focused: true, zoomed: false });
    }
  }
  CALLS.length = 0;
}

// 1. A plain shell closes at the first press, and the tab after it is shown.
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
// 6. A project's last tab: the empty page first, then the tab goes, and the project stays.
{
  world("bravo/sp6", 0); // fieldnotes: one Claude tab, bravo/tb19
  const a = await bar();
  await a.key("close"); await a.key("close");
  eq(runs(), [["tab.new", { space: "bravo/sp6", mod: "glyph", props: { role: "blank" } }]], "last tab: the page is asked for, nothing closes yet");
  eq(SHARED["glyph.blank"], { "bravo/sp6": { name: "fieldnotes", folder: "/home/me/fieldnotes" } }, "its name and folder are kept");
  obey(); a.render();
  eq(runs(), [["tab.close", { id: "bravo/tb19", confirmed: true }]], "the page is there: now the tab closes");
  obey(); a.render(); a.render();
  eq(runs(), [], "and nothing more");
  const m = model();
  eq([m.active?.id, m.active?.empty, m.active?.tabs.length, m.active?.label, m.counts.total], ["bravo/sp6", true, 0, "fieldnotes", 17], "the project is still on show, empty, and its page is no tab");
  ok(spaces().some((s) => s.id === "bravo/sp6"), "the project was not closed");
  // Starting something there starts it where the last tab was, and the page makes way.
  await a.key("new");
  eq(runs(), [["tab.new", { space: "bravo/sp6", folder: "/home/me/fieldnotes" }]], "new tab on an empty page: in the folder the last tab was in");
  CALLS.length = 0;
  await a.key("new-codex");
  eq(runs(), [["tab.new", { space: "bravo/sp6", argv: ["codex", "--no-daemon"], folder: "/home/me/fieldnotes" }]], "new-codex there too");
  obey(); a.render();
  eq(runs().map((r) => r[0]), ["tab.close"], "a tab beside the page: the page goes");
  ok(runs()[0][1].id.includes("new") && runs()[0][1].confirmed === true, "it is the page that goes");
  obey(); a.render();
  eq([runs(), model().active.empty, model().active.tabs.length], [[], false, 1], "one tab left, no page");
}
// 7. Looking at another project closes one left with only its page.
{
  world("bravo/sp6", 0);
  const a = await bar();
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
// 8. The close key on an empty page closes the project, and the next project's first tab
// is shown before it goes. The close-pane key there does the same.
for (const key of ["close", "close-pane"]) {
  world("bravo/sp6", 0);
  const a = await bar();
  await a.key("close"); await a.key("close");
  obey(); a.render(); obey(); a.render();
  const page = sp("bravo/sp6").tabs[0].id;
  await a.key(key);
  eq(runs(), [["tab.select", { id: "bravo/tb20" }], ["tab.close", { id: page, confirmed: true }]], `${key} on the page: the next project's first tab, then the page goes`);
  obey(); a.render();
  ok(!spaces().some((s) => s.id === "bravo/sp6"), `${key} on the page closes the project`);
  eq([runs(), spaces().find((s) => s.active)?.id], [[], "bravo/sp7"], "and nothing more moves");
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
// 10. A tab that ends by itself: Herdr shows the one after it, as the bar would.
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
// 10a. The project on show closes (here, from Herdr's side): Herdr shows the next one on the
// tab it was left on, and the bar shows its first tab.
const herdrCloses = (id, next) => {
  spaces().splice(spaces().findIndex((s) => s.id === id), 1);
  sp(next).active = true;
};
{
  world("sp3", 0); // one tab; the next project, alpha/sp4, was left on its third tab
  const a = await bar();
  herdrCloses("sp3", "alpha/sp4");
  a.render();
  eq(runs(), [["tab.select", { id: "alpha/tb7" }]], "the shown project closes: the next project's first tab");
  obey(); a.render();
  eq(runs(), [], "once");
  // Going to another project yourself is not a close.
  world("sp3", 0);
  const b = await bar();
  for (const s of spaces()) s.active = s.id === "alpha/sp4";
  b.render();
  eq(runs(), [], "showing another project: its tab stays as it was left");
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
  eq(runs(), [["tab.select", { id: "alpha/tb7" }]], "the look does");
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
  eq(runs(), [["tab.select", { id: "tb4" }], ["tab.close", { id: "tb3", confirmed: true }]], "shut the shown tab: no second press, same order");
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
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
