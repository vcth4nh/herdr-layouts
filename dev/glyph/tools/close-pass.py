#!/usr/bin/env python3
"""close-pass.py: the installed glyph's closing, start keys and empty page against the real app.

It takes over the Herdr window for about a minute and a half: it opens a throwaway project
of plain shells (sitting in an empty temporary folder), sends the commands the keys send
(`herdr-app do glyph.close` is what the close key does), and reads back what Herdr shows.
Don't type in Herdr while it runs.

What keeps it off real work: every glyph command is sent only while a throwaway project is
the one on show (else the pass stops), every explicit close names an id the pass made, and at
the end the window is put back on what it was showing before its projects are closed. A
project that closes while on show always has another throwaway project after it in the list,
so the "first tab of the next project" rule never lands on a real one.

Run it with the Bash sandbox off, after tools/sync.sh. Frames land in .local/shots/
(close-armed.png, close-page.png); they are only new while the window is on screen.
"""
import json, os, subprocess, tempfile, time

S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOME = os.path.expanduser("~")
SHOTS = os.path.join(S, ".local", "shots")
os.makedirs(SHOTS, exist_ok=True)
# Outside any repo, so Herdr names the project after this folder, not after a repo.
CWD = os.path.realpath(tempfile.mkdtemp(prefix="glyph-close-pass-"))
made, results = [], []


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


def hc(*args):
    return subprocess.run(["hc", *args], capture_output=True, text=True, timeout=20).stdout


def status():
    s = app("status")
    return {k: s.get(k) for k in ("space", "tab", "focused_pane")}


def space(sid):
    for s in app("ls").get("spaces", []):
        if s["id"] == sid:
            return s
    return None


def check(what, got, want):
    ok = got == want
    results.append(ok)
    print(("PASS  " if ok else "FAIL  ") + what + ("" if ok else f"\n      got  {got}\n      want {want}"), flush=True)


def press(sid, command, wait=0.6):
    """A glyph key, only while the throwaway project is the one on show."""
    if status()["space"] != sid:
        raise SystemExit(f"the window is not on the throwaway project any more: not sending {command}")
    return do(command, wait=wait)


orig = status()
print("the window was on", orig, flush=True)


def back():
    do("space.select", id=orig["space"])
    do("tab.select", id=orig["tab"])
    if orig["focused_pane"]:
        do("pane.focus", pane=orig["focused_pane"])


