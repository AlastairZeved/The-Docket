# PROTOCOL.md — the judge

The judge is a reader with a shell and no pen. `docket stop` starts it when the
maker declares a stretch of work done, and it decides whether that stop stands. This
file is the whole of its instructions. It names no host and no model (D13): any
subagent that can read files and run a shell can follow it, on whatever model
the host gives it.

**Reader.** The judge itself — a subagent with a shell and no pen — and whoever
binds one; it knows how to run a command and read a diff, and it does not know
the maker's intentions or this repository's history. **Purpose.** Decide whether
one stop stands, in seven steps, in this order. **Source.** D7, D8, D10, D11,
D12, D15, D22, D23, D24, D37 and D46 in `docs/DECISIONS.md`.

## What the judge is given

| Input | From |
|---|---|
| a working tree | the host's current directory |
| the ledger and the spec documents | discovery, `docs/FORMAT.md` (1) |
| the packs | `docket pack --list`, then `docket pack <pack> <pack> …`: the files beside the core, printed, because the judge reads nothing outside the project |
| the session's diff from its base (D40), and the files it touches | `docket gate --session <id> --diff` |
| the maker's transcript | a path the host passes in; `docket transcript <path>` prints its text and its tool calls, because the path is outside the project |
| the session identifier | the host passes it in |
| whether this stop was already blocked once in this turn | the host passes it in; if so, allow the stop at once |
| a shell | confined to what the session allows, of which the protocol uses two things: the core, through the one permission its binding grants — the core prints the protocol, the packs, the diff and the transcript, so running it is all the protocol needs — and the repository's own check commands where the session allows those too; what else a host lets through unasked, such as a command that only reads, the protocol does not use. A check command the judge may not run leaves the code pack's first feature unscored, and the judge's report says so and names the command: the stop keeps the report in `.docket/judge.log`, which `docket status` names, since a PASS carries no line (D46) |

`docket.js` is `bin/docket.js` in this repository, or `test/docket.js` where the
witness is vendored, or — where `docket stop` started the judge — the file its
prompt names, written out: the stop is the core, and knows where it is. A judge
a person runs by hand is given no word of where the plugin is, so the core
leaves its own path in the project's `.docket/core` whenever it runs as the
host's hook in a governed project (`docs/FORMAT.md` 16); one that finds no
`.docket/core` and no ledger says the project is not under the docket, and one
that finds a ledger and no `.docket/core` says the session did not start with
the plugin loaded. Below, `docket` means `node <that file>`. The judge's answer
is the record `docket verdict` makes, or none where the stop stands with no
record: the stop that started the judge reads that record and nothing else the
judge says, allows the stop on a PASS, and blocks it with the recorded lines on
a FAIL or STALE (D37).

## What the judge may not do

It writes nothing: no file, no edit, no note. It runs nothing but the commands
above. It confirms no ruling, amends no ruling, and never tells the maker to
"try again": every failure it returns is located (file, line, ruling, feature)
with a fix route. It never passes a diff with a feature failure because the
diff "reads well overall". It never records a verdict to release a stop: a PASS
is step 6's answer to a diff it scored and found nothing in, and SKIP and the
re-entry flag allow a stop with no record at all.

## When the stop stands

In four cases, and in no other: (1) the host's re-entry flag is set — this stop
follows a block in the same turn, and a session is blocked at most once per turn
(D11), and `docket stop` allows such a stop before any judge starts; (2) the
project has no ledger — it is not under the docket; (3) `docket gate` printed SKIP;
(4) the protocol, followed to its end, ended with `docket verdict`
printing `verdict recorded: PASS`. The judge never
runs the verdict command to make the fourth case true: a PASS is step 6's answer
to a diff it scored and found nothing in, and the first three cases stand with
no verdict at all. In every other outcome the stop does not stand: FAIL or
STALE — the reason is the verdict's Failures lines with their fix routes, as
recorded; SURFACE — the reason is the residue the gate printed, ending with its
last sentence; a command denied — the judge records nothing, and says in one
line that it could not run the core; and an answer given without having run the
protocol is not an answer: the stop finds no record for its diff, and does not
stand.

`docket` in this file and in the packs is `node <core>`, the core named above:
run every command exactly in that shape, from the project directory, with
nothing before it and nothing after it — no `cd`, no `;`, `&&` or `|`, no
redirection — because that is the shape the one permission names: a command
in any other shape is one it does not cover, and a host may refuse it. A host
may let other commands through unasked — one that only reads, inside the
project — while a write stays refused; the protocol uses none of them.

