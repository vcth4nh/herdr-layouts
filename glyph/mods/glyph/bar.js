// The top strip. Left: the shown project (its tile and name; click for the list you type
// in to go to a tab, goto.js, which the search button at the far end opens too),
// then its tabs: each is its logo and its title (the name you gave it, else what its
// agent says it is doing; a tab with nothing to say yet is its logo alone). The titles
// share the strip: short ones stay whole, long ones shorten together, and when there is
// no room for words the resting tabs are logos and only the shown one keeps its title.
// Double-click a tab to rename it (F2 does the same for the shown one), right-click it
// for its menu, scroll the strip to step through them, and drag a tab along the strip
// to move it: it lifts, the others step aside as it goes, and where it stands when you
// let go is where it lands. The dashed pill starts things: a logo is "a new tab running that",
// the prompt is a plain terminal, the dots are the full + menu. Right: what wants you
// (click to go to the next one), the Files and Changes panels, the window that copies
// files between machines (transfer.js), search.
//
// The bar is also where a tab is closed, whoever asks (its x, the close key, a menu, a
// pane's header): see ask() and shut(). Closing what isn't a plain shell takes two presses.
// Closing the shown tab shows the tab of its project you used last before it (else the
// one after it), and so does a shown tab that ends by itself: see use(). Closing a
// project's last tab leaves the project on show as an empty page (blank.js), which goes
// once you look elsewhere. When the project on show closes, its neighbour on its machine
// shows. With Herdr's peek on show (a sub-agent's terminal, over the tab), a close key
// closes the peek only: see unpeek().
// A last tab that ends by itself (its shell exits) leaves the same page: while the project
// on show has a single tab, one stands by behind it, out of sight. See stand().
// Keys bound to this layout in keys.json ("layout:glyph") arrive as commands:
//   rename, close, close-pane, new, new-<program key> (new-claude, new-codex, ...), transfer, goto, history.
// transfer, goto and history close what they opened when asked again. transfer-show, which a copy's
// notice sends when clicked, only opens.
// The bar also says how each copy the transfer window started has ended: see mind().
// And it keeps the number of tabs that need you on Herdr's Dock icon (macOS): see flag().
// And it keeps the list of the projects that were closed (history.js): see keep().

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, run, layout, settings, spaces, panes, terminals, focused, machines, shared, setShared, notify, window as win, openOverlay, knownAgents, nextCommand, setBadge, checking } from "herdr";
import { model, jump, tabTip, find, tabMenu, openGoto, renameTab, newTab, shell, keyFor, withKey, BLANK, SHUT, ARM, PAST, past, sketch, shelve, openHistory } from "./data.js";
import { copies, settle, openTransfer, showTransfer, STARTING } from "./copy.js";
import { ICON, INK, DISPLAY, alpha, mix, logo, inkOf, danger, orb, tile, iconButton, textWidth } from "./ui.js";

const stop = (_e, cx) => cx.stop_propagation();

const TITLE = 12.5;     // the size tab titles are set in
const TITLE_MAX = 240;  // the most room one title takes
const TITLE_MIN = 32;   // with less than this for each, resting tabs go back to logos
const GAP = 3;          // between two tabs
const AWAY = 400;       // ms a held tab waits for a pointer that left the strip
const LAND = 2000;      // ms a dropped tab's preview waits for the move to really happen
const PAGE = 4000;      // ms an empty page that was asked for is given to come: a last tab waits that long for it
const GONE = 5000;      // ms a tab asked to close counts as closed before it really is
const SHY = 60000;      // ms no page is asked to stand by for a project after something else closed one: see tend()
const NOTE = 1000;      // ms between looks at which projects there are: see keep()
const FRESH = 60000;    // ms after the bar starts that Herdr may not list a machine yet: see keep()
const LOOK = 120;       // ms between looks at what changed: see look()
const REST = 8;         // with nothing drawn, only every so many looks really look
const ASK = 2000;       // ms before hc is asked again how a copy ended
const AGAIN = 2000;     // ms after the bar starts that the Dock icon is told its number once more: see flag()
const USED = 1000;      // ms a tab stays on show before it counts as used: see use()
const KEPT = 100;       // how many used tabs the bar remembers

// The room each title gets when `room` is shared out: those that need less keep their
// own width, the rest get this much each. Infinity: all of them fit as they are.
function fit(wants, room) {
  const sorted = [...wants].sort((a, b) => a - b);
  let left = room;
  for (let i = 0; i < sorted.length; i++) {
    const share = left / (sorted.length - i);
    if (sorted[i] >= share) return share;
    left -= sorted[i];
  }
  return Infinity;
}

// The tab that shows in place of a project that closed while on show: the row after it in
// the rail, else the row before it. On its own machine that is the first tab of the
// project after it, else the last tab of the one before it. Only a
// machine's only project hands over to another machine: to the next project in the list,
// else to the one before it.
// `order` is the projects as the rail listed them ({ id, machine }), the closed one, `id`,
// among them, and `spaces` the ones there are now. A project left with only its empty page
// is passed over: it closes once another one is on show. Null when no project has a tab.
function heir(order, id, spaces) {
  const at = order.findIndex((x) => x.id === id);
  if (at < 0) return null;
  const there = (list) => list.map((x) => spaces.find((s) => s.id === x.id && s.tabs.length)).filter(Boolean);
  const after = there(order.slice(at + 1)), before = there(order.slice(0, at)).reverse();
  const near = (s) => s.machine === order[at].machine;
  const to = after.find(near) ?? before.find(near) ?? after[0] ?? before[0];
  if (!to) return null;
  return after.includes(to) ? to.tabs[0] : to.tabs[to.tabs.length - 1];
}

