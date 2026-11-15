#!/bin/sh
# direct-pass.sh A B [--ask] | --survey: the direct way between two real machines, by the
# mod's own copy.js (staged by copy-pass.sh). direct-pass.mjs says what it does.
# Needs the Bash sandbox off (hc).
PASS=direct-pass exec sh "$(dirname "$0")/copy-pass.sh" "$@"
