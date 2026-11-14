#!/bin/sh
# preview-states.sh: like preview.sh, for the states a still fleet doesn't show: a folded
# machine, a tab and a pane waiting for their second close press, the tab menu asking
# again, and a project's empty page. Pictures land in .local/preview/.
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
python3 tools/spec2html.py $P/fold-compact.html --rail $O/rail-fold-compact.txt --bar $O/bar-crowd-armed.txt --pane $O/pane.txt --rail-width 160
python3 tools/spec2html.py $P/page.html --rail $O/rail-blank.txt --bar $O/bar-blank.txt --pane $O/pane-blank.txt --body $O/blank.txt --rail-width 256
python3 tools/spec2html.py $P/menu.html --only body --body $O/menu.txt --w 200 --h 116
python3 tools/spec2html.py $P/menu-sure.html --only body --body $O/menu-sure.txt --w 200 --h 116
shot() {
  "$HS" --hide-scrollbars --force-device-scale-factor=2 --window-size=$2 --user-data-dir="${TMPDIR:-/tmp}/glyph-hs-prof" \
    --screenshot="$S/$P/$1.png" "file://$S/$P/$1.html" 2>&1 | grep -c "written to file"
}
for n in states fold fold-compact page; do shot $n 1710,1073; done
for n in menu menu-sure; do shot $n 200,116; done
python3 ../../tools/crop.py $P/states.png $P/states-bar.png 512 0 1900 170 1
python3 ../../tools/crop.py $P/fold.png $P/fold-rail.png 0 0 540 1100 2
python3 ../../tools/crop.py $P/fold.png $P/fold-bar.png 512 0 1900 170 1
python3 ../../tools/crop.py $P/fold.png $P/fold-pane.png 2200 80 1220 120 1
