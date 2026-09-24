# code — the pack for code

Domain: every governed file that no other pack claims — not `*.css`, `*.html`, `UIUX.md`, `PRD.md`, not `*.md`, not a ledger

`docket` in this file is the core, run as the protocol says. A pack is a list of measurable features. The judge scores each against the diff
and the repository, on governed files only, and records PASS or FAIL with a
location. Each feature says how it is scored: a command whose exit code decides,
or a reading with the exact thing to look for.

## Features

**F1 — the repository's fast checks pass.**
How scored: run the commands the repository's agent-instructions file names for
checking work (whatever the host calls that file); failing that, the commands the
README's test section names; failing that, where the witness is vendored,
`node test/docket.js`. Exit code decides. If none of the three exists, F1 is not
scored, and the verdict says so.

**F2 — `docket check` passes.**
How scored: `docket check`; exit code decides. Its failures are located already;
copy them.

**F3 — no ruling cited in the touched regions is contradicted by the diff.**
How scored: a reading. For every ruling cited within twenty lines of a hunk (the
window the pre-edit hook shows), `docket governs <id>`; read the diff against
each clause of the ruling and against each in-edge's clause — a later ruling may
have superseded or waived the clause the diff breaks. A contradiction whose
stated reason still holds is a failure; one whose reason no longer holds is a
stale contradiction, with the addendum route.

**F4 — no test skipped, disabled or deleted.**
How scored: read the diff for `skip`, `xit`, `only`, `.skip(`, `.only(`, a
removed assertion (`ok(`, `assert`, `expect`, `test(`, `it(` on a removed line
with no added line carrying the same check), a test file removed, a test command
removed from the check commands F1 uses.

**F5 — no cite removed from code without an addendum or ruling explaining it.**
How scored: every removed line of the diff that carried a ruling id (a cite the
ledger's grammar reads) against the ledger's newest entries and addenda; a
removed cite that no entry or addendum accounts for is a failure.

**F6 — every claim of a passing check in the transcript has a matching command
run in the transcript.**
How scored: from the maker's transcript (the last step of the protocol, never
before the others): each "tests pass", "check is green", "I ran …" against the
commands the transcript shows were run and their output. A claim without a run
is a failure; a run whose output contradicts the claim is a failure.

## Located failure

    code · F3 · app.js:1112 · R6 keeps the toolbar; this diff removes it · change the code, or supersede R6 through /rule

never

    the toolbar change looks wrong, try again
