# prose — the pack for governed prose

Domain: `*.md` except a ledger (`DECISIONS*.md`) — governed prose only

A pack is a list of measurable features. The judge scores each against the diff
and the repository, on governed files only, and records PASS or FAIL with a
location. Each feature says how it is scored.

## Precondition — the reader gate

The pack scores nothing until the document's target reader, purpose and source
are stated: in the project's `PRD.md` reader section, or in the document's own
header. A reader is valid only with a role, at least one explicit "knows" and
one explicit "doesn't know"; "general audience", "non-technical", "someone
curious" fail. A purpose is valid only as a specific verb on a specific object;
"make it clear", "help them understand" fail. A missing or invalid precondition
is one located failure, and scoring stops there. Reason: a vague reader silently
corrupts every feature below.

## Scale rule

The unit of the change decides which groups are primary. No group overrides
another's authority; none defines its own audience.

| Unit changed | Active | Primary | Skipped |
|---|---|---|---|
| a sentence | F1–F2a, F5–F8, F9–F12 | F5–F8 and F9–F12 | F3–F4, unless the sentence carries several claims |
| a paragraph | all | F3–F4 | none |
| a section | all | none singled out | none |
| the document | all | F13–F19, exclusive on termination | none |

## Features

### Grounding
**F1** — domain terms without grounding, target 0. How scored: each term the
reader (as stated) does not know, with the sentence that grounds it or the
finding that none does.
**F2** — logical leaps without intermediate steps, target 0. How scored: each
"so" or "therefore" or unmarked jump, with the step it skips.
**F2a** — self-evidence markers ("obviously", "simply", "just"), target 0. A
grounding must say how the jump felt, what was confusing, or what context made
it click; a marker asserts instead.

### Chain
**F3** — asserted connections (told, not shown), target 0.
**F4** — transitions requiring unstated knowledge, target 0.
**F4a** — the chain is walkable start to conclusion without external knowledge:
yes or no.
**F4b** — no three or more consecutive sentences with identical syntax.

### Compression
**F5** — dead-weight words, target 0.
**F6** — sentences where removing any word changes meaning or feeling, target
100%.
**F7** — rhythm variation present: yes or no.
**F8** — emotional-weight markers (recognition, reflective beats, turns) before
and after the edit, no net loss. A grounding inserted for F1–F2 is weight-bearing
and may not be compressed away unless a shorter one carries the same grounding.

### Weld
**F9** — tone consistency across before, edit and after.
**F10** — concept continuity.
**F11** — register stability.
**F12** — direction coherence.
**F12a** — seam detectability on a clean read. Judge-only: the maker flags
suspected seams; the judge confirms or rejects each, and reads for unflagged
ones.

### Whole
**F13** — seam count, target 0.
**F14** — gap count, target 0.
**F15** — rhythm flatlines (three or more consecutive paragraphs of similar
density), target 0.
**F16** — the reasoning arc is traceable from the first section to the thesis.
**F17** — audience consistency.
**F18** — termination: a reader without the author's expertise can follow the
reasoning chain, in the order presented, using language and structure they
already have, without silently disengaging. Yes or no, with the first place it
fails.
**F19** — dispatches to other groups on this pass, reported; 0 is clean.

How each is scored: a reading, against the reader as stated, with the location
of each finding. Counts are counts; a target of 0 fails at 1.

## Located failure

    prose · F2 · docs/GUIDE.md:41 · "so the window is twenty lines" follows nothing that says why a window has a size · add the step, or cite the ruling that set it