## The seven steps, in order, and the order is the point

A judge is stopped at a bound — a number of turns, and of seconds — and every
command and every file read spends it; a judge stopped before step 6 has judged
nothing. So
the commands print what a judgement needs: the diff `gate` prints shows each
touched function whole, and beneath it the rulings its regions cite, as
`governs` prints them; and `pack` and `governs` each take every name at once.
Read a file only for what they leave out (D30).

1. **`docket gate --session <id> --diff`** — after one look at the host's re-entry flag:
   a stop already blocked once in this turn is allowed before anything else.
   `SKIP` → allow the stop at once (D10).
   `SURFACE` → the stop does not stand, and the reason is the residue `gate`
   printed with the sentence "report this to the user verbatim, then stop
   again" (D11); record nothing — `docket stop` relays the residue itself — and
   the next `gate` answers `SKIP`. Steps 2–6 do not run: the surfacing block
   scores nothing.
   `JUDGE <hash> <files…>` → continue with those files; keep the hash for step 6.
   The diff follows that line, and it is the diff every step below reads.
2. **Domains and packs.** From the files, determine the domains touched and read
   the matching packs in one command, `docket pack <pack> <pack> …`, each named as
   `docket pack --list` names it — a pack, never a file (D12; each pack's own
   `Domain` line gives its globs). A change to the ledger always adds
   `packs/decisions.md`. A pack scores only the governed files in the diff.
3. **Score every pack feature against the diff and the repository before
   opening the transcript** — all but the two that read it, the code pack's F6
   and the decisions pack's F11, scored at step 5 (D46). For each feature: run its command, or make its
   reading; record PASS or FAIL with `file:line`, the ruling id where one
   applies, and the feature id. Reason: reading the maker's account first is
   checking homework with the answer key.
4. **The rulings cited in the touched regions** — every ruling cited within
   `near`'s window of each hunk, the lines it removed among them, without
   `near`'s cap (D46) — follow the diff `gate` printed, each as `docket
   governs <id>` prints it; run `docket governs <id> <id> …`, once, only for any
   they leave out (D33). For each, the ruling's `Reason:` sentence is beneath its
   heading, then its edges. Check the diff against each
   ruling's clauses and against every in-edge's clause: a later ruling may have
   superseded the clause the diff breaks, or waived it for this case. For each
   ruling the diff contradicts, read its `Reason:` sentence and ask one more
   question: is the premise that reason gives still true after this diff? The
   premise is the fact the reason says makes the ruling right — about the
   product, the code, or the person using it — and never the thing the ruling
   keeps: a diff that removes what a ruling keeps contradicts the ruling, and
   that removal is not the premise going (D24). A ruling that keeps a confirmation
   before a delete because a deletion cannot be undone: a diff that removes the
   confirmation leaves that premise true, so the reason holds and the
   contradiction is a failure; a diff that makes every deletion undoable and
   removes the confirmation makes the premise false, so the reason is gone and
   the contradiction is stale (step 6), and its route is an addendum, not a
   rewrite. The premise may have gone with this diff or with an earlier change,
   and it seldom lives in the hunk the ruling's cite sits in: read it against the
   whole diff and the code the diff leaves, since what makes a ruling right is
   usually somewhere the ruling's own lines are not. Read them with your file
   tools and `docket gate --diff`: the shell runs the core, and nothing else. Write the answer into the located
   failure as a field of its own, after what the diff breaks and before the route,
   with the line that shows it: `reason holds: <the premise, as the code the diff
   leaves shows it> (<file:line>)`, the line where the premise is still true; or
   `reason gone: <what changed> (<file:line>)`, the line of the diff, or of what it
   leaves, that makes it false — and, for a cite that no longer points at code that
   implements its ruling, `cite stale`. The line is one of a file in the
   repository, before or after the diff; the code's line says more than the
   ledger's, which records what was decided and not whether it is still true. A
   code line that names a ruling and answers neither way, or answers without its
   line, is refused when it is recorded (D23, D27), and so is a `reason holds`
   whose every line is its own claim: the entry of the ruling it names, which
   restates the ruling, or the failure's own located line, which is the
   contradiction — neither shows the premise (D36).
5. **Only now read the transcript** (`docket transcript <path>`; the stop's
   prompt gives its path and no word of the maker's). List the
   maker's claims — every "I ran", "this follows", "tests pass" — and check each
   against the evidence from steps 3 and 4: the code pack's F6. A claim without evidence is a located
   failure. A command claimed but not run is a located failure. Then score the
   decisions pack's F11 for every entry or addendum the diff adds to a ledger: a
   write the maker's own tool call made — `docket append`, or an edit or a write
   of a ledger — with no `confirm` from the person, in a turn of their own, after
   the confirm block the intake prints, is a located failure (D8, D32). A ledger
   change no tool call of the maker's made is not the maker's, and is not scored.
6. **Verdict.**
   **PASS**: no feature failed, no ruling contradicted, every claim evidenced.
   **FAIL**: a ruling is contradicted and its stated reason still holds, or a
   feature fails, or a claim is unevidenced.
   **STALE**: a ruling is contradicted whose stated reason no longer holds (its
   premise is false, as step 4 reads it — never the thing the ruling keeps,
   removed), or a cite no longer points at code that
   implements the ruling. A diff that earns both is FAIL: FAIL names every
   located failure, the stale ones with their addendum route among them, and
   STALE is the verdict only when every failure is a stale one. A stale
   contradiction is never itself the FAIL (D7): it keeps its addendum route
   whatever the verdict, and the verdict is FAIL for the other failures.
   Record it: `docket verdict <PASS|FAIL|STALE> --hash <hash> --failures <n> --session <id> --reason '<the located failures, one per line>'`.
   The lines go in that one argument, inside single quotes, one line per line: the
   shell runs the core and nothing else, so no file, heredoc or variable can carry
   them, and a route's own double quotes sit inside the single ones as they are.
   `--failures` is the number of those lines, and the verdict follows from them:
   STALE when every line says `reason gone` or `cite stale`, FAIL when any does
   not. The core refuses a record that disagrees with its own lines, a line not in
   the located form, and a PASS that carries a reason (D23), and says why: correct
   the line it names and record again (D29). A refusal is the core working, not failing;
   the judging is not done until a record is made.
7. **Return.** Your answer is the record step 6 made, and the stop reads it and
   nothing else you say; say it in the verdict's shape below, for the person
   who reads it.
   PASS → allow the stop.
   FAIL → block, with the located failures and their fix routes: change the
   code, or supersede the ruling through `/rule` — a new ruling that names the
   clause it replaces, the route of an unlogged change to a ruled number too
   (D14, D35) — which ends at a confirm block only the human can answer (D8).
   STALE → block, with the addendum route: `/rule --addendum <id> "<why the
   reason no longer holds>"`, not a new ruling (D7).

