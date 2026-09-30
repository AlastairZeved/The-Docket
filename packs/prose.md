# prose — the pack for governed prose

Domain: `*.md` except a ledger (`DECISIONS*.md`) — governed prose only

`docket` in this file is the core, run as the protocol says. A pack is a list of measurable features. The judge scores each against the diff
and the repository, on governed files only, and records PASS or FAIL with a
location. Each feature says how it is scored.

## Precondition — the reader gate

The pack scores nothing until the document's target reader, purpose and source
are stated: in the project's `PRD.md`, in the section that names the reader,
or in the document's own header. A reader is valid only with a role, at least one explicit "knows" and
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
it click; a marker asserts instead. How scored: each marker from the list, or
one like it ("clearly", "of course"), with its sentence.

### Chain
**F3** — asserted connections (told, not shown), target 0. How scored: each
"because", "so" or "which means" whose link the text states and does not show,
with the two claims it joins.
**F4** — transitions requiring unstated knowledge, target 0. How scored: each
transition whose sense needs a fact the stated reader lacks and the text has not
given, with the fact.
**F4a** — the chain is walkable start to conclusion without external knowledge:
yes or no. How scored: a read in order; no is located at the first step that
needs knowledge from outside the document.
**F4b** — no three or more consecutive sentences with identical syntax. How
scored: each run of three or more built the same way — the same opening, the
same order of parts — located at its first sentence.

### Compression
**F5** — dead-weight words, target 0. How scored: each word that can go with
the meaning and the feeling unchanged, with its sentence.
**F6** — sentences where removing any word changes meaning or feeling, target
100%. How scored: each sentence the edit touches that falls short, with the word
that can go.
**F7** — rhythm variation present: yes or no. How scored: no is located at the
first three consecutive sentences of one length and one shape.
**F8** — emotional-weight markers (recognition, reflective beats, turns) before
and after the edit, no net loss. A grounding inserted for F1–F2 is weight-bearing
and may not be compressed away unless a shorter one carries the same grounding.
How scored: the markers counted, each located, before the edit and after it;
fewer after is a failure, located at the one removed.

### Weld
**F9** — tone consistency across before, edit and after. How scored: each
sentence of the edit whose tone breaks from the sentences around it — formal
beside plain, warm beside flat — with the neighbour it breaks from.
**F10** — concept continuity. How scored: each concept the edit names
differently from the text before or after it, with both names.
**F11** — register stability. How scored: each change of register the edit
brings — technical to plain, second person to third — located where it happens.
**F12** — direction coherence. How scored: each sentence of the edit that turns
the passage back to a point it closed, or ahead to one it has not made, with the
point.
**F12a** — seam detectability on a clean read. Judge-only: the maker flags
suspected seams; the judge confirms or rejects each, and reads for unflagged
ones. How scored: each flagged seam, confirmed or rejected at its line, and each
unflagged one found, located.

### Whole
**F13** — seam count, target 0. How scored: each place where a clean read of
the whole shows a join, located.
**F14** — gap count, target 0. How scored: each step the argument needs that
no sentence gives, located where it is needed, with the step.
**F15** — rhythm flatlines (three or more consecutive paragraphs of similar
density), target 0. How scored: each such run — paragraphs of like length and
sentence count — located at its first.
**F16** — the reasoning arc is traceable from the first section to the thesis.
How scored: the thesis located, and each section's step toward it; the first
section whose step does not follow is the failure.
**F17** — audience consistency. How scored: each passage written for a reader
other than the stated one — assuming what they do not know, or explaining what
they do — located.
**F18** — termination: a reader without the author's expertise can follow the
reasoning chain, in the order presented, using language and structure they
already have, without silently disengaging. How scored: a read in order as the
stated reader; yes, or no with the first place it fails.
**F19** — dispatches to other groups on this pass, reported; 0 is clean. How
scored: each dispatch, with the group it went to.

Every reading is made against the reader as stated, with the location of each
finding. Counts are counts; a target of 0 fails at 1.

## Located failure

    prose · F2 · docs/GUIDE.md:41 · "so the window is twenty lines" follows nothing that says why a window has a size · add the step, or cite the ruling that set it
