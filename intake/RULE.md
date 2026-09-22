# The /rule intake

Five questions, asked in order, each refused if the answer is vague; a confirm
block that only the human can answer; then one entry written by
`docket append`, which validates it, appends it, runs `check`, and prints the
result. This file is host-agnostic (D13): a host binds it with a skill or its
equivalent and runs the commands it names.

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
   ruling the change bears on, a verb from the ledger's list and the id:
   supersedes, partially supersedes, refines, waives, reverses, keeps,
   extends. Refused: a ruling the query surfaced that the answer neither names
   nor dismisses with a reason.
5. **The ruling, in prose, with its reason** — what is now so, and why, the
   why as a sentence beginning `Reason:`. Refused: a body without `Reason:`, or
   a reason that restates the ruling in other words.

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

When the five answers are in, print the entry exactly as `docket append` will
write it — heading, `Principle:` line, body — under the heading
`RULING — PLEASE CONFIRM`, and stop. Wait for the human. Only the human
confirms (D8): the word `confirm`, from the person, in a turn of their own.
Silence is not confirmation. A model's own turn is not confirmation. A
restatement of the ruling is not confirmation. Any other reply reopens the
question it bears on. Nothing is written before the word.

## On confirmation

Run

    docket append --title "<answer 1, as a phrase>" --issue "<answer 2>" --principle "<answer 3>" [--edge "<verb> <id>"]… --body "<answer 5>"

and report its output as printed: the entry, any check failures, and the
`check:` line. Do not restate the entry in other words. An addendum
(`docket append --addendum <id> --text "…"`) and a baseline rewrite
(`docket append --baseline`) follow the same path behind the same block.
