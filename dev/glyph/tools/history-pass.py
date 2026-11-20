#!/usr/bin/env python3
"""history-pass.py: the installed glyph's list of closed projects against the real app.

It makes a throwaway project of one plain shell, in an empty temporary folder, without
showing it (`focus: false`), closes it, and reads in Herdr's shared.json what the bar listed.
It opens the list over the window for a moment by the command its key sends, takes a frame
and closes it the same way. Then it makes the project again as its row would (the same
`space.new`, here with `focus: false`), and reads that the row left the list and that the
project has its hue back.

What the window shows stays as it is, but for the list, which is over it four times for under a
second each and has the keyboard meanwhile. Don't type in Herdr while it runs: about half a minute.

At the end it takes its own rows off the list. Nothing but the mod can do that, so for a
moment the installed history.js is a stand-in that forgets the rows in the pass's folder and
closes itself. The file is then put back as it was installed, byte for byte, unless
something else changed it meanwhile, which the pass says.

Run it with the Bash sandbox off, with glyph on show and the mod installed (tools/sync.sh).
The frame lands in .local/shots/history-list.png, and is only new while the window is on screen.
"""
import json, os, subprocess, tempfile, time

S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOME = os.path.expanduser("~")
APP = os.path.join(HOME, ".config", "herdr-app")
PART = os.path.join(APP, "mods", "glyph", "history.js")
SHOTS = os.path.join(S, ".local", "shots")
os.makedirs(SHOTS, exist_ok=True)
results = []


def app(*args):
    r = subprocess.run(["herdr-app", *args], capture_output=True, text=True, timeout=20)
    try:
        return json.loads(r.stdout)
    except Exception:
        return {"raw": r.stdout.strip(), "err": r.stderr.strip(), "code": r.returncode}


def do(name, wait=0.35, **kw):
    out = app("do", name, json.dumps(kw))
    time.sleep(wait)
    return out


def status():
    s = app("status")
    return {k: s.get(k) for k in ("space", "tab", "focused_pane")}


def shared():
    """Herdr's shared values as it last saved them: it saves in the background."""
    try:
        return json.load(open(os.path.join(APP, "shared.json")))
    except Exception:
        return {}


def check(what, got, want):
    ok = got == want
    results.append(ok)
    print(("PASS  " if ok else "FAIL  ") + what + ("" if ok else f"\n      got  {got}\n      want {want}"), flush=True)


def once(fn, good, limit=10.0):
    """What fn gives as soon as `good` says it will do, or what it gives when the time is up.
    The bar looks at the projects once a second, and Herdr saves a shared value a moment later."""
    end = time.time() + limit
    got = fn()
    while not good(got) and time.time() < end:
        time.sleep(0.3)
        got = fn()
    return got


state = app("status")
if state.get("layout") != "glyph" or not os.path.exists(PART):
    raise SystemExit("glyph is not on show, or its installed mod has no history.js: run tools/sync.sh first")
# Outside any repo, so Herdr names the project after this folder, not after a repo.
CWD = os.path.realpath(tempfile.mkdtemp(prefix="glyph-history-pass-"))
NAME = os.path.basename(CWD)
made = []
orig = status()
print("the window was on", orig, flush=True)


def rows():
    """The pass's own rows on the list of closed projects, and where the first of them stands."""
    all_ = shared().get("glyph.history") or []
    mine = [e for e in all_ if e.get("folder") == CWD]
    return {"n": len(mine), "top": bool(all_) and all_[0].get("folder") == CWD, "row": mine[0] if mine else None}


def project():
    out = do("space.new", folder=CWD, machine="", focus=False)
    if "space" not in out:
        raise SystemExit(f"could not make a project: {out}")
    made.append(out["space"])
    return out["space"]


def close(sid):
    do("space.close", id=sid, confirmed=True)
    made.remove(sid)


