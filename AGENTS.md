# Agent instructions

Read these before changing anything:

- @README.md
- @CONTRIBUTING.md
- @docs/herdr-platform.md

A look's tools can have rules of their own. They hold whichever look you are working on:

- @dev/glyph/AGENTS.md

Before changing a look, read its own docs too: `<look>/RECIPE.md`, `dev/<look>/CONTRIBUTING.md` and `dev/<look>/VERIFIED.md`.

## Rules

- Don't commit or push unless asked. The user reviews repo changes first.
- Herdr's manuals: `hc --skill` (terminals, agents, other machines) and `herdr-app --skill` (the window; it points to `~/.config/herdr-app/AGENTS.md` and the `.d.ts` files beside it). The flag is singular; `--skills` is a usage error.
- Run `hc` core commands (`ls`, `schema`, …), `herdr-app status|ls|shot|do|check` and headless Chromium with the Bash sandbox off from the start. Inside it, `hc` waits 15 s and fails with "core did not stop or start within 15 s", `check` hangs, and Chromium can't get its Mach port.
- Never raise, hide or activate the user's Herdr window. Activation lands later and covers their screen.
- Don't drive the user's pointer.
- File each new note in the doc that covers it (README.md lists them), and state each fact once.
- Don't use the middle dot (`·`) in text people read: a mod's tooltips and notices, the docs, commit messages and replies. Join short facts with commas, and write the rest as sentences.
- Notes about the user (habits, preferences, quotes, the state of their machine) stay out of the repo. Keep them in your own private memory if you have one.
- Sample data (the harness fleet, tests, mock transcripts) uses invented names. Never copy real machine, project or tab names into the repo.