export class Bar {
  constructor(cx) {
    this.drag = null; // the tab under a held button, and where it would land: see press()
    this.sizes = {};  // tab id -> how wide it was last laid out
    this.swipe = 0;
    this.swipeAt = 0;
    this.stepAt = 0;
    this.room = null; // how wide the tabs' part of the strip is, once it has been laid out
    this.known = {}; // machine ("" for this computer) -> what it can start
    this.asked = {};
    this.armed = null;      // what a first close press was for: see ask()
    this.leaving = null;    // a project's last tab, waiting for its empty page: see shut()
    this.paged = null;      // the project a page was last asked to stand by for, and when: see stand()
    this.stowed = new Map(); // empty page -> when it was asked to be put away, until it is
    this.stood = null;      // the page that stood by at the last look, and its project: see tend()
    this.shy = new Map();   // project -> when a page standing by for it was closed by something else
    this.tripped = "";      // what the last look that went wrong said: see look()
    this.going = new Map(); // tab id -> when it was asked to close
    this.handed = null;     // the shown tab shut() last closed, once it had shown another: see follow()
    this.swept = new Map(); // empty page -> when it was asked to close
    this.last = null;       // the project and tab on show at the last look: see follow()
    this.used = [];         // tab ids, the one used last first: see use()
    this.since = null;      // the tab on show, and since when
    this.listed = null;     // the ids of the tabs there were at the last look
    this.dirty = true;      // something was drawn since the last look: see look()
    this.rests = 0;         // looks since then that found nothing drawn
    this.settling = new Map(); // copy id -> when hc was last asked how it ended: see mind()
    this.badge = undefined; // what the Dock icon was last told to wear (null: nothing): see flag()
    this.born = Date.now(); // when this bar started
    this.told = false;      // the Dock icon was told once more, a moment after the start
    this.notes = null;      // project -> what it would be listed as if it closed now: see keep()
    this.slipped = "";      // what the last keep() that went wrong said
    this.learn(cx);
    cx.timer.every(3000, (cx) => this.learn(cx));
    cx.timer.every(LOOK, (cx) => this.look(cx));
    cx.timer.every(NOTE, () => this.keep(Date.now()));
    // Keys bound to this layout (keys.json, "layout:glyph") arrive here, and so does what
    // the other parts ask of the bar.
    cx.spawn(async (cx) => {
      for (;;) {
        const name = await nextCommand();
        // One command going wrong must not end the loop: every key above comes through it.
        try {
          this.command(name, cx);
        } catch (e) {
          notify({ title: `Glyph could not ${name}`, body: String(e?.message ?? e), level: "error" });
        }
        cx.notify();
      }
    });
  }

  command(name, cx) {
    const m = model();
    const s = m.active;
    const c = s?.tabs.find((x) => x.active);
    if (name === "rename") {
      if (c) renameTab(c);
    } else if (name === "close" || name === "close-pane") {
      // A peek on show is all a close key closes.
      if (this.unpeek()) return;
      if (name === "close") this.close(m, cx);
      else this.closePane(m, cx);
    } else if (name === "shut") {
      const asked = shared(SHUT);
      if (asked?.id && Date.now() - asked.at < GONE) this.shut(m, asked.id, cx);
    } else if (name === "transfer") openTransfer();
    else if (name === "transfer-show") showTransfer();
    else if (name === "goto") openGoto();
    else if (name === "history") openHistory(true);
    else if (name === "new") newTab(s);
    else if (name.startsWith("new-")) this.start(s, name.slice(4), cx);
  }

  // Closing something that isn't a plain shell takes two presses: the first only arms it
  // (the tab turns red for a moment), the second, on the same thing and in time, does it.
  // `tab` is the tab that shows it armed; `go` does the closing.
  ask(id, careful, tab, go, cx) {
    const now = Date.now();
    if (!careful || (this.armed?.id === id && now - this.armed.at < ARM)) {
      this.armed = null;
      go();
      return;
    }
    const mine = { id, tab, at: now };
    this.armed = mine;
    cx.timer.after(ARM, (cx) => {
      if (this.armed !== mine) return;
      this.armed = null;
      cx.notify();
    });
  }

  // Herdr's peek shows a terminal that has no pane (a sub-agent's, a copy's) over the shown
  // tab. Herdr does not say which overlays are open, but while a peek is, its terminal has
  // the keyboard and no pane does. A close key then closes the peek and nothing else: what
  // it showed keeps running, and the tab under it is not asked to close, a first press on
  // it taken back. True when there was a peek.
  unpeek() {
    const at = focused();
    if (!at?.terminal || at.pane) return false;
    this.armed = null;
    run("overlay.close");
    return true;
  }

  // The close key: the shown tab. A project showing its empty page has only that to close,
  // which closes the project. Herdr would then show the next project in its list, on the tab
  // it was last left on; the tab heir() gives is shown here instead, before the page goes, so
  // the window moves once.
  close(m, cx) {
    const s = m.active;
    if (!s) return;
    if (s.empty) {
      const to = heir(m.groups.flatMap((g) => g.spaces), s.id, m.spaces);
      if (to) run("tab.select", { id: to.id });
      for (const b of s.blanks) this.sweep(b);
      return;
    }
    const c = s.tabs.find((x) => x.active);
    if (c) this.ask(c.id, c.careful, c.id, () => this.shut(model(), c.id, cx), cx);
  }

  // The close-pane key: the focused pane. A tab's only pane is the tab.
  closePane(m, cx) {
    const at = focused();
    const p = at?.pane ? panes().find((x) => x.pane === at.pane) : null;
    const c = p ? m.flat.find((x) => x.id === p.tab) : null;
    if (!c && m.active?.empty) this.close(m, cx);
    else if (!c) run("pane.close");
    else if (c.panes < 2) this.ask(c.id, c.careful, c.id, () => this.shut(model(), c.id, cx), cx);
    else this.ask(p.pane, Boolean(p.terminal) && !p.program?.shell, c.id, () => run("pane.close", { pane: p.pane }), cx);
  }

