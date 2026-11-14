import { Bar } from "./bar.mjs";
import { byId, walk } from "./kit-stub.mjs";
import { spaces, CALLS } from "./herdr-fake.mjs";

let failed = 0, passed = 0;
const ok = (cond, what) => { if (cond) passed++; else { failed++; console.log("FAIL:", what); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

let notified = 0;
const timers = [];
const cx = {
  notify() { notified++; }, stop_propagation() {}, spawn(fn) { Promise.resolve().then(() => fn(cx)); },
  timer: { every() {}, after(ms, fn) { timers.push({ ms, fn }); } },
};
const chipOf = (root, id) => { let found = null; walk(root, (n) => { if (n.id === `chip-${id}` || n.id?.startsWith(`chip-${id}~`)) found = n; }); return found; };
const fire = (ms) => { for (const t of timers.splice(0)) if (ms === undefined || t.ms === ms) t.fn(cx); else timers.push(t); };

const W = [120, 100, 80, 150, 90, 200, 210, 60, 32];
const BOUNDS = { x: 400, y: 0, width: 1200, height: 42 };
const tabsNow = () => spaces().find((s) => s.active).tabs;
const ORIGINAL = tabsNow().map((c) => c.id);
function fresh(withSizes = true) {
  const sp = spaces().find((s) => s.active);
  sp.tabs.sort((a, b) => ORIGINAL.indexOf(a.id) - ORIGINAL.indexOf(b.id));
  CALLS.length = 0; timers.length = 0;
  const bar = new Bar(cx);
  let root = bar.render();
  if (withSizes) {
    tabsNow().forEach((c, i) => byId(root, `chip-${c.id}`).handlers.on_size_change({ width: W[i], height: 32 }, cx));
    byId(root, "chips").handlers.on_size_change({ width: 1200, height: 42 }, cx);
  }
  const api = {
    bar,
    render: () => (root = bar.render()),
    chip: (i) => chipOf(root, tabsNow()[i].id),
    press: (i, x, count = 1) => { chipOf(root, tabsNow()[i].id).handlers["on_mouse_down:left"]({ position: { x: 400 + x, y: 20 }, click_count: count }, cx); api.render(); },
    move: (x) => { byId(root, "chips").handlers.on_mouse_move({ position: { x: 400 + x, y: 20 }, local_position: { x, y: 20 }, bounds: BOUNDS }, cx); api.render(); },
    moveOver: (i, x) => { chipOf(root, tabsNow()[i].id).handlers.on_mouse_move({ position: { x: 400 + x, y: 20 }, bounds: { x: 0, y: 0, width: 10, height: 10 } }, cx); api.render(); },
    up: () => { byId(root, "strip").handlers["on_mouse_up:left"]({ position: { x: 0, y: 0 } }, cx); api.render(); },
    hover: (h) => { byId(root, "strip").handlers.on_hover(h, cx); api.render(); },
    out: () => { byId(root, "chips").handlers.on_mouse_down_out({}, cx); api.render(); },
    lefts: () => tabsNow().map((c) => chipOf(root, c.id).props.left?.[0] ?? null),
    ids: () => tabsNow().map((c) => chipOf(root, c.id).id),
    held: () => { let found = null; walk(root, (n) => { if (n.id?.startsWith("held~")) found = n; }); return found && { left: found.props.left[0], width: found.props.w[0], top: found.props.top[0] }; },
    unseen: () => tabsNow().map((c) => (chipOf(root, c.id).props.opacity?.[0] === 0 ? 1 : 0)),
    root: () => root,
  };
  return api;
}
const runs = () => CALLS.filter((c) => c[0] === "run").map((c) => [c[1], c[2]]);
const reorder = (from, to) => { const t = tabsNow(); t.splice(to, 0, ...t.splice(from, 1)); };

// 1. A click shows the tab.
{
  const a = fresh();
  a.press(3, 330); a.up();
  eq(runs(), [["tab.select", { id: ORIGINAL[3] }]], "click selects");
  ok(a.bar.drag === null, "click leaves nothing held");
  eq(a.lefts(), W.map(() => null), "no offsets at rest");
}
// 2. A press with a wobble under 5px is still a click.
{
  const a = fresh();
  a.press(3, 330); a.move(333); a.up();
  eq(runs(), [["tab.select", { id: ORIGINAL[3] }]], "wobble is a click");
}
// 3. Drag the first tab past the third one's middle.
{
  const a = fresh();
  const rest = a.ids();
  a.press(0, 30);
  eq(a.lefts(), W.map(() => null), "pressed only: nothing slides yet");
  ok(a.held() === null, "pressed only: nothing lifted");
  eq(a.ids(), rest, "pressed only: the tabs keep their ids");
  a.move(100); ok(a.bar.drag.moved && a.bar.drag.to === 0, "moved but not past a neighbour");
  eq(a.lefts(), W.map(() => 0), "moving: every tab has an offset, 0 so far");
  eq(a.held(), { left: 0, width: 120, top: 5 }, "moving: the tab is lifted where it stood");
  eq(a.unseen(), [1, 0, 0, 0, 0, 0, 0, 0, 0], "moving: its place in the row is kept, unseen");
  ok(a.ids().every((id, i) => id === `${rest[i]}~${a.bar.drag.serial}`), "moving: ids of this drag's own");
  a.move(180); eq(a.bar.drag.to, 1, "past the 2nd tab's middle");
  a.move(270); eq(a.bar.drag.to, 2, "past the 3rd tab's middle");
  eq(a.lefts(), [0, -123, -123, 0, 0, 0, 0, 0, 0], "offsets 0 -> 2");
  eq(a.held(), { left: 186, width: 120, top: 5 }, "lifted tab at the 3rd place");
  ok(Boolean(a.chip(0).props.cursor_grabbing), "held tab has the grabbing cursor");
  a.up();
  eq(runs(), [["tab.move", { id: ORIGINAL[0], index: 3 }]], "drop moves to place 3");
  ok(a.bar.drag?.dropped === true, "preview held after drop");
  eq(a.lefts(), [0, -123, -123, 0, 0, 0, 0, 0, 0], "offsets held after drop");
  eq(a.held(), { left: 186, width: 120, top: 5 }, "lifted tab held after drop");
  reorder(0, 2); a.render();
  ok(a.bar.drag === null, "preview ends when the order changes");
  eq(a.lefts(), W.map(() => null), "no offsets after landing");
  ok(a.held() === null && a.unseen().every((u) => !u), "nothing lifted or unseen after landing");
  eq([...a.ids()].sort(), [...rest].sort(), "the tabs have their own ids back");
  const before = a.bar.presses; a.press(1, 150); a.move(400);
  ok(a.bar.drag.serial === before + 1 && a.ids()[1].endsWith(`~${before + 1}`), "the next drag has another serial");
}
// 4. Drag the sixth tab left to the second place, then back home: nothing moves.
{
  const a = fresh();
  a.press(5, 600);
  a.move(170); eq(a.bar.drag.to, 1, "5 -> 1");
  eq(a.lefts(), [0, 203, 203, 203, 203, 0, 0, 0, 0], "offsets 5 -> 1");
  eq(a.held(), { left: 123, width: 200, top: 5 }, "lifted tab at the 2nd place");
  a.move(50); eq(a.bar.drag.to, 0, "5 -> 0");
  a.move(650); eq(a.bar.drag.to, 5, "back home");
  a.up();
  eq(runs(), [], "dropped at home: no command");
  ok(a.bar.drag === null, "nothing held");
}
// 5. The pointer dips off the strip and comes back: the drag goes on.
{
  const a = fresh();
  a.press(0, 30); a.move(270); a.hover(false);
  eq(timers.map((t) => t.ms), [400], "leaving starts the wait");
  a.hover(true); fire(400); a.render();
  eq(runs(), [], "back in time: nothing dropped");
  ok(a.bar.drag && !a.bar.drag.dropped && a.bar.drag.to === 2, "still held");
  a.move(400); eq(a.bar.drag.to, 3, "still follows");
  a.up(); eq(runs(), [["tab.move", { id: ORIGINAL[0], index: 4 }]], "then drops");
}
// 6. The pointer leaves and stays out: the tab lands where it was shown.
{
  const a = fresh();
  a.press(0, 30); a.move(270); a.hover(false); fire(400); a.render();
  eq(runs(), [["tab.move", { id: ORIGINAL[0], index: 3 }]], "left for good: dropped where shown");
  a.up(); eq(runs().length, 1, "a late release adds nothing");
  a.move(500); eq(a.bar.drag?.to, 2, "a dropped tab no longer follows");
}
// 7. Leaving twice: the first wait must not end the second.
{
  const a = fresh();
  a.press(0, 30); a.move(270); a.hover(false); a.hover(true); a.hover(false);
  const [first, second] = timers.splice(0);
  first.fn(cx); a.render();
  eq(runs(), [], "the first wait is void");
  second.fn(cx); a.render();
  eq(runs().length, 1, "the second one drops");
}
// 8. A press that leaves without moving is forgotten.
{
  const a = fresh();
  a.press(3, 330); a.hover(false); fire(400); a.render();
  ok(a.bar.drag === null, "press forgotten");
  a.up(); eq(runs(), [], "no select after that");
}
// 9. A release nobody heard, then a press elsewhere: nothing moves.
{
  const a = fresh();
  a.press(0, 30); a.move(270); a.out();
  ok(a.bar.drag === null, "forgotten on a press elsewhere");
  a.up(); eq(runs(), [], "and the next release does nothing");
}
// 10. Same, pressing a starter in the pill.
{
  const a = fresh();
  a.press(0, 30); a.move(270);
  byId(a.root(), "start-shell").handlers["on_mouse_down:left"]({}, cx); a.render();
  ok(a.bar.drag === null, "forgotten on a starter press");
}
// 11. Double-click renames, with the words for a tab that has an agent title.
{
  const a = fresh();
  a.press(0, 30); a.up(); a.press(0, 30, 2); a.up();
  const o = CALLS.filter((c) => c[0] === "openOverlay").map((c) => c[1]);
  eq(o.length, 1, "one dialog");
  eq([o[0].mod, o[0].kind, o[0].props.title, o[0].props.value, o[0].props.hint, o[0].props.command],
    ["prompt", "dialog", "rename tab", "", 'empty: its agent\'s own title, "Design overview"', { name: "tab.rename", args: { id: ORIGINAL[0] } }], "rename dialog for an unnamed tab");
  eq(runs(), [["tab.select", { id: ORIGINAL[0] }]], "only the first click selected");
}
// 12. Right-click opens this mod's menu; a named tab's dialog starts from its name.
{
  const a = fresh();
  a.chip(1).handlers["on_mouse_down:right"]({}, cx);
  eq(CALLS.filter((c) => c[0] === "openOverlay").map((c) => c[1]), [{ mod: "glyph", kind: "popup", width: 200, props: { role: "menu", tab: ORIGINAL[1] } }], "tab menu");
  CALLS.length = 0;
  a.press(1, 150, 2);
  const p = CALLS.find((c) => c[0] === "openOverlay")[1].props;
  eq([p.value, p.hint], ["acme.cpp", 'empty: its agent\'s own title, "Fuzz the config loader"'], "named tab's dialog");
}
// 13. Widths unknown: the tab under the pointer is where it lands, marked, no offsets.
{
  const a = fresh(false);
  a.press(0, 30);
  ok(a.bar.drag.widths === null, "no widths");
  a.move(270); eq(a.bar.drag.to, 0, "the strip's own move says nothing without widths");
  a.moveOver(2, 270); eq(a.bar.drag.to, 2, "the tab under the pointer");
  eq(a.lefts(), W.map(() => 0), "no offsets");
  ok(a.held() === null && a.unseen().every((u) => !u), "nothing lifted without widths");
  a.up(); eq(runs(), [["tab.move", { id: ORIGINAL[0], index: 3 }]], "drop moves");
}
// 14. F2 (glyph.rename) renames the shown tab.
{
  const a = fresh();
  await new Promise((r) => setTimeout(r, 5));
  globalThis.__deliver("rename");
  await new Promise((r) => setTimeout(r, 5));
  const o = CALLS.filter((c) => c[0] === "openOverlay").map((c) => c[1]);
  eq([o.length, o[0]?.props.command.args.id, o[0]?.props.value], [1, ORIGINAL[2], "relay"], "F2 renames the shown tab");
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
