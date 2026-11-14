#!/bin/sh
# all.sh: `herdr-app check` on every part, in each state the env hooks of check.sh can
# pretend. One line each: the tag and how the check ended. Trees land in .local/harness/out/TAG.txt.
# First argument of one(): the hooks for that run ("-" for none). They go through `env`:
# written before a shell function's name, a variable may not reach the commands inside it.
S=$(cd "$(dirname "$0")/.." && pwd)
one() {
  e=$1; shift
  [ "$e" = "-" ] && e="GLYPH_PLAIN=1"
  printf '%-18s ' "$4"
  env $e sh "$S/harness/check.sh" "$@" 2>&1 | tail -1 | cut -c1-400
}
one - rail p3 256 rail sp2
one - rail p3 160 rail-compact sp2
one "FOLD=alpha,local" rail p3 256 rail-fold sp2
one "FOLD=alpha" rail p3 160 rail-fold-compact alpha/sp4
one - bar p3 256 bar sp2
one "ARMED=tb3" bar p3 256 bar-armed sp2
one - bar p9 256 bar-crowd alpha/sp4
one "ARMED=alpha/tb9" bar p9 256 bar-crowd-armed alpha/sp4
one - pane p3 256 pane sp2
one "HOVER=1" pane p3 256 pane-hover sp2
one "HOVER=1 SURE=1" pane p3 256 pane-sure sp2
one - menu alpha/tb8 256 menu alpha/sp4
one "SURE=1" menu alpha/tb8 256 menu-sure alpha/sp4
one - menu tb4 256 menu-shell sp2
one - blank p-page 256 blank sp9
one - bar p-page 256 bar-blank sp9
one - rail p-page 256 rail-blank sp9
one - pane p-page 256 pane-blank sp9
one - goto p3 256 goto sp2
one "FIND=codex" goto p3 256 goto-find sp2
one "SURE=1" goto p3 256 goto-sure alpha/sp4
one "FIND=zzz" goto p3 256 goto-none sp2
one - transfer p3 256 transfer-reading sp2
one "LISTED=1" transfer p3 256 transfer sp2
one "LISTED=1 COPIES=1 PICK=0:stock-2026-11.parquet,suppliers.csv,README.md,fixtures" transfer p3 256 transfer-picked sp2
one "LISTED=1 COPIES=1 SURE=1 PICK=0:stock-2026-11.parquet,suppliers.csv,README.md,fixtures" transfer p3 256 transfer-sure sp2
one "COPIES=1" bar p3 256 bar-copies sp2