  // Closes a tab, no more questions. One that isn't on show just goes. The shown one first
  // hands over to the tab of its project used last before it (recent()). With none known it
  // hands over to the tab after it (the last one, to the tab before it), which is the order
  // Herdr keeps when a tab ends by itself. A project's last tab first gets the
  // project's empty page beside it, and goes once that is there (tend() sees to it): Herdr
  // closes a project with its last tab and shows another one, which is the jump this avoids.
  // A page that already stands by (stand()) is shown at once, and the tab goes with no wait.
  shut(m, id, cx) {
    const c = m.flat.find((x) => x.id === id);
    if (!c) return;
    const s = c.space;
    const at = s.tabs.indexOf(c);
    const next = this.recent(s, c) ?? s.tabs[at + 1] ?? s.tabs[at - 1];
    const end = () => {
      this.going.set(id, Date.now());
      run("tab.close", { id, confirmed: true });
    };
    if (!c.shown) end();
    else if (next) {
      run("tab.select", { id: next.id });
      this.handed = id;
      end();
    } else {
      this.note(m, s, c);
      const page = s.blanks.find((b) => !this.swept.has(b.id));
      if (page) {
        run("tab.select", { id: page.id });
        end();
        return;
      }
      const mine = { tab: id, space: s.id };
      this.leaving = mine;
      // One asked to stand by a moment ago is on its way: tend() shows it once it is there.
      if (!this.due(s, Date.now())) run("tab.new", { space: s.id, mod: "glyph", props: { role: "blank" } });
      // If the page never comes, the tab closes all the same.
      cx.timer.after(PAGE, (cx) => {
        if (this.leaving !== mine) return;
        this.leaving = null;
        end();
        cx.notify();
      });
    }
  }

  // What the bar does by itself when the flock changes (tend, follow). A render may not
  // run commands, so it only notes that something was drawn (Herdr redraws a mod whenever
  // its lists change), and this, on a timer, does the looking. With nothing drawn it still
  // looks about once a second, in case the window is not being drawn at all.
  // A command that fails (its machine just went out of reach) must not end the looking: the
  // next look tries again, and a notice says what went wrong, once for each thing said.
  look(cx) {
    this.rests = this.dirty ? 0 : this.rests + 1;
    if (!this.dirty && this.rests % REST) return;
    this.dirty = false;
    try {
      const m = model();
      this.tend(m, Date.now());
      this.mind(cx);
      if (this.follow(m, Date.now())) cx.notify();
      this.flag(m, Date.now());
      this.tripped = "";
    } catch (e) {
      const said = String(e?.message ?? e);
      if (said !== this.tripped) notify({ title: "Glyph could not keep its tabs in order", body: said, level: "error" });
      this.tripped = said;
    }
  }

  // Copies the transfer window started (copy.js) go on by themselves, in terminals of
  // their own. One whose terminal is no longer live has ended, and the bar says how, once.
  // While hc still calls it live it is asked again a moment later.
  mind(cx) {
    const list = copies();
    for (const id of this.settling.keys()) if (!list.some((c) => c.id === id)) this.settling.delete(id);
    if (!list.length) return;
    const now = Date.now();
    const live = new Set(terminals().filter((x) => x.state === "live").map((x) => x.address));
    for (const c of list) {
      const last = this.settling.get(c.id);
      if (c.failed || live.has(c.id) || now - c.at < STARTING || last?.busy || now - (last?.at ?? 0) < ASK) continue;
      const ask = { at: now, busy: true };
      this.settling.set(c.id, ask);
      cx.spawn(async (cx) => {
        try {
          await settle(c);
        } catch {}
        ask.busy = false;
        cx.notify();
      });
    }
  }

  // Herdr's Dock icon wears the number of tabs that need you, wherever they are: the bell's
  // number, there for when Herdr is not the app in front. None need you: no badge. Tabs that
  // finished are not counted, since a badge is red whatever it says.
  // The badge is the app's, not this layout's, and the last mod to set it wins. So the icon is
  // told when the number changes, not at every look, and the bar takes the badge off as it
  // goes (gone()). When the app loads the mod again, the bar that goes may take off what the
  // new one has just put on: the new one says its number once more a moment after it started.
  // Only macOS shows a badge. Under `herdr-app check` nothing is set.
  flag(m, now) {
    if (checking()) return;
    const text = m.counts.blocked ? String(m.counts.blocked) : null;
    const again = !this.told && now - this.born >= AGAIN;
    if (text === this.badge && !again) return;
    if (again) this.told = true;
    this.badge = text;
    setBadge(text);
  }

  // The bar goes: another layout takes the window, or the app loads the mod again. Nobody
  // would keep the badge true, so it comes off.
  gone() {
    if (!checking()) setBadge(null);
  }

  // The list of closed projects (history.js) is kept here, in shared PAST. Herdr does not
  // tell a mod that a project closes, and by then nothing is left to ask what it was. So
  // while a project has tabs, the bar notes what it would be listed as (sketch() in
  // data.js), and keeps the notes across restarts. A project left with only its empty page
  // keeps the note it had.
  // A project that is gone from Herdr's list has closed, whoever closed it, and its note
  // joins the list. One whose machine is out of reach is only missing, and its note waits.
  // A machine Herdr does not list was taken off Herdr: its projects' notes are dropped, but
  // not in the bar's first minute, when Herdr may not have listed it yet.
  // A project closed while another layout was on show is found closed when this one shows
  // again. Under `herdr-app check` nothing is noted.
  keep(now) {
    if (checking()) return;
    try {
      this.notes ??= JSON.parse(localStorage.getItem("notes") ?? "{}");
      const m = model();
      const layouts = new Map(machines().map((k) => [k.name ?? null, k.layout]));
      const open = new Set(m.spaces.map((s) => s.id));
      let dirty = false;
      for (const s of m.spaces) {
        if (!s.tabs.length) continue;
        const next = sketch(s, this.notes[s.id]);
        if (JSON.stringify(next) === JSON.stringify(this.notes[s.id])) continue;
        this.notes[s.id] = next;
        dirty = true;
      }
      const closed = [];
      for (const [id, note] of Object.entries(this.notes)) {
        if (open.has(id)) continue;
        const layout = layouts.get(note.machine ?? null);
        if (layout ? layout !== "ready" : now - this.born < FRESH) continue;
        delete this.notes[id];
        dirty = true;
        if (layout) closed.push({ ...note, at: now });
      }
      const list = past(), next = shelve(list, closed, Object.values(this.notes));
      if (JSON.stringify(next) !== JSON.stringify(list)) setShared(PAST, next);
      if (dirty) localStorage.setItem("notes", JSON.stringify(this.notes));
      this.slipped = "";
    } catch (e) {
      const said = String(e?.message ?? e);
      if (said !== this.slipped) notify({ title: "Glyph could not keep its list of closed projects", body: said, level: "error" });
      this.slipped = said;
    }
  }