STANDIN = """// history-pass.py's stand-in for history.js: it takes the pass's own rows off the list
// of closed projects and closes itself. The real file is put back a moment later.
import { div } from "gpui-kit";
import { props, closeOverlay } from "herdr";
import { past, forget } from "./data.js";
export class History {
  constructor(cx) {
    cx.timer.after(60, () => {
      for (const e of past()) if (e.folder === %s) forget(e);
      closeOverlay(props()?.overlay);
    });
  }
  gone() {}
  render() {
    return div();
  }
}
"""


def sweep():
    """Takes the pass's rows off the list, with the mod's own forget()."""
    was = open(PART, "rb").read()
    mine = (STANDIN % json.dumps(CWD)).encode()
    open(PART, "wb").write(mine)
    try:
        time.sleep(1.5)  # the app loads the mod again
        do("glyph.history", wait=0.5)
        left = once(lambda: rows()["n"], lambda n: n == 0)
        if "glyph" in (app("status").get("overlays") or []):
            do("overlay.close")
    finally:
        if open(PART, "rb").read() == mine:
            open(PART, "wb").write(was)
        else:
            print("history.js was changed by someone else meanwhile: left as it is", flush=True)
    time.sleep(1.5)
    return left


try:
    had = rows()["n"]
    a = project()
    check("a project made without being shown leaves the window where it was", status(), orig)
    hue = once(lambda: (shared().get("space.colors") or {}).get(a), lambda h: bool(h))
    time.sleep(2.5)  # the bar notes what a project would be listed as, once a second
    close(a)
    at = int(time.time() * 1000)
    r = once(rows, lambda x: x["n"] == had + 1)
    row = r["row"] or {}
    check("closed, it is on top of the list: its name, its folder, this computer, the hue it had, and no agent",
          (r["n"], r["top"], row.get("name"), row.get("named"), row.get("machine"), row.get("hue"), row.get("ran")), (1, True, NAME, False, None, hue, []))
    check("with the time it was found closed", abs((row.get("at") or 0) - at) < 12000, True)
    check("closing a project that was not on show left the window where it was", status(), orig)

    # The list on show, by the command its key sends, and gone by the same.
    do("glyph.history", wait=0.7)
    check("glyph.history opens the list", "glyph" in (app("status").get("overlays") or []), True)
    app("shot", os.path.join(SHOTS, "history-list.png"))
    do("glyph.history", wait=0.5)
    check("and sent again closes it", "glyph" in (app("status").get("overlays") or []), False)
    do("glyph.history", wait=0.5)
    do("overlay.close", wait=0.4)
    do("glyph.history", wait=0.5)
    check("closed from outside, the next one opens it", "glyph" in (app("status").get("overlays") or []), True)
    do("glyph.history", wait=0.5)
    check("(and closes it)", "glyph" in (app("status").get("overlays") or []), False)

    # Open again: what its row asks of Herdr, without showing the project.
    b = project()
    r = once(rows, lambda x: x["n"] == 0)
    check("made again in its folder, it is open, and its row has left the list", r["n"], 0)
    check("in the hue it had", once(lambda: (shared().get("space.colors") or {}).get(b), lambda h: bool(h)), hue)
    time.sleep(2.5)
    close(b)
    r = once(rows, lambda x: x["n"] == 1)
    check("closed again, it is back on top, once, with the later time", (r["n"], r["top"], (r["row"] or {}).get("at", 0) > row.get("at", 0)), (1, True, True))
finally:
    for sid in list(made):
        print("closing what is left of", sid[:6], do("space.close", id=sid, confirmed=True), flush=True)
    time.sleep(2.0)
    left = sweep()
    check("the pass's rows are off the list again (the mod's own forget)", left, 0)
    try:
        os.rmdir(CWD)
    except OSError:
        pass
    end = app("status")
    check("the app has no error, and the list is closed", (end.get("errors"), "glyph" in (end.get("overlays") or [])), ([], False))
    print("the window is back where it was:", status() == orig, flush=True)
    print(f"{sum(results)} passed, {len(results) - sum(results)} failed", flush=True)
raise SystemExit(0 if all(results) else 1)
