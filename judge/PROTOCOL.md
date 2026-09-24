# PROTOCOL.md — the judge

The judge is a reader with a shell and no pen. The host runs it when the maker
declares a stretch of work done, and it decides whether that stop stands. This
file is the whole of its instructions. It names no host and no model (D13): any
subagent that can read files and run a shell can follow it, on whatever model
the host gives it.

**Reader.** The judge itself — a subagent with a shell and no pen — and whoever
binds one; it knows how to run a command and read a diff, and it does not know
the maker's intentions or this repository's history. **Purpose.** Decide whether
one stop stands, in seven steps, in this order. **Source.** D7, D8, D10, D11,
D12 and D15 in `docs/DECISIONS.md`.

## What the judge is given

| Input | From |
|---|---|
| a working tree | the host's current directory |
| the ledger and the spec documents | discovery, `docs/FORMAT.md` (1) |
| the packs | `docket pack --list`, then `docket pack <name>`: the files beside the core, printed, because the judge reads nothing outside the project |
| the diff since the last PASS, and the files it touches | `docket gate --session <id> --diff` |
| the maker's transcript | a path the host passes in; `docket transcript <path>` prints its text and its tool calls, because the path is outside the project |
| the session identifier | the host passes it in |
| whether this stop was already blocked once in this turn | the host passes it in; if so, allow the stop at once |
| a shell | confined to `docket.js` and the repository's own test commands. The core prints the protocol, the packs, the diff and the transcript, so one permission — to run the core — is the whole of what the judge needs |

`docket.js` is `bin/docket.js` in this repository, or `test/docket.js` where the
witness is vendored, or — where the judge runs as a host's hook — the file the
project's `.docket/core` names. A host gives its hook agent no word of where the
plugin is, in its prompt or in its shell, so the core leaves its own path there
whenever it runs as that host's hook in a governed project (`docs/FORMAT.md` 16).
A judge that finds no `.docket/core` and no ledger allows the stop: the project
is not under the docket. One that finds a ledger and no `.docket/core` blocks
once, naming the missing file and its cause — the session did not start with the
plugin loaded — and the stop that follows is allowed by the re-entry rule below.
Below, `docket` means `node <that file>`. The judge's
answer is one of two things — the stop is allowed, or it is blocked with a
reason — and the host's binding says in what shape each is expressed; this
protocol says only which, and what the reason must contain.

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
(D11); (2) the project has no `.docket/core` and no ledger — it is not under the
docket; (3) `docket gate` printed SKIP; (4) the protocol, followed to its end,
ended with `docket verdict` printing `verdict recorded: PASS`. The judge never
runs the verdict command to make the fourth case true: a PASS is step 6's
answer to a diff it scored and found nothing in, and the first three cases stand
with no verdict at all. In every other outcome the stop does not stand: FAIL or
STALE — the reason is the verdict's Failures lines with their fix routes; SURFACE
— the reason is the residue the gate printed, ending with its last sentence; a
ledger beside no `.docket/core` — the reason names the missing file and its
cause; a command denied — the reason is one line, that the judge could not run
the core; and an answer given without having run the protocol is not an answer.

`docket` in this file and in the packs is `node <core>`, the core named above:
run every command exactly in that shape, from the project directory, never
prefixed with `cd` or anything else — a host permits that shape and no other.

## The seven steps, in order, and the order is the point

1. **`docket gate --session <id> --diff`** — after one look at the host's re-entry flag:
   a stop already blocked once in this turn is allowed before anything else.
   `SKIP` → allow the stop at once (D10).
   `SURFACE` → block the stop with the residue `gate` printed and the sentence
   "report this to the user verbatim, then stop again" (D11); the next `gate`
   answers `SKIP`. Steps 2–6 do not run: the surfacing block scores nothing.
   `JUDGE <hash> <files…>` → continue with those files; keep the hash for step 6.
   The diff follows that line, and it is the diff every step below reads.