  // Asks an empty page to close, once: again only if it is still there much later.
  sweep(b) {
    const now = Date.now();
    if (now - (this.swept.get(b.id) ?? 0) < GONE) return;
    this.swept.set(b.id, now);
    run("tab.close", { id: b.id, confirmed: true });
  }

  // What an empty page shows of its project, noted while a tab can still tell: the project's
  // name, and the folder that tab is in (see BLANK in data.js). Written only when it changed:
  // every copy of the mod is drawn again for it.
  note(m, s, c) {
    const all = shared(BLANK) ?? {};
    const was = all[s.id];
    const now = { name: s.name, folder: c.cwd ?? was?.folder ?? "" };
    if (was?.name === now.name && was.folder === now.folder) return;
    // Closed projects are forgotten here, once every machine's projects are in.
    const kept = Object.fromEntries(Object.entries(all).filter(([k]) => !m.settled || m.spaces.some((x) => x.id === k)));
    kept[s.id] = now;
    setShared(BLANK, kept);
  }

  // Whether an empty page asked to stand by for this project is still on its way.
  due(s, now) {
    return this.paged?.space === s.id && now - this.paged.at < PAGE;
  }

  // The project on show, down to one tab `c`, keeps an empty page standing by. A tab that
  // ends by itself (its shell exits) is not the bar's to close: Herdr closes a project with
  // its last tab, and the bar hears of it afterwards. With `page` there the project has a
  // tab left, which Herdr shows, so it stays on show as after a close key.
  // The page is made without being shown (`focus: false`: last in the project, the keyboard
  // stays where it is) and put away (`tab.settle`), so stepping through the tabs skips it.
  // It is asked for once and then waited for, and asked to be put away once, and again only
  // if it is still out much later. One that is on show beside the tab (Herdr handed over to
  // it, or something picked it) hands back to the tab.
  // It is not asked for at the first look that finds the project on show, but at the next:
  // when a project closes, Herdr shows the next one in its list for a moment, and follow()
  // moves the window on from there, to a project the closed one's machine still has.
  stand(m, s, c, page, now) {
    this.note(m, s, c);
    if (!page) {
      if (this.last?.space !== s.id) {
        this.dirty = true; // the next look comes at once, drawn or not
        return;
      }
      if (this.due(s, now) || now - (this.shy.get(s.id) ?? -SHY) < SHY) return;
      this.paged = { space: s.id, at: now };
      run("tab.new", { space: s.id, mod: "glyph", props: { role: "blank" }, focus: false });
      return;
    }
    if (page.active) run("tab.select", { id: c.id });
    if (page.settled) this.stowed.delete(page.id);
    else if (now - (this.stowed.get(page.id) ?? 0) >= GONE) {
      this.stowed.set(page.id, now);
      run("tab.settle", { id: page.id });
    }
  }

  // Empty pages come and go by themselves. A last tab that was waiting for its page goes
  // once the page is there. The one tab of the project on show has a page standing by
  // (stand()). Any other page makes way for a tab that started beside it. And a project
  // left with only its page closes once another project is on show, the way it would have
  // closed with its last tab.
  tend(m, now) {
    for (const [id, at] of this.going) if (now - at > GONE || !m.flat.some((c) => c.id === id)) this.going.delete(id);
    const d = this.leaving;
    const home = d ? m.spaces.find((s) => s.id === d.space) : null;
    const page = home?.blanks.find((b) => !this.swept.has(b.id));
    if (page) {
      this.leaving = null;
      // Only while its project is still on show: showing a tab shows its project too.
      if (!page.active && home.active) run("tab.select", { id: page.id });
      this.going.set(d.tab, now);
      run("tab.close", { id: d.tab, confirmed: true });
    }
    const was = this.stood;
    this.stood = null;
    for (const s of m.spaces) {
      const real = s.tabs.filter((c) => !this.going.has(c.id));
      // Its first page that was not asked to close. One that was on its way has come.
      const own = s.blanks.find((b) => !this.swept.has(b.id));
      if (own && this.paged?.space === s.id) this.paged = null;
      // The one tab of the project on show, unless it is waiting for a page of its own.
      const lone = s.active && real.length === 1 && this.leaving?.space !== s.id ? real[0] : null;
      // The page that stays: the one standing by for that tab, or an empty project's first.
      const keep = lone ? own : real.length ? null : s.blanks[0];
      if (lone) {
        // The page that stood by a look ago is gone, and the bar did not ask it to go: something
        // else closes pages here, as Herdr on another computer does with this layout on show,
        // for a project it is not showing. Asking again at once would go on for ever.
        if (!own && was?.space === s.id && !this.swept.has(was.id)) this.shy.set(s.id, now);
        this.stand(m, s, lone, keep, now);
        if (own) this.stood = { space: s.id, id: own.id };
      }
      s.blanks.forEach((b) => {
        const spare = b !== keep;
        const left = !s.active && this.leaving?.space !== s.id;
        if (!spare && !left) return;
        // A page on show hands over to a tab first, so closing it changes nothing you see.
        if (s.active && b.active && real.length && !this.swept.has(b.id)) run("tab.select", { id: real[real.length - 1].id });
        this.sweep(b);
      });
    }
    for (const map of [this.swept, this.stowed]) for (const id of map.keys()) if (!m.spaces.some((s) => s.blanks.some((b) => b.id === id))) map.delete(id);
    for (const [id, at] of this.shy) if (now - at >= SHY) this.shy.delete(id);
  }