try:
    n = {}  # a name for each tab the pass made -> what `do` said of it

    def project(name):
        """A new throwaway project with one plain shell. Herdr puts it after this computer's others."""
        n[name] = do("space.new", folder=HOME, machine="")
        made.append(n[name]["space"])
        hc("send", n[name]["terminal"], f"cd {CWD}")
        time.sleep(0.3)
        return n[name]["space"]

    def shell_tab(sid, name):
        """A new plain shell, sitting in the empty folder. Herdr opens it right after the shown tab."""
        n[name] = do("tab.new", space=sid)
        hc("send", n[name]["terminal"], f"cd {CWD}")
        time.sleep(0.3)

    def tabs(sid):
        """The project's tabs in order, by the names above ("page": a tab with no terminal)."""
        s = space(sid)
        if s is None:
            return None
        by = {v["tab"]: k for k, v in n.items()}
        return [by.get(t["id"], "page" if not t["terminals"] else "?") for t in s["tabs"]]

    def shown():
        by = {v["tab"]: k for k, v in n.items()}
        return by.get(status()["tab"], "page-or-other")

    # Three projects in a row: R closes early, A is the one worked in, Z stays to the end as
    # the project after them, left on its second tab.
    R = project("r1"); A = project("a1"); Z = project("z1")
    shell_tab(Z, "z2")
    do("space.select", id=A)
    shell_tab(A, "a2"); shell_tab(A, "a3")
    time.sleep(0.5)
    name = space(A)["name"]
    check("(three throwaway projects in a row, A on show)", ([s["id"] for s in app("ls")["spaces"] if s["id"] in (R, A, Z)], tabs(A), shown()), ([R, A, Z], ["a1", "a2", "a3"], "a3"))

    # 1. A plain shell closes at the first press. The last tab hands over to the one before it.
    press(A, "glyph.close")
    check("shell, last of 3: one press closes it, the tab before it is shown", (tabs(A), shown()), (["a1", "a2"], "a2"))

    # 2. The project on show closes (Herdr's own close): the next one shows its FIRST tab,
    # not the tab it was left on (a2).
    do("space.select", id=R)
    do("space.close", id=R, confirmed=True, wait=1.0)
    check("the shown project closes: the next project shows its first tab", (space(R), status()["space"], shown()), (None, A, "a1"))

    # 3. A tab in the middle hands over to the one after it; so does the first.
    shell_tab(A, "a4")
    check("(a new tab opens right after the shown one)", (tabs(A), shown()), (["a1", "a4", "a2"], "a4"))
    press(A, "glyph.close")
    check("shell, middle of 3: the tab AFTER it is shown", (tabs(A), shown()), (["a1", "a2"], "a2"))
    do("tab.select", id=n["a1"]["tab"])
    press(A, "glyph.close")
    check("shell, first of 2: the tab after it is shown", (tabs(A), shown()), (["a2"], "a2"))

    # 4. A running program takes two presses, in time.
    shell_tab(A, "a5")
    do("tab.select", id=n["a2"]["tab"])
    n["c1"] = do("tab.new", space=A, argv=["cat"], wait=3.0)
    check("(a running program between two shells)", (tabs(A), shown()), (["a2", "c1", "a5"], "c1"))
    press(A, "glyph.close")
    app("shot", os.path.join(SHOTS, "close-armed.png"))
    check("running program: the first press closes nothing", tabs(A), ["a2", "c1", "a5"])
    press(A, "glyph.close")
    check("running program: the second press closes it, the tab AFTER it is shown", (tabs(A), shown()), (["a2", "a5"], "a5"))
    n["c2"] = do("tab.new", space=A, argv=["cat"], wait=3.0)
    press(A, "glyph.close")
    time.sleep(3.4)
    press(A, "glyph.close")
    check("running program: a second press after 3 s is a first one again", tabs(A), ["a2", "a5", "c2"])
    time.sleep(3.4)
    press(A, "glyph.close-pane")
    check("close-pane on a tab's only pane: the first press closes nothing", tabs(A), ["a2", "a5", "c2"])
    press(A, "glyph.close-pane")
    check("close-pane again: the tab goes", (tabs(A), shown()), (["a2", "a5"], "a5"))

    # 5. The last tab: the project stays on show, as an empty page that remembers it.
    do("tab.close", id=n["a2"]["tab"], confirmed=True)
    check("(one tab left, shown)", (tabs(A), shown()), (["a5"], "a5"))
    press(A, "glyph.close", wait=1.5)
    check("last tab: the project is still there and on show, holding only its page", (status()["space"], tabs(A)), (A, ["page"]))
    kept = json.load(open(os.path.join(HOME, ".config/herdr-app/shared.json"))).get("glyph.blank", {}).get(A) or {}
    check("its name and folder are remembered", (kept.get("name"), os.path.realpath(kept.get("folder") or "/")), (name, CWD))
    print(f"      it went by {name!r}; with no terminal left Herdr itself calls it {space(A)['name']!r}", flush=True)
    time.sleep(0.6)
    app("shot", os.path.join(SHOTS, "close-page.png"))

    # 6. A new tab from the page starts where the last one was, and the page goes.
    press(A, "glyph.new", wait=1.5)
    s = space(A)
    check("new tab on the page: one tab with a terminal, the page is gone", None if s is None else [len(t["terminals"]) for t in s["tabs"]], [1])
    where = json.loads(hc("get", s["tabs"][0]["terminals"][0]["terminal"], "--json")).get("cwd") if s and s["tabs"][0]["terminals"] else None
    check("it started in the folder the last tab was in, not the project's own", os.path.realpath(where or "/"), CWD)

    # 7. The close key on the page closes the project, and the next project (Z, left on z2)
    # shows its first tab.
    press(A, "glyph.close", wait=1.5)
    check("(the page again)", tabs(A), ["page"])
    press(A, "glyph.close", wait=1.2)
    check("close on the page: the project goes, the next one shows its first tab", (space(A), status()["space"], shown()), (None, Z, "z1"))

    # 8. Looking at another project closes one that shows only its page.
    B = project("b1")
    press(B, "glyph.close", wait=1.5)
    check("(another project, on its page)", tabs(B), ["page"])
    do("space.select", id=Z, wait=1.2)
    check("looking at another project: the empty one is closed, the window stays put", (space(B), status()["space"], shown()), (None, Z, "z1"))
finally:
    # Back to the real project first: a throwaway project closed while on show would hand
    # over to whatever comes after it.
    back()
    for sid in made:
        if space(sid) is not None:
            print("closing what is left of", sid[:6], do("space.close", id=sid, confirmed=True), flush=True)
    back()
    try:
        os.rmdir(CWD)
    except OSError:
        pass
    print("the window is back where it was:", status() == orig, flush=True)
    print(f"{sum(results)} passed, {len(results) - sum(results)} failed", flush=True)
raise SystemExit(0 if all(results) else 1)
