# The /rule intake

Five questions, asked in order, each refused if the answer is vague; a confirm
block that only the human can answer; then one entry written by
`docket append`, which validates it, appends it, runs `check`, and prints the
result. This file is host-agnostic (D13): a host binds it with a skill or its
equivalent and runs the commands it names.

**Reader.** The agent that runs `/rule` for a person, and the person answering;
it knows the ledger's grammar through `docket`, and it does not know which
rulings a change touches until `docket query` shows them. **Purpose.** Turn
one decision into one entry the ledger accepts: five questions, a confirm only
the person gives, and one `docket append`. **Source.** D8, D13 and D18 in
`docs/DECISIONS.md`, and `append` in `bin/docket.js`.

## The questions

1. **What changed** — one sentence naming the thing and the verb. Refused: a
   category ("the layout"), a feeling ("it felt wrong"), more than one
   sentence.
2. **The issue or context** — an issue number, or one phrase naming the
   situation this ruling answers. Refused: "cleanup", "misc", "various".
3. **The principle** — one of the list the host splices here from
   `docket principles`, chosen by its bold phrase. Refused: a principle not on
   the list, or none. A ruling that serves no stated principle is a preference.
4. **Every ruling it touches, with a verb** — after question 1, run
   `docket query <the nouns of the answer>` and read what comes back. For each
   ruling the change bears on, a verb from the grammar's list and the id —
   supersedes, overrides, retires, reverses, waives, extends, keeps, re-tunes,
   refines, replaces, corrects, revises; an adverb (partially, partly, in part)
   may qualify one. Refused: a ruling the query surfaced that the answer neither
   names nor dismisses with a reason.
5. **The ruling, in prose, with its reason, its scale and its number** — what
   is now so, and why, the why as a sentence beginning `Reason:`; the range it
   holds over — a viewport, a count, a size, a duration — or that it holds at
   every scale; and the measurement, ratio, pattern or invariance underneath
   it, with its value or where it was taken, or a sentence recording that none
   was found. Refused: a body without `Reason:`, a reason that restates the
   ruling in other words, or a body without its scale or its number — the
   decisions pack's F8 and F9 fail an entry without them at the next stop.

## Escalation (D18)

A vague answer gets exactly one clarification, phrased as the question the
answer left open. A second vague answer to the same question gets the
requirement restated as a checklist — each thing an acceptable answer
contains, on its own line — and the question asked once more. There is no
third attempt: a third vague answer ends the intake, writes nothing, and says
so. Reason: a vague answer to the intake silently corrupts every rule written
from it, and an intake that keeps asking will in the end accept the answer it
should have refused.

## The confirm block

When the five answers are in, run the append the confirm will run, below, with
`--dry-run` added: it writes nothing, refuses what the write would refuse, and
prints the entry exactly as the write will append it — heading, `Principle:`
line, body. Print that output, as printed, under the heading
`RULING — PLEASE CONFIRM`, and stop; a refusal is no block, and reopens the
question it bears on. Wait for the human. Only the human
confirms (D8): the word `confirm`, from the person, in a turn of their own.
Silence is not confirmation. A model's own turn is not confirmation. A
restatement of the ruling is not confirmation. Any other reply reopens the
question it bears on. Nothing is written before the word.

## On confirmation

Run the same command without `--dry-run`:

    docket append --title "<answer 1, as a phrase>" --issue "<answer 2>" --principle "<answer 3>" [--edge "<verb> <id>"]… --body "<answer 5>"

and report its output as printed: the entry, any check failures, and the
`check:` line. Do not restate the entry in other words. The command runs in the
turn the person confirms in, which a skill's permission may not cover: a host
that grants it for the skill's own turn asks once more before the command runs
— that ask is the host's, and the confirm, the person's word, stands — and a
session with no one to ask writes only where its binding allows the core
(`docs/PROTOCOL-BINDING.md`). Report what happened as it is: the entry written,
or nothing written and why. A baseline rewrite
(`docket append --baseline`) follows the same path behind the same block; an
addendum has a block of its own, below.

## An addendum

`/rule --addendum <id> "<why>"` — the route a STALE verdict gives — asks none
of the five questions: the ruling stands, and what is added is one dated line
under it saying why its reason no longer holds. Refused: an id that names no
ruling (`docket governs <id>` says so), and a why that restates the ruling or
names nothing the code or the product now does differently; the escalation
above applies to it. Print the ruling's heading and, beneath it, the line
`docket append --addendum <id> --text "<why>" --dry-run` prints — `> Addendum
<today's date>: <why>`, exactly as the write will put it under the entry — under
the heading `ADDENDUM — PLEASE CONFIRM`, and stop. The
confirm is the block's own: the word `confirm`, from the person, in a turn of
their own; nothing is written before it. On the word, run the same command
without `--dry-run`:

    docket append --addendum <id> --text "<why>"

and report its output as printed. A route is not a confirmation: that a
judge's block named this addendum makes it a proposal to put to the person,
never one to write.
