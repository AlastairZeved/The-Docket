# design — the pack for what is rendered

Domain: `*.css`, `*.html`, `UIUX.md`, `PRD.md`

`docket` in this file is the core, run as the protocol says. A pack is a list of measurable features. The judge scores each against the diff
and the repository, on governed files only, and records PASS or FAIL with a
location. Each feature says how it is scored.

## Features

**F1 — every token value in a spec table appears in the shipped CSS with the
same value.** How scored: `docket spec-check` (a); exit code decides.

**F2 — every contrast ratio the spec states is reproduced from the shipped
hexes.** How scored: `docket spec-check` (b); exit code decides.

**F3 — every floor the spec states is not undercut.** How scored: a reading. A
floor is a minimum the spec states in numbers — a touch target, a minimum width,
a minimum type size. For each, the shipped value at the place the diff touches;
a value below the floor is a failure, located at the declaration.

**F4 — a new visual element cites the ruling or spec section that permits it
within twenty lines.** How scored: a reading of each hunk that introduces an
element or a rule for one; the cite is a ruling id or a `UIUX §x` / `PRD §x`
reference within twenty lines of it.

**F5 — conventional pattern.** Count of new elements recognisable as a standard
UI pattern regardless of styling: card, badge, chip, filter, toggle, panel,
sidebar, modal, dropdown, accordion, tab. Target 0. The test: if the element can
be described in that vocabulary, it is that pattern; a container with radius,
padding and shadow is a card whatever it is named; renaming is not redesigning.
How scored: a reading of every new element in the diff, each named in that
vocabulary or shown not to fit any word of it.

**F6 — physical metaphor.** Every new arrangement names the physical thing it is,
in the file or in the spec: yes or no per element. How scored: a reading; the
name must be a thing with a place and an extent (a sheet, a lot, a band, a
frame), not a UI word.

**F7 — visual utility.** Every visual property that varies carries data: size
means quantity, colour means category, density means completeness.
Decorative-only variations, target 0. How scored: a reading of each varying
property in the diff, with the datum it carries or the finding that it carries
none.

**F8 — object permanence.** Nothing the user placed moves or disappears on a
state change: violations, target 0. How scored: a reading of every state change
the diff introduces or alters, for what it does to placed objects.

**F9 — content framing.** Text-in-rectangles introduced: target 0. How scored: a
count over the diff of new text set inside a bordered or filled rectangle whose
only job is to hold the text.

## Fixes that are still conventional

| The patch | What it still is |
|---|---|
| dim instead of hide | the same element, on a switch |
| icons in rectangles | badges |
| a coloured status bar | a status bar |
| labelled zones | panels |
| a compact label | a chip |
| traffic-light thresholds | a badge with three colours |
| a shrunk hero | a hero |

## Red flags

- "it's technically not a card because…" — it is a card.
- "it's spatial because it uses translateY" — it is a hover effect.
- "the pattern is familiar, so it costs nothing to learn" — familiarity is the
  cost F5 counts.

A judge that has read this table cannot pass a patch F5 would have caught.

## Located failure

    design · F5 · styles.css:212 · a bordered, padded, shadowed container holding a note's title: a card · remove the container, or cite the ruling that permits it
