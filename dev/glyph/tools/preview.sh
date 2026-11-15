#!/bin/sh
# preview.sh [publish]: check every part of the look's mod against the sample flock, then draw
# the printed element trees as a web page and photograph it. Pictures land in .local/preview/.
# With `publish`, the shared picture becomes the look's preview.png: the whole window while
# copies are under way, with the transfer window in the room the terminal leaves. The sample
# flock has invented names, which a frame of a real window would not.
S=$(cd "$(dirname "$0")/.." && pwd)
L=$(cd "$S/../../glyph" && pwd)
# Playwright's headless Chromium: the last build in its cache, or the binary CHROME_HEADLESS_SHELL names.
HS=${CHROME_HEADLESS_SHELL:-$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell 2>/dev/null | tail -1)}
[ -x "$HS" ] || { echo "no headless Chromium found: set CHROME_HEADLESS_SHELL"; exit 1; }
cd "$S" || exit 1
mkdir -p .local/preview
sh harness/check.sh rail p3 256 rail | tail -2 | cut -c1-160
sh harness/check.sh rail p3 160 rail-compact | tail -2 | cut -c1-160
sh harness/check.sh bar p3 256 bar | tail -2 | cut -c1-160
sh harness/check.sh pane p3 256 pane | tail -2 | cut -c1-160
sh harness/check.sh rail p9 256 rail-crowd alpha/sp4 | tail -2 | cut -c1-160
sh harness/check.sh bar p9 256 bar-crowd alpha/sp4 | tail -2 | cut -c1-160
sh harness/check.sh pane p9 256 pane-crowd alpha/sp4 | tail -2 | cut -c1-160
COPIES=1 sh harness/check.sh bar p3 256 bar-copies | tail -2 | cut -c1-160
LISTED=1 COPIES=1 PICK=0:stock-2026-11.parquet,suppliers.csv,README.md,fixtures sh harness/check.sh transfer p3 256 transfer-picked | tail -2 | cut -c1-160
python3 tools/spec2html.py .local/preview/full.html --rail .local/harness/out/rail.txt --bar .local/harness/out/bar.txt --pane .local/harness/out/pane.txt --rail-width 256
python3 tools/spec2html.py .local/preview/compact.html --rail .local/harness/out/rail-compact.txt --bar .local/harness/out/bar.txt --pane .local/harness/out/pane.txt --rail-width 160
python3 tools/spec2html.py .local/preview/crowd.html --rail .local/harness/out/rail-crowd.txt --bar .local/harness/out/bar-crowd.txt --pane .local/harness/out/pane-crowd.txt --rail-width 256
# The transfer window is 880 by 560. The box puts it under the terminal's last line, centered in the pane.
python3 tools/spec2html.py .local/preview/share.html --rail .local/harness/out/rail.txt --bar .local/harness/out/bar-copies.txt --pane .local/harness/out/pane.txt --rail-width 256 \
  --over .local/harness/out/transfer-picked.txt --over-box 543,445,880,560
for n in full compact crowd share; do
  "$HS" --hide-scrollbars --force-device-scale-factor=2 --window-size=1710,1073 --user-data-dir="${TMPDIR:-/tmp}/glyph-hs-prof" \
    --screenshot="$S/.local/preview/$n.png" "file://$S/.local/preview/$n.html" 2>&1 | grep -c "written to file"
done
python3 ../../tools/crop.py .local/preview/full.png .local/preview/rail-a.png 0 0 540 760 2
python3 ../../tools/crop.py .local/preview/full.png .local/preview/rail-b.png 0 760 540 760 2
python3 ../../tools/crop.py .local/preview/full.png .local/preview/rail-c.png 0 1520 540 626 2
python3 ../../tools/crop.py .local/preview/full.png .local/preview/bar-a.png 512 0 1900 170 1
python3 ../../tools/crop.py .local/preview/crowd.png .local/preview/crowd-rail.png 0 380 540 760 2
python3 ../../tools/crop.py .local/preview/crowd.png .local/preview/crowd-bar-l.png 512 0 1460 100 1
python3 ../../tools/crop.py .local/preview/crowd.png .local/preview/crowd-bar-r.png 1960 0 1460 100 1
python3 ../../tools/crop.py .local/preview/compact.png .local/preview/compact-a.png 0 0 340 700 2
[ "$1" = "publish" ] && cp .local/preview/share.png "$L/preview.png" && echo "published $L/preview.png"
