# PACKS.md — how to write a pack

**Reader.** Someone adding a domain for the judge to score — a new kind of file, or a new way the existing kinds go
wrong — who can read the four packs this repository ships and has not written one. **Purpose.** Write a pack the judge
can score and the core can hold the judge's verdict to, with no judgement the pack does not give. **Source.** D12 in
`docs/DECISIONS.md`; the located failure, `judge/PROTOCOL.md` step 4.

A pack is a markdown file in `packs/`, named by its domain: `packs/<name>.md`, the name lowercase letters, digits and
hyphens, opening with a letter. `docket pack <name>` prints it, `docket pack --list` lists it with its domain — a file
named otherwise is not listed, and the list says it skipped it — and the judge reads the packs whose domains the diff
touches, because the protocol's step 2 tells it to. A pack is a list of
measurable features: if a feature needs a sentence to be scored, the sentence is in the pack.

## What the core reads in a pack

Three things; a verdict that does not match them is refused before it is written.

1. **`Domain:`**, the first line that opens with it: the files the pack scores, as globs or names, and what it leaves
   to another pack. `pack --list` prints the rest of that line, and nothing when the rest is empty. A pack scores only the governed files in the diff — a
   governed file being one that cites a ruling — and where two packs' domains cover a file, both score it.
2. **Feature ids.** A feature opens a line with its id in bold — `**F1 — <the statement>.**`, as in `code.md`, or
   `**F1** — <the statement>`, as in `prose.md`. The id is `F` and a number, with a letter after it for a feature split
   from another (`F2a`). A located failure that names a pack with no file in `packs/`, or a feature its pack does not
   define (`code · F99`), is refused, and the refusal lists the packs, or the pack's features.
3. **Nothing else.** Headings, tables, a precondition, a scale rule: the judge reads them, and the core does not. Put
   there what scoring needs and no more.

## A feature

Each feature says **How scored:** — a command whose exit code decides, or a reading with the exact thing to look for
and where a failure is located. A feature is not a value, a taste or a principle: "the code is clean" names nothing a
reading can locate. If a feature can go unscored — the command it needs may not exist, or the judge may not run it —
the feature says so, and says that the judge's report names it, as `code.md`'s F1 does. A feature names no host, model
or vendor (D13); in a pack, `docket` is the core, run as the protocol says. It does not restate a ruling: the rulings
are the ledger's, and `code.md`'s F3 already reads the diff against them.

## The located failure

End the pack with `## Located failure`: one example of a failing feature as the judge records it. The form, its fields
joined by ` · `:

    <pack> · F<n> · <file:line> · <what> · <fix route>

The location is a line of a file in the repository, before or after the diff. A code-pack line whose `<what>` names a
ruling says next, in a field of its own, whether the ruling's reason still holds, with its evidence —
`reason holds: <the premise> (<file:line>)`, `reason gone: <what changed> (<file:line>)`, or `cite stale` — and
`docket verdict` refuses the line without it (D23, D27).

## When a pack changes

A change to a pack is a change to what the judge measures, so the calibration runs again before the judge's next
verdict counts (D15): `sh test/judge.sh`, its result appended to the ledger as a dated record that names, by SHA-256,
the protocol and the packs it measured (D47). The witness reads those hashes from the record, so a pack changed after
the last record fails `node test/docket.js` until a new one is appended.
