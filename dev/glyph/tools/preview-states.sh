#!/bin/sh
# preview-states.sh: like preview.sh, for the states a still fleet doesn't show: a folded
# machine, folded projects, a project, a machine and a tab dragged in the rail, a machine that does not answer, a tab and a pane waiting for their second close press, the tab menu asking
# again, a project's empty page, the list of closed projects, the lists the bell and the tick open, and the transfer window (read, with rows picked, its arrow
# pressed once, picked rows carried over the other side, and between two other machines of
# which one can log in to the other: as it opens, with rows picked, and with a password
# typed) with the bar while copies are under way. Pictures land in .local/preview/.
S=$(cd "$(dirname "$0")/.." && pwd)
# Playwright's headless Chromium: the last build in its cache, or the binary CHROME_HEADLESS_SHELL names.
HS=${CHROME_HEADLESS_SHELL:-$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell 2>/dev/null | tail -1)}
[ -x "$HS" ] || { echo "no headless Chromium found: set CHROME_HEADLESS_SHELL"; exit 1; }
cd "$S" || exit 1
mkdir -p .local/preview
sh harness/all.sh
O=.local/harness/out
P=.local/preview
python3 tools/spec2html.py $P/states.html --rail $O/rail.txt --bar $O/bar.txt --pane $O/pane-hover.txt --rail-width 256
python3 tools/spec2html.py $P/fold.html --rail $O/rail-fold.txt --bar $O/bar-armed.txt --pane $O/pane-sure.txt --rail-width 256
python3 tools/spec2html.py $P/lost.html --rail $O/rail-lost.txt --bar $O/bar.txt --pane $O/pane.txt --rail-width 256
python3 tools/spec2html.py $P/fold-compact.html --rail $O/rail-fold-compact.txt --bar $O/bar-crowd-armed.txt --pane $O/pane.txt --rail-width 160
python3 tools/spec2html.py $P/tuck.html --rail $O/rail-tuck.txt --bar $O/bar.txt --pane $O/pane.txt --rail-width 256
python3 tools/spec2html.py $P/tuck-compact.html --rail $O/rail-tuck-compact.txt --bar $O/bar.txt --pane $O/pane.txt --rail-width 160
python3 tools/spec2html.py $P/lift.html --rail $O/rail-lift.txt --bar $O/bar.txt --pane $O/pane.txt --rail-width 256
python3 tools/spec2html.py $P/lift-machine.html --rail $O/rail-lift-machine.txt --bar $O/bar.txt --pane $O/pane.txt --rail-width 256
python3 tools/spec2html.py $P/lift-compact.html --rail $O/rail-lift-compact.txt --bar $O/bar.txt --pane $O/pane.txt --rail-width 160
python3 tools/spec2html.py $P/lift-tab.html --rail $O/rail-lift-tab.txt --bar $O/bar.txt --pane $O/pane.txt --rail-width 256
python3 tools/spec2html.py $P/lift-tab-compact.html --rail $O/rail-lift-tab-compact.txt --bar $O/bar.txt --pane $O/pane.txt --rail-width 160
# The window as on Linux: the face glyph brings, and the window buttons the system does not draw there.
python3 tools/spec2html.py $P/linux.html --rail $O/rail-linux.txt --bar $O/bar-linux.txt --pane $O/pane.txt --rail-width 256
python3 tools/spec2html.py $P/page.html --rail $O/rail-blank.txt --bar $O/bar-blank.txt --pane $O/pane-blank.txt --body $O/blank.txt --rail-width 256
python3 tools/spec2html.py $P/menu.html --only body --body $O/menu.txt --w 200 --h 116
python3 tools/spec2html.py $P/menu-sure.html --only body --body $O/menu-sure.txt --w 200 --h 116
for n in transfer transfer-picked transfer-sure transfer-carry transfer-direct-idle transfer-direct transfer-direct-typed; do python3 tools/spec2html.py $P/$n.html --only body --body $O/$n.txt --w 880 --h 560; done
python3 tools/spec2html.py $P/copies.html --rail $O/rail.txt --bar $O/bar-copies.txt --pane $O/pane.txt --rail-width 256
shot() {
  "$HS" --hide-scrollbars --force-device-scale-factor=2 --window-size=$2 --user-data-dir="${TMPDIR:-/tmp}/glyph-hs-prof" \
    --screenshot="$S/$P/$1.png" "file://$S/$P/$1.html" 2>&1 | grep -c "written to file"
}
for n in states fold lost fold-compact tuck tuck-compact lift lift-machine lift-compact lift-tab lift-tab-compact page linux; do shot $n 1710,1073; done
for n in menu menu-sure; do shot $n 200,116; done
# The Go-to list: as it opens, with a word typed, and with a first close press on its picked tab.
for n in goto goto-find goto-sure; do python3 tools/spec2html.py $P/$n.html --only body --body $O/$n.txt --w 560 --h 572; shot $n 560,572; done
# The list of closed projects: as it opens, with a word typed, on Linux, and before any project was closed.
for n in history history-find history-linux; do python3 tools/spec2html.py $P/$n.html --only body --body $O/$n.txt --w 440 --h 234; shot $n 440,234; done
python3 tools/spec2html.py $P/history-empty.html --only body --body $O/history-empty.txt --w 440 --h 94; shot history-empty 440,94
# The lists the bell and the tick in the bar open: the tabs that need you, and those that finished.
python3 tools/spec2html.py $P/wants.html --only body --body $O/wants.txt --w 380 --h 100; shot wants 380,100
python3 tools/spec2html.py $P/wants-done.html --only body --body $O/wants-done.txt --w 380 --h 86; shot wants-done 380,86
for n in transfer transfer-picked transfer-sure transfer-carry transfer-direct-idle transfer-direct transfer-direct-typed; do shot $n 880,560; done
shot copies 1710,1073
python3 ../../tools/crop.py $P/copies.png $P/copies-bar.png 2400 0 1020 100 1
python3 ../../tools/crop.py $P/states.png $P/states-bar.png 512 0 1900 170 1
python3 ../../tools/crop.py $P/fold.png $P/fold-rail.png 0 0 540 1100 2
python3 ../../tools/crop.py $P/tuck.png $P/tuck-rail.png 0 0 540 1100 2
python3 ../../tools/crop.py $P/tuck-compact.png $P/tuck-compact-rail.png 0 0 340 1100 2
python3 ../../tools/crop.py $P/lift.png $P/lift-rail.png 0 0 540 1500 2
python3 ../../tools/crop.py $P/lift-machine.png $P/lift-machine-rail.png 0 0 540 1500 2
python3 ../../tools/crop.py $P/lift-compact.png $P/lift-compact-rail.png 0 0 340 900 2
python3 ../../tools/crop.py $P/lift-tab.png $P/lift-tab-rail.png 0 0 540 900 2
python3 ../../tools/crop.py $P/lift-tab-compact.png $P/lift-tab-compact-rail.png 0 0 340 1300 2
python3 ../../tools/crop.py $P/lost.png $P/lost-rail.png 0 760 540 760 2
python3 ../../tools/crop.py $P/fold.png $P/fold-bar.png 512 0 1900 170 1
python3 ../../tools/crop.py $P/fold.png $P/fold-pane.png 2200 80 1220 120 1