## The verdict, in this order

    Feature scores      one line per feature: <pack> <F-id> PASS|FAIL <file:line>
    Trace discrepancies the maker claimed X; the evidence shows Y
    Failures            <pack> · <F-id> · <file:line> · expected vs found · [reason holds: <premise> (<file:line>) | reason gone: <what changed> (<file:line>) | cite stale] · fix route
    Verdict             PASS | FAIL | STALE

A trace discrepancy is an execution failure (a command claimed but not run) or a
compliance failure (a ruling claimed as followed but contradicted); these are
the most important findings and come before the failure list.

## A located failure

    code · F3 · src/trash.js:30 · R4 keeps a confirmation before a delete; this diff removes it · reason holds: a deletion still cannot be undone (src/trash.js:52) · change the code, or supersede R4 through /rule
    code · F3 · src/trash.js:30 · R4 keeps a confirmation before a delete; this diff removes it · reason gone: every deletion is undoable now (src/undo.js:14) · /rule --addendum R4 "deletions can be undone"

The answer between what the diff breaks and the route, with its line, is
required on a code line that names a ruling, and on no other; a line in any other
pack ends with its route. A located failure says where and what — F3 failed at
app.js:1112: R6 keeps the toolbar; this diff removes it — never

    the toolbar change looks wrong, try again

## The two commands the judge calls

`docket gate --session <id> [--diff]` prints one of

    SKIP
    SURFACE
    <the residue: the block count and the located-failure count of each verdict since its last PASS; the last verdict, its time, and the failure lines it was recorded with>
    report this to the user verbatim, then stop again
    JUDGE <hash> <file> <file> …
    <with --diff: the session's diff, each touched function whole, then each ruling its hunks cite>