  // What changed on show since the last look. When the project that was on show has closed
  // (with its last tab, from Herdr's own menu, or by the close key on its empty page), Herdr
  // shows the next project in its list, on the tab it was last left on: the bar shows the tab
  // heir() gives, from the order the rail had the projects in at the last look.
  // When the tab on show has gone and its project is still on show, it ended by itself or
  // something other than the bar closed it. Herdr then shows the tab after it, and the bar
  // shows the one recent() gives, as after its own close.
  // True when a close press was taken back, which shows.
  follow(m, time) {
    const s = m.active;
    const tabs = s?.tabs ?? [];
    const now = s ? { space: s.id, machine: s.machine, tab: tabs.find((c) => c.active)?.id ?? null, order: m.groups.flatMap((g) => g.spaces.map((x) => ({ id: x.id, machine: x.machine }))) } : null;
    const was = this.last;
    this.last = now;
    this.use(m, s, now?.tab ?? null, Boolean(s) && was?.space === s.id, time);
    // A close press is for the tab that was on show when it was made.
    const back = Boolean(this.armed && was && was.tab !== now?.tab);
    if (back) this.armed = null;
    if (!was || !now) return back;
    if (was.space === now.space) {
      const ended = was.tab && was.tab !== now.tab && was.tab !== this.handed && !m.flat.some((c) => c.id === was.tab);
      const to = ended ? this.recent(s) : null;
      if (to && to.id !== now.tab) run("tab.select", { id: to.id });
      return back;
    }
    if (m.spaces.some((x) => x.id === was.space)) return back;
    // A project whose machine went out of reach is only missing, not closed.
    if (machines().some((k) => (k.name ?? null) === was.machine && k.layout !== "ready")) return back;
    const to = heir(was.order, was.space, m.spaces);
    if (to && to.id !== now.tab) run("tab.select", { id: to.id });
    return back;
  }

  // Which tabs were used, the last first. A tab you open counts as soon as it is on show.
  // Any other counts once it has stayed on show for USED, so one passed on the way to another
  // (stepping through them with a key) does not. Tabs opened faster than the looks come are
  // first seen together, and count from left to right: Herdr opens each right after the shown
  // one. `s` is the project on show and `tab` its tab on show (null for an empty page), `same`
  // whether the last look had that project on show too, `time` this look's.
  use(m, s, tab, same, time) {
    const was = this.since, before = this.listed;
    this.listed = new Set(m.flat.map((c) => c.id));
    if (was && time - was.at >= USED && m.flat.some((c) => c.id === was.tab)) this.remember(was.tab);
    if (was?.tab === tab) return;
    this.since = tab ? { tab, at: time } : null;
    // New is new within the project on show: a project that comes on show (made, or its machine
    // back in reach) brings tabs nobody opened just now.
    if (!tab || !before || before.has(tab) || !same) return;
    const fresh = s.tabs.filter((c) => !before.has(c.id));
    for (const c of fresh.slice(0, fresh.findIndex((c) => c.id === tab) + 1)) this.remember(c.id);
  }

  remember(id) {
    if (this.used[0] !== id) this.used = [id, ...this.used.filter((x) => x !== id)].slice(0, KEPT);
  }

  // The tab of project `s` used last, leaving out `but` and the tabs asked to close. Null
  // when none of its tabs was used since the bar started.
  recent(s, but) {
    for (const id of this.used) {
      const c = s.tabs.find((x) => x.id === id);
      if (c && c !== but && !this.going.has(id)) return c;
    }
    return null;
  }

  // A key that starts an agent: `key` is its key in Herdr's program table (claude, codex, ...).
  start(s, key, cx) {
    const machine = s?.machine ?? null, where = machine ?? "";
    const pick = (list) => (list ?? []).find((a) => a.key === key);
    const known = pick(this.known[where]) ?? pick(shared("new-menu.agents")?.[where]);
    if (known) {
      newTab(s, known);
      return;
    }
    cx.spawn(async () => {
      try {
        const a = pick(await knownAgents({ on: machine }));
        if (a) newTab(s, a);
        else notify({ title: `No agent called "${key}"`, body: "keys.json binds a key to it", level: "warning" });
      } catch {}
    });
  }

  // A press on a tab may turn into a drag. This keeps which tab, where the pointer was,
  // and how wide every tab is, so the others can be shown stepping aside.
  press(tabs, i, e) {
    const live = new Set(tabs.map((c) => c.id));
    for (const id of Object.keys(this.sizes)) if (!live.has(id) && !spaces().some((s) => s.tabs.some((c) => c.id === id))) delete this.sizes[id];
    const widths = tabs.map((c) => this.sizes[c.id] ?? 0);
    this.drag = {
      id: tabs[i].id, from: i, to: i, x0: e.position.x, moved: false, dropped: false, away: 0, at: Date.now(),
      serial: (this.presses = (this.presses ?? 0) + 1),
      order: tabs.map((c) => c.id).join(" "),
      widths: widths.every((w) => w > 0) ? widths : null,
    };
  }

  // The pointer moved with a tab held. Where would the tab land? It takes a neighbour's
  // place once the pointer is past that neighbour's middle, measured on the strip as it
  // was laid out (`e` is then the strip's own event). When the widths aren't known the
  // answer is simply the tab under the pointer, `over`. True when the answer changed.
  track(e, over) {
    const d = this.drag;
    if (!d || d.dropped) return false;
    d.at = Date.now();
    d.away = 0;
    if (!d.moved && Math.abs(e.position.x - d.x0) < 5) return false;
    let to = d.to;
    if (d.widths && over === null && e.bounds) {
      const gap = GAP * (settings()?.zoom || 1);
      const x = e.position.x - e.bounds.x;
      to = d.from;
      for (let k = 0, left = 0; k < d.widths.length; left += d.widths[k] + gap, k++) {
        const middle = left + d.widths[k] / 2;
        if (k < d.from && x < middle) {
          to = k;
          break;
        }
        if (k > d.from && x > middle) to = k;
      }
    } else if (!d.widths && over !== null) to = over;
    else return false;
    const changed = !d.moved || to !== d.to;
    d.moved = true;
    d.to = to;
    return changed;
  }

