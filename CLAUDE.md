# CLAUDE.md

**Reader.** An agent working in this repository, which knows git, Node and Markdown, and does not know this
repository's rulings or the checks it runs before a stop. **Purpose.** Work on the docket under the docket: load it
from the working tree, cite what a line relies on, record a decision as a ruling, and run the witness before you stop.
**Source.** D6 in `docs/DECISIONS.md`.

This repository governs itself (D6). `docs/DECISIONS.md` is its ledger, prefix `D`; `bin/docket.js` cites the rulings
it implements, and the plugin it builds runs on this tree as it would on any other.

Work here with the plugin loaded from the working tree:

    claude --plugin-dir .

It is the only way to work here. The docket prints at the session's start, the hook prints what governs a region
before each edit, and the judge reads every stop that touched a governed file. Add no `.claude/settings.json`: it
would bind the hooks a second time, and `near` would print twice per edit (D6). No allow rule is needed: the judge is
given its one permission by the hook that starts it (D37).

Before you stop, run both of these and read what they print; CI runs the same two:

    node test/docket.js     # the witness of the core, several minutes; exit 1 names each failure
    node bin/docket.js      # the docket's check of this repository's ledger and cites

The witness builds its scratch projects in the temporary directory, which must lie outside any repository and
beneath no ledger; it refuses otherwise, and names `TMPDIR` (D6).

A decision is a ruling, written through `/rule`, which ends at a confirm block only the person answers (D8). Do not
run `append` on your own: the judge fails an entry or addendum written without the person's `confirm` (D32). Never
edit an entry; the ledger appends and never amends, and `docket check` fails a changed one (D4). A change to a number a
ruling sets needs a ruling that supersedes it, with the measurement that forced it (D14). Cite the ruling a line relies
on in a comment beside it; `docket check` fails a cite that names no ruling. Name no host, model or vendor in the core
(D13).

A change to `judge/PROTOCOL.md` or to a pack changes what the judge measures: `sh test/judge.sh` runs again, and the
witness fails until its dated record is in the ledger (D15, D47).

The grammar is `docs/FORMAT.md`; the judge's protocol, `judge/PROTOCOL.md`; the packs, `packs/*.md`, and how to write
one, `docs/PACKS.md`; a second host's binding, `docs/PROTOCOL-BINDING.md`.