and decides mechanically (D10, D11): the hash is the SHA-256 of the session's
diff, which `docs/FORMAT.md` (16) states — from the session's base, over every
governed file, every ledger and the spec documents beside it, those the base
governed that the tree no longer does among them (D22), an untracked one read as
added (D40); `SKIP` when that diff is empty or its hash equals the
last PASS's, or when this session is already surfaced; `SURFACE` when this session has been blocked five times or more since the
last PASS, or when located failures have not decreased across the last two
verdicts after the third block; else `JUDGE`. So a session whose failures stop
falling is surfaced at its fourth stop at the earliest — the stop after the
plateau shows, which is the fourth when the first three blocks plateau and later
when they fall first; one whose
failures keep falling without reaching zero is blocked five times by the judge
and a sixth time by `SURFACE`; either way the stop after `SURFACE` is allowed.
The re-entry flag the host passes is its word that this stop follows a block in
the same turn, and D11 honours it: a session is blocked at most once per turn,
so the stops counted above are one per turn, with the maker's work between them.
The block counter — one block per judged cycle that failed, FAIL or STALE, or
that ended with no verdict recorded (D38) — is per session, reset only by a
PASS, never by a changed hash; it counts the five judged blocks, not the
surfacing stop, and the plateau test above is made at every stop from the
fourth on, not once. `gate` itself records the session
as surfaced when it answers `SURFACE`, in the same state file `verdict` writes,
so its next answer for that session is `SKIP`. A surfaced session is released
by a new session, or by a PASS the human records with `docket verdict PASS
--session <id> --failures 0`, naming that session (`status` names it; the hash is
the working tree's own), after judging the residue themselves. The core cannot tell who records it:
the same command run by the maker releases the session too, and passes the diff
in front of it: a stop on that diff is allowed, and the first after a further
change is judged afresh (D11); the boundary is the permission to run the core, which the binding
gives the judge's session and the maker's only inside the docket's own skills
(D37), and the call's place in the maker's transcript, as for a forged verdict
below. The session identifier is
whatever the host passes; the state file keeps one block count, one failure
history and the surfaced mark per identifier.

`docket verdict <PASS|FAIL|STALE> --hash <hash> --failures <n> --session <id> [--reason "…"]`
writes `.docket/verdict.json` (ignored by git) and bumps the session's block
count, or resets it on PASS, and appends the record, one JSON line, to
`.docket/verdicts.jsonl`, the judge's answers in order; a PASS names no failures
and carries no reason, a FAIL or STALE names at least one and carries one located
line per failure, the word follows the lines, or the record is refused (D23). The reason is kept with the verdict and
is what `gate` prints back as the residue when the session surfaces. The judge is the only party that calls it, by
contract, not by mechanism: a forged verdict is a visible shell call in the
maker's transcript.

Nothing verifies the relay. The residue reaches the human only through the
maker's own reply (D11), and a maker can drop it; the boundary is the maker's
compliance, as the boundary against a forged verdict is tool permission.

## The stop

The judge is started by the stop, not bound beside it. The host runs `docket
stop` when the maker declares the work done, with the hook input on stdin and,
with `--judge`, the command that starts the host's agent headless as the judge:
a session of its own, with no pen, one permission and a bound of its own. `stop`
first decides what needs no judge — the host's re-entry flag, a diff with nothing
governed in it or one the last PASS judged, and a surfaced session allow the stop
at once, and a session its gate surfaces is blocked with the residue — and starts
the judge for every other stop, with a prompt that names the core and carries the
hook input's session, transcript path and directory, none of what the maker wrote
(D46). It waits for the judge to end, up to its bound, and reads the record:
a PASS allows the stop; a FAIL or STALE recorded for this diff since the judge
started is the block, with the recorded lines and their route; anything else — a
judge that recorded nothing, was refused, or was stopped at its bound — blocks
the stop once, saying so, and the stop that follows in the same turn is allowed
(D11); that block counts toward the session's five as a recorded one does, so a
judge that never records surfaces the session as one that never passes does
(D38). So a judge that answers without running anything records nothing, and its
silence cannot pass for a PASS: the stop reads the record, not the judge's words.
The judge's own output is kept in `.docket/judge.log` for a person to read. The
judge never calls `stop` (D37).

## Cost

One judge per stop that touched a governed file, and at most five per session
between passes, whether each records a FAIL, a STALE or nothing (D11, D38); the
surfacing block that may follow the fifth costs no judge, so a session is
denied at most six stops, five judged and one surfacing,
before its next stop is allowed. Each judge is a session of its own, of the
host's agent on the model the host gives it, and the maker waits at the stop
while it runs. A stop that touched nothing governed costs the gate's mechanical
reading and no judge.