  // The button came up. A tab that was only pressed is shown; one that was moved lands.
  release(cx) {
    const d = this.drag;
    if (!d || d.dropped) return;
    if (!d.moved) {
      this.drag = null;
      run("tab.select", { id: d.id });
    } else this.land(d, cx);
    cx.notify();
  }

  // A moved tab goes to the place it was shown in, and the tabs stay as previewed until
  // they really are in that order (a tab on another machine takes a moment).
  land(d, cx) {
    if (d.to === d.from) {
      this.drag = null;
      return;
    }
    d.dropped = true;
    run("tab.move", { id: d.id, index: d.to + 1 });
    cx.timer.after(LAND, (cx) => {
      if (this.drag !== d) return;
      this.drag = null;
      cx.notify();
    });
  }

  // The pointer left the strip with a tab held. Out there the strip can't hear the
  // button come up, so unless the pointer is back in a moment the tab is let go where
  // it stands: dropping it a little below the strip works like dropping it on it.
  leave(cx) {
    const d = this.drag;
    if (!d || d.dropped) return;
    const mine = (this.leaves = (this.leaves ?? 0) + 1);
    d.away = mine;
    cx.timer.after(AWAY, (cx) => {
      if (this.drag !== d || d.away !== mine || d.dropped) return;
      if (d.moved) this.land(d, cx);
      else this.drag = null;
      cx.notify();
    });
  }

  // A new press anywhere means the last one is over, even if its release was never
  // heard: whatever was held is dropped back where it was.
  forget(cx) {
    if (!this.drag || this.drag.dropped) return;
    this.drag = null;
    cx.notify();
  }

  // Which agents the shown project's machine has: asked when you get there, and again
  // every few minutes (someone may install one). The app caches each answer a minute.
  learn(cx) {
    const machine = spaces().find((s) => s.active)?.machine ?? null;
    const where = machine ?? "";
    if (this.asked[where] && Date.now() - this.asked[where] < 300000) return;
    this.asked[where] = Date.now();
    cx.spawn(async (cx) => {
      try {
        this.known[where] = await knownAgents({ on: machine });
        cx.notify();
      } catch {}
    });
  }

  // Scrolling over the strip steps through its tabs. A wheel's notch is one tab; a
  // trackpad sends a stream of small moves, which must add up to a real swipe first.
  wheel(e) {
    const now = Date.now();
    let step = 0;
    if (e.delta_lines) step = Math.sign(e.delta_lines.y);
    else {
      if (e.touch_phase === "started" || now - this.swipeAt > 300) this.swipe = 0;
      this.swipe += e.delta.y;
      this.swipeAt = now;
      if (Math.abs(this.swipe) >= 48) {
        step = Math.sign(this.swipe);
        this.swipe = 0;
      }
    }
    if (!step || now - this.stepAt < 160) return;
    this.stepAt = now;
    run(step > 0 ? "tab.prev" : "tab.next");
  }

