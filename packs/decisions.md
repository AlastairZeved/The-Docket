# decisions — the pack for the ledger

Domain: the ledger — `DECISIONS.md`, `docs/DECISIONS.md`; scored on every new entry and addendum

`docket` in this file is the core, run as the protocol says. A pack is a list of measurable features. The judge scores each new entry and
addendum in the diff, and records PASS or FAIL with a location. Each feature says
how it is scored.

## Features

**F1 — the entry satisfies the header contract.** How scored: `docket check`,
check 6; exit code and the located lines decide.

**F2 — it names the principle it resolves against, and that principle exists.**
How scored: `docket principles` against the entry's `Principle:` line.

**F3 — every ruling it touches is named with a verb from the list; each exists
and is earlier.** How scored: `docket check`, checks 5 and 6, and the entry's
meta read against `docket governs <id>` for each id it names.

**F4 — no existing entry's heading or body changed.** How scored: `docket
check`, check 7.

**F5 — grounding.** The entry names the issue or observed failure it answers:
yes or no. How scored: a reading of the meta and the body for an issue number, a
named failure, or a measurement.

**F6 — invariant.** The entry names the feeling or quality it preserves — the
constituted repository's third answer: yes or no. An entry that changes what the
user sees or does and names none is a failure. How scored: a reading of the body
against the principle list.

**F7 — unity.** The entry says which sibling rulings it keeps, so the changed
part stays distinct and still coheres: yes or no. How scored: a reading of the
meta for a `keeps` clause, or of the body for the same statement in words.

**F8 — scale.** The entry states the range it holds over — viewport, count,
size — or says it is scale-free: yes or no. How scored: a reading.

**F9 — the number.** The entry names the measurement, ratio, pattern or
invariance underneath it, or records its absence as a finding: yes or no. An
absence is not a failure; an unrecorded absence is. How scored: a reading.

**F10 — the number and its property.** If the entry changes a number an earlier
ruling set, it names that ruling as superseded and gives the measurement that
forced the change: yes or no. If the diff changes such a number with no entry at
all, that is a located failure in the code pack's F3, routed to `/rule`. How
scored: the diff's changed numbers against the ledger's ruled numbers.

## The interrogation

Run on an entry that resists F5–F9 — one where the readings above cannot be made
from the text:

- what is this thing, fully?
- what has been used as this thing?
- what could it be?
- does its design add value to its use?
- does its function borrow from its form?
- what would be surprising or genuinely valuable?
- what does it expect of itself at module level? at app level?
- can it tie to something already in progress?

Located failures from the interrogation: made because adjacent choices were the
same; because convention suggested it; because one dimension was satisfied and
the other not checked; to complete a pattern; placed because something needed to
go somewhere; impermanence never considered.

## Located failure

    decisions · F6 · docs/DECISIONS.md:140 · R12 changes what the reader sees at capture and names no feeling it preserves · amend the entry through /rule --addendum, or supersede it