2. **Domains and packs.** From the files, determine the domains touched and read
   the matching packs (D12; each pack's own `Domain` line gives its globs). A
   change to the ledger always adds `packs/decisions.md`. A pack scores only the
   governed files in the diff.
3. **Score every pack feature against the diff and the repository before
   opening the transcript.** For each feature: run its command, or make its
   reading; record PASS or FAIL with `file:line`, the ruling id where one
   applies, and the feature id. Reason: reading the maker's account first is
   checking homework with the answer key.
4. **`docket governs <id>`** for every ruling cited in the touched regions (the
   ids `near` would have printed for each hunk). Check the diff against each
   ruling's clauses and against every in-edge's clause: a later ruling may have
   superseded the clause the diff breaks, or waived it for this case. For each
   ruling the diff contradicts, read its `Reason:` sentence and ask one more
   question: does the code or the condition that reason describes still exist
   after this diff? If the diff, or an earlier change, removed the thing the
   reason rests on, the contradiction is stale (step 6), and its route is an
   addendum, not a rewrite; if the reason still holds, it is a failure.
5. **Only now read the transcript** (`docket transcript <path>`; where the host
   also passes the maker's last message, it is read the same way). List the
   maker's claims — every "I ran", "this follows", "tests pass" — and check each
   against the evidence from steps 3 and 4. A claim without evidence is a located
   failure. A command claimed but not run is a located failure.
6. **Verdict.**
   **PASS**: no feature failed, no ruling contradicted, every claim evidenced.
   **FAIL**: a ruling is contradicted and its stated reason still holds, or a
   feature fails, or a claim is unevidenced.
   **STALE**: a ruling is contradicted whose stated reason no longer holds (the
   code the reason describes is gone), or a cite no longer points at code that
   implements the ruling. A diff that earns both is FAIL: FAIL names every
   located failure, the stale ones with their addendum route among them, and
   STALE is the verdict only when every failure is a stale one. A stale
   contradiction is never itself the FAIL (D7): it keeps its addendum route
   whatever the verdict, and the verdict is FAIL for the other failures.
   Record it: `docket verdict <PASS|FAIL|STALE> --hash <hash> --failures <n> --session <id> --reason "<the located failures, one per line>"`.
7. **Return.**
   PASS → allow the stop.
   FAIL → block, with the located failures and their fix routes: change the
   code, or amend the law through `/rule` (which ends at a confirm block only
   the human can answer, D8).
   STALE → block, with the addendum route: `/rule --addendum <id> "<why the
   reason no longer holds>"`, not a new ruling (D7).

## The verdict, in this order

    Feature scores      one line per feature: <pack> <F-id> PASS|FAIL <file:line>
    Trace discrepancies the maker claimed X; the evidence shows Y
    Failures            <pack> · <F-id> · <file:line> · expected vs found · fix route
    Verdict             PASS | FAIL | STALE

A trace discrepancy is an execution failure (a command claimed but not run) or a
compliance failure (a ruling claimed as followed but contradicted); these are
the most important findings and come before the failure list.

## A located failure

    code · F3 · app.js:1112 · R6 keeps the toolbar; this diff removes it · change the code, or supersede R6 through /rule

never

    the toolbar change looks wrong, try again

## The two commands the judge calls

`docket gate --session <id> [--diff]` prints one of

    SKIP
    SURFACE
    <the residue: the block count and the located-failure count of each verdict since the last PASS; the last verdict, its time, and the failure lines it was recorded with>
    report this to the user verbatim, then stop again
    JUDGE <hash> <file> <file> …
    <with --diff: the diff, as git prints it, then `+++ <path>` and the content of each untracked governed file>

and decides mechanically (D10, D11): the hash is the SHA-256 of the diff since
the committed head over every governed file and the ledger, followed by, for
each untracked governed file in path order, a line `+++ <path>` and the file's
content; `SKIP` when that diff is empty or its hash equals the
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
The block counter — one block per judged cycle that failed, FAIL or STALE — is
per session, reset only by a PASS, never by a changed hash; it counts the five
judged blocks, not the surfacing stop, and the plateau test above is made at
every stop from the fourth on, not once. `gate` itself records the session
as surfaced when it answers `SURFACE`, in the same state file `verdict` writes,
so its next answer for that session is `SKIP`. A surfaced session is released
by a new session, or by a PASS the human records with `docket verdict PASS
--session <id> --hash <hash> --failures 0`, naming that session (`status` names
it), after judging the residue themselves; nothing the maker does alone
releases it. The session identifier is
whatever the host passes; the state file keeps one block count, one failure
history and the surfaced mark per identifier.

`docket verdict <PASS|FAIL|STALE> --hash <hash> --failures <n> --session <id> [--reason "…"]`
writes `.docket/verdict.json` (ignored by git) and bumps the session's block
count, or resets it on PASS; a PASS names no failures and a FAIL or STALE names
at least one, or the record is refused. The reason is kept with the verdict and
is what `gate` prints back as the residue when the session surfaces. The judge is the only party that calls it, by
contract, not by mechanism: a forged verdict is a visible shell call in the
maker's transcript.

Nothing verifies the relay. The residue reaches the human only through the
maker's own reply (D11), and a maker can drop it; the boundary is the maker's
compliance, as the boundary against a forged verdict is tool permission.

## The stop's mechanical half

A judge that answers without running anything lets the stop pass in silence,
and a host cannot see the difference between that and a PASS. So a host binds a
second handler beside the judge on the same event: `docket stop`, which reads
the same hook input, computes the same diff, and blocks a governed stop for
which no fresh verdict has been recorded by the time the judge should have
finished — it waits up to its bound, equal to the judge's own timeout, for the
record, then refuses; and a fresh FAIL or STALE it finds it relays as a block
with the recorded reason, in case the judge's own block never reached the
maker. It writes no state and judges nothing; it refuses silence, once, and
the stop that follows in the same turn is allowed by the re-entry flag. The
judge never calls it.

## Cost

One judge per stop that touched a governed file, and at most five per session
between passes (D11); the surfacing block that may follow the fifth costs no
judge, so a session is denied at most six stops, five judged and one surfacing,
before its next stop is allowed. A stop that touched nothing governed costs one `gate`
call and no judge.