  render() {
    const t = theme();
    const now = Date.now();
    const m = model();
    const s = m.active;
    const w = win();
    const root = layout();
    const sidebar = find(root, "sidebar"), panel = find(root, "panel"), body = find(root, "panel-body");
    // With the rail hidden, macOS's window buttons sit over this strip's start.
    const lights = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(2, (root.traffic_lights[0] + 64) / (settings()?.zoom || 1) - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 2;
    const spaceMenu = (_e, cx) => {
      cx.stop_propagation();
      openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: s.id } } });
    };
    const tag = (icon, text) => h_flex().flex_none().gap(4).items_center().text_size(11.5).text_color(t.dim)
      .child(svg(ICON(icon)).size(12).flex_none())
      .child(div().max_w(170).truncate().child(text));

    const crumb = !s ? div() : h_flex().id("crumb").h(32).flex_none().pl(5).pr(10).gap(8).items_center().rounded(10).cursor_pointer()
      .hover((x) => x.bg(t.hover))
      .on_mouse_down("left", stop)
      .on_click(() => openGoto())
      .on_mouse_down("right", spaceMenu)
      .child(tile(t, { name: s.name, hue: s.hue, active: true, size: 22 }))
      .child(div().max_w(280).truncate().text_size(13.5).font_family(DISPLAY).font_semibold().text_color(t.foreground).child(s.label))
      .when(Boolean(s.machine), (el) => el.child(tag("server", s.machine)));

    const where = s?.machine ?? "";
    const plain = shell();
    const can = (this.known[where] ?? shared("new-menu.agents")?.[where] ?? []).filter((a) => a.installed).slice(0, 4);
    const startersWidth = 28 + 27 * (can.length + 2);

    this.dirty = true;
    const tabs = s?.tabs ?? [];
    // What a first close press armed, while it waits for the second.
    const armed = this.armed && now - this.armed.at < ARM ? this.armed : null;
    const red = danger(t);
    // A drag is over once the tabs change under it (the move landed, one closed), or
    // when nothing has been heard of it for a while (the button came up elsewhere).
    if (this.drag && (this.drag.order !== tabs.map((c) => c.id).join(" ") || (!this.drag.dropped && now - this.drag.at > 15000))) this.drag = null;
    const d = this.drag;
    const dragging = Boolean(d?.moved) && !d.dropped;
    const zoom = settings()?.zoom || 1;
    // A press on a control inside the tabs' row is its own, and ends any held tab.
    const mine = (_e, cx) => {
      cx.stop_propagation();
      this.forget(cx);
    };
    // How far a tab stands from its own place while one is dragged: the dragged one is
    // where it would land, and the ones it passed have closed up behind it.
    const aside = (k) => {
      if (!d?.moved || !d.widths || d.to === d.from) return 0;
      const step = (j) => d.widths[j] / zoom + GAP;
      const between = (a, b) => {
        let sum = 0;
        for (let j = a; j <= b; j++) sum += step(j);
        return sum;
      };
      if (k === d.from) return d.to > d.from ? between(d.from + 1, d.to) : -between(d.to, d.from - 1);
      if (d.to > d.from && k > d.from && k <= d.to) return -step(d.from);
      if (d.to < d.from && k >= d.to && k < d.from) return step(d.from);
      return 0;
    };
    // What each title would take, and what a tab takes besides its title: its logo, and
    // the shown one's close button.
    const widths = tabs.map((c) => (c.title ? Math.min(Math.ceil(textWidth(c.title, TITLE)) + 1, TITLE_MAX) : 0));
    const rest = (c) => (c.active ? 66 : 46);
    const taken = tabs.reduce((sum, c) => sum + 3 + (c.title ? rest(c) : c.active ? 61 : 32), 0);
    const crowded = this.room !== null && fit(widths.filter(Boolean), this.room - startersWidth - taken) < TITLE_MIN;
    const words = (label, ink) => div().flex_1().min_w(0).truncate().text_size(TITLE).text_color(ink).child(label);
    const chip = (c, i) => {
      const label = c.title && (c.active || !crowded) ? c.title : "";
      const held = Boolean(d?.moved) && d.from === i;
      // The tab being moved is drawn by lifted(), over the row: here it only keeps its place.
      const unseen = held && Boolean(d.widths);
      const ink = c.active || held ? t.foreground : c.status === "blocked" ? t.blocked : t.muted;
      // A first close press landed here: the next one closes it.
      const hot = armed?.tab === c.id;
      // Without the widths nothing can step aside: a mark on the tab it would land by.
      const mark = Boolean(d?.moved) && !d.widths && d.to === i && d.from !== i;
      // A slide belongs to an element's id. For as long as a drag lasts every tab has an
      // id of that drag's own, so each drag starts from rest and leaves nothing behind.
      const sliding = Boolean(d?.moved);
      return h_flex().id(sliding ? `chip-${c.id}~${d.serial}` : `chip-${c.id}`).h(32).pl(1).pr(c.active ? 7 : label ? 10 : 1).gap(5).items_center().rounded(16).cursor_pointer()
        // Every title grows from nothing by the same amount, and stops at its own width:
        // that is the sharing out. The shown tab starts 20 ahead, for its close button,
        // and keeps a few words however little room there is.
        .when(Boolean(label), (el) => el.flex_grow(1).flex_shrink(1).flex_basis(c.active ? 20 : 0)
          .min_w(rest(c) + (c.active ? Math.min(widths[i], 56) : 0)).max_w(rest(c) + widths[i]))
        .when(!label, (el) => el.flex_none())
        .when(c.active && !held, (el) => el.bg(hot ? alpha(red, "38") : t.raised))
        .when(held, (el) => el.bg(alpha(t.accent, "40")))
        .when(unseen, (el) => el.opacity(0))
        .when(!c.active && !d?.moved, (el) => el.hover((x) => x.bg(t.hover)))
        .when(!d?.moved, (el) => el.tooltip(tabTip(c, now)))
        // While a tab is being moved, the others are drawn where they would be if the
        // button came up now, and slide there.
        .when(sliding, (el) => el.relative().left(unseen ? 0 : aside(i)).transition("left", { duration: 140, easing: "ease-out" }))
        .when(dragging, (el) => el.cursor_grabbing())
        .when(mark, (el) => el.child(div().absolute().top(5).bottom(5).w(3).rounded_full().bg(t.accent)
          .when(d.from < i, (x) => x.right(-2)).when(d.from > i, (x) => x.left(-2))))
        .on_size_change((size) => { this.sizes[c.id] = size.width; })
        .on_mouse_down("left", (e, cx) => {
          cx.stop_propagation();
          if (e.click_count === 2) {
            this.drag = null;
            renameTab(c);
          } else this.press(tabs, i, e);
          cx.notify();
        })
        .on_mouse_move((e, cx) => { if (this.track(e, i)) cx.notify(); })
        .on_mouse_down("right", (_e, cx) => {
          cx.stop_propagation();
          this.forget(cx);
          tabMenu(c);
        })
        .child(orb(t, { program: c.program, status: c.status, subs: c.subs, backdrop: c.active ? (hot ? mix(t.chrome, red, 0.22) : t.raised) : t.chrome }))
        .when(Boolean(label), (el) => el.child(words(label, ink)))
        .when(c.active, (el) => el.child(div().id(`close-${c.id}`).flex_none().size(18).rounded_full().flex().items_center().justify_center()
          .when(!hot, (x) => x.text_color(t.dim).hover((y) => y.bg(t.input).text_color(t.foreground)))
          .when(hot, (x) => x.bg(red).text_color(INK).loop("opacity", { from: 0.6, to: 1, period: 700 }))
          .tooltip(hot ? "Again to close" : withKey("Close tab", keyFor("glyph.close", "tab.close")))
          .on_mouse_down("left", mine)
          .on_click((_e, cx) => {
            cx.stop_propagation();
            this.ask(c.id, c.careful, c.id, () => this.shut(model(), c.id, cx), cx);
            cx.notify();
          })
          .child(svg(ICON("x")).size(11))));
    };

    // The tab being moved, drawn once more over the row, solid and where it would land:
    // the tabs it passes go under it, not through it.
    const lifted = () => {
      const c = tabs[d.from];
      const label = c.title && (c.active || !crowded) ? c.title : "";
      const fill = mix(t.chrome, t.accent, 0.3);
      let home = 0;
      for (let j = 0; j < d.from; j++) home += d.widths[j] / zoom + GAP;
      return h_flex().id(`held~${d.serial}`).absolute().top(((find(root, "bar")?.size?.px ?? 42) - 32) / 2).left(home + aside(d.from))
        .w(d.widths[d.from] / zoom).h(32).pr(c.active ? 6 : label ? 9 : 0).gap(5).items_center().rounded(16)
        .bg(fill).border_1().border_color(alpha(t.accent, "b3")).shadow_md()
        .transition("left", { duration: 140, easing: "ease-out" })
        .when(dragging, (el) => el.cursor_grabbing())
        .child(orb(t, { program: c.program, status: c.status, subs: c.subs, backdrop: fill }))
        .when(Boolean(label), (el) => el.child(words(label, t.foreground)))
        .when(c.active, (el) => el.child(div().flex_none().size(18).flex().items_center().justify_center().text_color(t.dim).child(svg(ICON("x")).size(11))));
    };

    const round = (id, tip, onClick, child) => div().id(id).flex_none().size(26).rounded_full().flex().items_center().justify_center().cursor_pointer()
      .text_color(t.dim).hover((x) => x.bg(t.hover).text_color(t.foreground))
      .tooltip(tip).on_mouse_down("left", mine).on_click(onClick).child(child);
    const starters = h_flex().flex_none().h(32).pl(9).pr(3).gap(1).items_center().rounded(16)
      .border_1().border_dashed().border_color(t.input)
      .child(svg(ICON("plus")).size(11).flex_none().mr(3).text_color(t.dim))
      .children(can.map((a) => round(`start-${a.key}`, withKey(`New ${a.name} tab`, keyFor(`glyph.new-${a.key}`)), () => newTab(s, a), logo(a, 15, inkOf(t, a)))))
      // A plain terminal: the logo its tab will wear.
      .child(round("start-shell", withKey("New terminal tab", keyFor("glyph.new", "tab.new")), () => newTab(s), logo(plain, 15, inkOf(t, plain))))
      .child(round("start-more", "More: other agents, a project, a worktree", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }), svg(ICON("more")).size(14)));

    // What wants you, anywhere: a count behind a bell (needs you) or a tick (finished).
    const wants = (k, icon, tip) => h_flex().id(`wants-${k}`).h(26).flex_none().pl(8).pr(10).gap(5).items_center().rounded_full().cursor_pointer()
      .bg(alpha(t[k], "24")).text_color(t[k]).text_size(12.5).font_family(DISPLAY).font_bold()
      .hover((x) => x.bg(alpha(t[k], "40")))
      .tooltip(tip).on_mouse_down("left", stop).on_click(() => jump(m, k))
      .child(div().flex().flex_none().when(k === "blocked", (el) => el.loop("opacity", { from: 0.5, to: 1, period: 900 }))
        .child(svg(ICON(icon)).size(13)))
      .child(String(m.counts[k]));

    const side = (id, icon, tip) => {
      const on = Boolean(panel) && !panel.hidden && body?.active === id;
      return iconButton(t, {
        id: `panel-${id}`, icon, tip, on,
        onClick: () => {
          if (on) run("layout.hide", { id: "panel" });
          else {
            run("layout.select", { stack: "panel-body", child: id });
            run("layout.show", { id: "panel" });
          }
        },
      });
    };

    // The transfer window's button. A ring turns around it while copies are under way, and
    // a dot says one failed.
    const moved = copies(), lost = moved.filter((c) => c.failed).length, moving = moved.length - lost;
    const transfer = div().relative().flex_none()
      .when(moving > 0, (el) => el.child(div().absolute().top(0).left(0).size(28)
        .child(svg(ICON("ring")).size(28).text_color(t.working).spin(1300))))
      .child(iconButton(t, {
        id: "transfer", icon: "transfer", onClick: () => openTransfer(),
        tip: [withKey("Copy files between machines", keyFor("glyph.transfer")), moving ? `${moving} under way` : "", lost ? `${lost} failed` : ""].filter(Boolean).join(", "),
      }))
      .when(lost > 0, (el) => el.child(div().absolute().top(3).right(3).size(6).rounded_full().bg(t.blocked)));

    const n = m.counts;
    return h_flex().id("strip").size_full().min_w(0).pl(lights).pr(10).gap(6).items_center().bg(t.chrome)
      // A held tab is let go wherever on the strip the button comes up; see leave()
      // for a pointer that wanders off the strip first.
      .on_mouse_up("left", (_e, cx) => this.release(cx))
      .on_hover((hovered, cx) => {
        if (!hovered) this.leave(cx);
        else if (this.drag) this.drag.away = 0;
      })
      .on_scroll_wheel((e) => this.wheel(e))
      .child(crumb)
      .when(Boolean(s), (el) => el.child(div().w(1).h(16).flex_none().bg(t.border)))
      // The tabs and the pill after them get all the room the rest leaves.
      .child(h_flex().id("chips").relative().flex_1().min_w(0).h_full().gap(3).items_center().overflow_x_hidden()
        .on_size_change((size, cx) => {
          const room = Math.round(size.width);
          if (room === this.room) return;
          this.room = room;
          cx.notify();
        })
        .on_mouse_move((e, cx) => { if (this.track(e, null)) cx.notify(); })
        .on_mouse_down("left", (_e, cx) => this.forget(cx))
        .on_mouse_down_out((_e, cx) => this.forget(cx))
        .children(tabs.map(chip))
        .child(starters)
        .when(Boolean(d?.moved) && Boolean(d.widths), (el) => el.child(lifted())))
      .when(n.blocked > 0, (el) => el.child(wants("blocked", "bell", `${n.blocked} need${n.blocked === 1 ? "s" : ""} you: go to the next`)))
      .when(n.done > 0, (el) => el.child(wants("done", "check", `${n.done} finished: go to the next`)))
      .child(side("files", "files", "Files"))
      .child(side("changes", "diff", "Changes"))
      .child(transfer)
      .child(iconButton(t, { id: "search", icon: "search", tip: withKey("Go to a tab", keyFor("glyph.goto")), onClick: () => openGoto() }))
      // Where the system draws no window buttons (Linux, Windows), these are them.
      .when(Boolean(w?.buttons), (el) => el
        .child(iconButton(t, { id: "win-min", icon: "minus", tip: "Minimize", onClick: () => run("window.minimize") }))
        .child(iconButton(t, { id: "win-max", icon: w.maximized ? "unzoom" : "zoom", tip: "Maximize", onClick: () => run("window.maximize") }))
        .child(iconButton(t, { id: "win-close", icon: "x", tip: "Close", onClick: () => run("window.close") })));
  }
}
