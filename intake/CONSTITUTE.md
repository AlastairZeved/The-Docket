# The /constitute intake

Four gated questions for a new project, each with its refusal rule; a confirm
block that only the human can answer; then `docket constitute --answers`,
which does everything mechanical. This file is host-agnostic (D13). The shape
checks in `constitute` are the second line; the semantic refusals below — a
category, a feature — are this intake's, because only a reader can tell them.

## The questions

1. **What is this?** One sentence naming the object and the verb: "a page
   where a typed thought becomes a framed note the instant it is typed".
   Refused: a category ("a productivity app", "a tool for notes"), a list of
   features, more than one sentence.
2. **Who is it for?** Valid only with a role, one explicit thing that person
   knows, and one explicit thing they do not know: "a solo builder who knows
   the three sections and does not know the render math". Refused: "general
   audience", "everyone", "anyone", "non-technical", "users", "people", "the
   public" — a role names a person, not a crowd — and any role missing its
   "knows" or its "does not know".
3. **What feeling must survive every iteration?** One phrase. Refused: a
   feature ("fast sync", "dark mode" — a feature is something the thing does;
   a feeling is what the person is left with), a sentence, a list. No default
   is offered: a feeling the intake supplies is not the maker's, and the
   project would be built to keep something no one chose.
4. **What will it refuse to do?** At least three, each a verb phrase ("sync to
   a server", "ask for an account", "move a note the person did not move").
   Refused: fewer than three, a repeat, a refusal that is a feature in
   disguise ("refuse to be slow").

## Escalation (D18)

A vague answer gets exactly one clarification, phrased as the question the
answer left open. A second vague answer to the same question gets the
requirement restated as a checklist and the question asked once more. There
is no third attempt: a third vague answer ends the intake, writes nothing, and
says so. Reason: as for `/rule` — an intake that keeps asking accepts in the
end what it should have refused, and here the corrupted rule is the
constitution every later ruling resolves against.

## The confirm block

Print the answers, the project's name and the prefix under
`CONSTITUTION — PLEASE CONFIRM`:

    CONSTITUTION — PLEASE CONFIRM
    Name:      <the directory's name, unless the person gave one>
    What:      <answer 1>
    For:       <role>, who knows <knows> and does not know <does not know>
    Must keep: <feeling>
    Will not:  <refusal> · <refusal> · <refusal>
    Prefix:    R   (the letter every ruling's number carries; say another to change it)

and stop. Wait for the human. Only the human confirms (D8): the word
`confirm`, from the person, in a turn of their own. Silence is not
confirmation. A model's own turn is not confirmation. Any other reply reopens
the line it bears on; a new name or prefix replaces the one shown and the
block is printed again.

## On confirmation

Write the answers to a temporary JSON file:

    {"name": "…", "what": "…",
     "who": {"role": "…", "knows": "…", "doesntKnow": "…"},
     "feeling": "…", "refuses": ["…", "…", "…"], "prefix": "R"}

and run `docket constitute --answers <that file>` from the project's root. It
checks each answer's shape and refuses a malformed one by name; fills the
templates into `docs/PRD.md`, `docs/UIUX.md` and `docs/DECISIONS.md`, the
first ruling being the constitution itself; vendors the witness to
`test/docket.js` (D9); prints the CI step and a section for the repository's
agent-instructions file; and runs `check`. Report its output as printed, then
delete the temporary file.
