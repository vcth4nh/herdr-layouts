# Agent instructions

Read these before changing anything:

- @README.md
- @CONTRIBUTING.md
- @docs/herdr-platform.md
- @docs/glyph-verified.md
- @glyph/RECIPE.md

## Rules

- Don't commit or push unless asked. The user reviews repo changes first.
- Herdr's manuals: `hc --skill` (terminals, agents, other machines) and `herdr-app --skill` (the window; it points to `~/.config/herdr-app/AGENTS.md` and the `.d.ts` files beside it). The flag is singular; `--skills` is a usage error.
- Run `hc` core commands (`ls`, `schema`, …), `herdr-app status|ls|shot|do|check` and headless Chromium with the Bash sandbox off from the start. Inside it, `hc` waits 15 s and fails with "core did not stop or start within 15 s", `check` hangs, and Chromium can't get its Mach port.
- Never raise, hide or activate the user's Herdr window. Activation lands later and covers their screen.
- Don't drive the user's pointer.
- Ask before running `dev/glyph/tools/close-pass.py`. It switches the Herdr window to a throwaway project for over a minute, and keys typed in Herdr meanwhile land in its shells.
- `dev/glyph/tools/copy-pass.sh`, `direct-pass.sh` and `transfer-pass.sh` copy throwaway files to the machines named to them, in a folder of their own under `/tmp` that they remove. Name only machines the user has said may be used, or ask. `transfer-pass.sh` also puts the transfer window over the Herdr window for twenty to thirty seconds. `transfer-pass.sh pick` names no machine: it copies between two folders of its own under `.local/`.
- `direct-pass.sh` and `transfer-pass.sh direct` have one machine try to log in to another, with nothing to log in with. Those machines' ssh servers record the attempts, and `direct-pass.sh --survey` does it between every two machines. Never type, ask for or look up a machine's password: `direct-pass.sh --ask` is for the user to run in a terminal of their own.
- File each new note in the doc that covers it (README.md lists them), and state each fact once.
- Don't use the middle dot (`·`) in text people read: the mod's tooltips and notices, the docs, commit messages and replies. Join short facts with commas, and write the rest as sentences.
- Notes about the user (habits, preferences, quotes, the state of their machine) stay out of the repo. Keep them in your own private memory if you have one.
- Sample data (the harness fleet, tests, mock transcripts) uses invented names. Never copy real machine, project or tab names into the repo.
