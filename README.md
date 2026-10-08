# The Docket

**Reader.** A builder who works with a coding agent — Claude Code — on one git repository across many sessions, and
who has watched the agent undo a decision that was already made. They know git, the command line and how their
agent's sessions run; they do not know how a plugin binds to a repository, or how a ledger of rulings is written.
**Purpose.** Install the docket on a repository, record its first ruling, and know what its judge has been measured
to do and what it has not. **Source.** The rulings in `docs/DECISIONS.md`, cited by number (`D1`, `D2`, …); every
number under Measured Results is quoted from the ruling its line names.

[![Version](https://img.shields.io/badge/version-0.1.0-blue)](.claude-plugin/plugin.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Node 20+](https://img.shields.io/badge/node-20%2B-brightgreen)](https://nodejs.org/)

**Contents** — [What it is](#what-it-is) · [The problem](#the-problem) · [The five jobs](#the-five-jobs) ·
[The two-second demo](#the-two-second-demo) · [The ledger](#the-ledger) · [Install](#install) · [Use](#use) ·
[Tests](#tests) · [FAQ](#faq) · [Contributing](#contributing) · [License and contact](#license-and-contact) ·
[Measured Results](#measured-results) · [Known Limits](#known-limits)

## What it is

A ledger is a markdown file of numbered rulings. Each ruling is one decision, with the principle it was resolved
against, its reason, and what it does to earlier rulings: a later ruling *supersedes* an earlier one, often a single
clause of it, and never edits it away. The docket makes that file something the agent doing the work — the *maker*,
on this page — cannot walk past.

When the maker says a piece of work is done, a judge reads the diff against the rulings and decides whether the stop
stands. A FAIL blocks the stop, and the maker is told which ruling, where, and the way out. Before each edit, a hook
has already printed the rulings that govern the lines about to change: that is the judge's first half, the list
against which a claim like "this follows R6" can be checked at the stop.

Everything it enforces is plain text in your repository. Uninstall the plugin and the rulings still govern, because
the witness that checks them is a node script your repository owns and your CI runs (D9).

## The problem

A coding agent starts every session from the code as it is, not from the argument that made it that way. A decision
that was argued, measured and recorded gets undone three weeks later by an agent that never saw the argument — or by
you, in a later stretch, after you forgot it existed.

The usual answer is memory: an agent-instructions file, an auto-memory, a notes document. Each stores facts. None
stores a ruling — numbered, with its principle, with the clause of an earlier ruling it reverses, cited from the code
that implements it. A memory cannot say "R7 partially reverses R6 (relational plane only)". A memory is never red in
CI.

## The five jobs

| When | Job | What happens |
|---|---|---|
| at "done" | **Did this break a ruling?** | The stop hook starts a judge: a headless session of its own that can read files and run the docket's core, and can write nothing. It scores the session's diff against the rulings and the packs — files of features the judge scores, one per domain: code, design, prose, decisions (D12). A FAIL, or a STALE for a ruling whose reason the diff has made untrue, blocks the stop with located lines (D37). |
| before an edit | **What governs this region?** | A hook prints the rulings cited within twenty lines of the edit, nearest first, with the edges among them. It informs and never blocks (D1, D2). |
| at a decision | **Record it where it will be found.** | `/rule` asks five questions, refuses a vague answer, prints the entry under RULING — PLEASE CONFIRM, and writes nothing until you type `confirm` (D8, D18). |
| at a new project | **A spine before the first line.** | `/constitute` asks four gated questions and, on your `confirm`, writes `docs/PRD.md`, `docs/UIUX.md` and `docs/DECISIONS.md`, vendors the witness as `test/docket.js`, and prints a CI step (D9). |
| across time | **What changed in the law?** | `/docket query`, `/docket governs`, `/docket diff`. |

At each session's start the hook prints the docket itself: the last rulings, the rulings cited nowhere, the addenda
no later ruling has answered, the last verdict, and what the witness says.

## The two-second demo

Each output below comes from this repository's fixture, `test/fixture/`: a small note-taking page with nine rulings,
which the tests copy into scratch projects. Its ruling R6 keeps a toolbar.

**At "done": the stop blocked.** The toolbar's removal planted in `app.js`, and the maker asked to stop. This is what
the maker is told, and what you see in the session:

```text
The docket's judge recorded FAIL for this stop's diff (app.js), 2 located failures:
code · F3 · app.js:40 · R6 keeps the toolbar as the replacement for the long-press menu; this diff removes makeToolbar and leaves hideToolbar (app.js:203) and .toolbar (styles.css:9) with nothing to build the bar · reason holds: a menu that must be held open still hides the note it acts on; the long-press menu still exists in openMenu (app.js:63) · restore makeToolbar in app.js, or supersede R6 through /rule
code · F5 · app.js:40 · the diff removes the cites "R6" and "R4" from makeToolbar and no entry or addendum accounts for the removal · reason holds: R4 shape-held, size-uniform fold and R6 toolbar still bind the code (app.js:78) · restore the cites with makeToolbar, or add the ruling or addendum that explains the removal through /rule
Change the code, or supersede the ruling through /rule. This stop cannot stand; the stop that follows this block in the same turn is allowed.
```

Each line is one located failure, its fields joined by ` · `: the pack, the feature, the file and line, what the
judge found, whether the ruling's reason still holds with the line that shows it, and the way out. The two lines are
the ones a judge recorded on this plant in the calibration run of 2026-10-02 (D25); the block around them is the
core relaying them, reproduced with a stand-in for the judge, since a live judge words its lines afresh each run.
`sh test/judge.sh` runs the case live (Tests, below).

**Before the edit: what governs it.** For an edit of `makeToolbar`, at line 41 of the fixture's `app.js`:

```text
Governed here (test/fixture/DECISIONS.md, ±20 lines of app.js:41):
  R6  The toolbar replaces the long-press menu  · issue #12
  R4  Fold similarity: shape held, size uniform
  R2  Positions are never mutated on read
Edges among these: R7 partially reverses R6 (relational plane only); R4 supersedes R3.
Addenda: R2 (2026-09-11).
Also cited: UIUX §4.5 The minimum.
Name the ruling you rely on before you edit.
```

The host hands this to the maker as context before the edit runs. To print it yourself, from a clone:

```bash
printf '{"tool_name":"Edit","tool_input":{"file_path":"%s/test/fixture/app.js","old_string":"function makeToolbar(sel) {"}}' "$PWD" | node bin/docket.js near
```

**At a session's start: the docket.** The same project, after the blocked stop above:

```text
Docket — DECISIONS.md (9 rulings; prefixes A, R)
Last rulings:
  R8  The frame that was never typed into is discarded on blur, and the…  · issue #16
  R7  The relational plane keeps its long-press menu  · issue #14
  R6  The toolbar replaces the long-press menu  · issue #12
Cited nowhere: none
Addenda pending:
  R2 (2026-09-11): the render pass now rounds to the device pixel for drawing only; reading still writes nothing, and…
Last verdict: FAIL at 2026-10-08T07:03:38.667Z (2 located failures)
Judge's report: .docket/judge.log — the last judge's own words, a check it could not run named there
Witness: FAIL (1)
  UIUX.md:9  spec-check a: --line is #7a8fa6 in the spec but #7a8fa7 at styles.css:5
```

The witness's failure is the fixture's own: its stylesheet disagrees with its spec by one hex digit on purpose, so
that `spec-check`, which reads the spec's colour tokens against the CSS, has something to find.

## The ledger

A ruling is a heading and a body. The fixture's R6 and R7, as they are written there:

```markdown
### R6. The toolbar replaces the long-press menu (issue #12)
On the spatial plane a toolbar above the selection carries every action the long-press menu carried, and the menu is gone there. Reason: zero cognitive tax; a menu that must be held open hides the note it acts on.

### R7. The relational plane keeps its long-press menu (issue #14)
This partially reverses R6 (relational plane only): where notes are related by lines rather than placed, the long-press menu stays, because a toolbar above a line has nothing to sit above. The spatial plane keeps the toolbar. Reason: the toolbar's reason (it shows the note it acts on) does not hold for a line.
```

An edge — R7's "partially reverses R6" — uses one of a fixed list of verbs: `supersedes`, `overrides`, `retires`,
`reverses`, `waives`, `extends`, `keeps`, `re-tunes`, `refines`, `replaces`, `corrects`, `revises`; and it must point
at an earlier ruling. Supersession is clause-level: R7 does not mark R6 dead, which is why `governs R6` lists R7's
edge with the clause it states, and the reader judges. A ruling whose reason has changed gets a dated addendum
beneath it, as R2 has one in the fixture:

```markdown
> Addendum 2026-09-11: the render pass now rounds to the device pixel for drawing only; reading still writes nothing, and the rule stands as written.
```

A ledger that already exists is read as it is. Entries written through `docket append` — which `/rule` runs on your
confirm — also satisfy a header contract (D4). The whole grammar is `docs/FORMAT.md`.

## Install

**You need** Node 20 or newer, git, and Claude Code's command-line tool, `claude`. The stop hook starts the judge as
`claude -p`, so `claude` must be on the PATH your sessions run hooks with.

From the project you want governed:

```bash
claude plugin marketplace add AlastairZeved/The-Docket
claude plugin install the-docket@the-docket
```

Both commands declare the plugin for every project of yours; give each `--scope local` to declare it for this
project alone, which is how `test/install.sh` installs it (D50). No allow rule and no `.gitignore` line is needed: the
judge is given its one permission by the hook that starts it (D37), and the docket's own state, `.docket/`, ignores
itself.

Or load it for one session, from a clone:

```bash
git clone https://github.com/AlastairZeved/The-Docket.git
claude --plugin-dir ./The-Docket
```

A repository with no ledger is left alone: nothing prints at an edit, and no judge starts at a stop. Start one with
`/constitute`, or keep your own `DECISIONS.md` — the docket finds the nearest one above each file (D5).

## Use

**Record a ruling.** `/rule` asks five questions, in order, and refuses a vague answer: what changed; the issue; the
principle, from your ledger's own list; every ruling it touches, with a verb; and the ruling in prose, with its
reason, the range it holds over, and the measurement underneath it. It prints the entry under RULING — PLEASE
CONFIRM, as `docket append --dry-run` would write it, and stops. Only your `confirm`, in a turn of your own, writes it
(D8, D18). A maker blocked by the judge cannot amend the ruling it failed.

**Start a project with a spine.** `/constitute` asks four questions: what it is, as one verb on one object; who it
is for, as a role with one thing they know and one they do not — "general audience", "everyone", "users" and the like
are refused; the feeling that must survive every change, which may not be a feature; and at least three things it
will refuse to do. On your `confirm` it writes the triad, vendors the witness, runs the check and prints the CI step.

**Read the law.**

```text
/docket                     the docket
/docket query toolbar       every ruling that matches, with its edges and addenda
/docket governs R6          edges in and out with their clauses, addenda, the code that cites it
/docket diff HEAD~1 HEAD    rulings, edges and addenda added; any existing entry changed, listed first
```

**From a script.** Every subcommand takes `--json`; `docket help` lists them all.

```bash
node bin/docket.js index | node -e 'const j=JSON.parse(require("fs").readFileSync(0));console.log(j.rulings.length)'
node bin/docket.js check && node bin/docket.js status
```

## Tests

What CI runs on every push, and what you run before you stop:

```bash
node test/docket.js     # the witness of the core: one scenario over the fixture, exit 1 on any failure
node bin/docket.js      # the docket's check of this repository's own ledger and cites (D6)
```

`docket check` runs seven checks, each failure one line naming its file and line: every cite names a ruling that
exists; numbering runs without a gap; every `UIUX §x` and `PRD §x` cite names a heading; the bare-`§` count stays
within its recorded allowance; every edge points at an earlier ruling; entries after the contract line satisfy the
header contract; and no committed entry was edited (`docs/FORMAT.md`, section 13).

Four scripts measure what depends on the host and its model. Each needs `claude` and credentials, so none runs in
CI; each prints what it measured, and its result is recorded in the ledger:

```bash
sh test/cites.sh        # the hook: does the maker name and keep the ruling it was shown? (D17)
sh test/constitute.sh   # the intake: refuses a crowd for a reader, halts at its confirm block (D18)
sh test/judge.sh        # the judge: six planted cases, and the calibration gate (D15, D19, D25)
sh test/install.sh      # the plugin installed fresh from this repository, then an edit and a stop (D50)
```

## FAQ

<details>
<summary>Does my law live in the plugin?</summary>

No. It is files in your repository — `docs/PRD.md`, `docs/UIUX.md`, `docs/DECISIONS.md`, or a ledger of your own.
The witness is vendored into your repository as `test/docket.js` (D9), so your CI goes on checking the ledger after
the plugin is gone.

</details>

<details>
<summary>Why is supersession clause-level and not a status column?</summary>

Because a later ruling usually supersedes one clause of an earlier one, or waives it for one case. A "superseded"
status would mark a ruling dead while most of it still binds. The index is a list of edges, and the reader judges
(D3).

</details>

<details>
<summary>What if the maker ignores the hook?</summary>

The judge still reads the stop. The hook informs and never blocks (D1); the judge is the gate whether or not the list
was read. That the list changes what a maker does has not been shown — see Measured Results — which is why this page
leads with the judge (D49).

</details>

<details>
<summary>Will the judge block every stop?</summary>

No. A judge starts only when the session's diff touches a governed file — one that cites a ruling — a ledger, or a
spec document beside one (D10, D40). A change to anything else starts nothing. A session is blocked at most five
times between passes; when its located failures stop going down, the residue goes to you once and the judge stands
down until a PASS or a new session (D11).

</details>

<details>
<summary>Can I use it without Claude Code?</summary>

The core reads JSON on stdin and writes text, exit codes and markdown, and names no host or model (D13).
`docs/PROTOCOL-BINDING.md` binds a second host in three calls: before an edit, at a session's start, and at the stop.
No second host has been bound yet.

</details>

## Contributing

This repository is governed by its own docket (D6): work in it with `claude --plugin-dir .`, and the hook, the judge
and the skills run on it as they would on yours. `CLAUDE.md` says the same to an agent. Before you open a pull
request, run `node test/docket.js` and `node bin/docket.js`; CI runs both.

A decision is a new entry written through `/rule`, never an edit to an old one: `docket check` fails an edited entry
(D4). A change to a number a ruling set needs a ruling that names the one it supersedes, with the measurement that
forced it (D14). A new pack follows `docs/PACKS.md`. A finding is settled by a command whose output shows it, not by
argument.

## License and contact

MIT — see `LICENSE`. Issues and pull requests: [AlastairZeved/The-Docket](https://github.com/AlastairZeved/The-Docket),
maintained by [@AlastairZeved](https://github.com/AlastairZeved).

## Measured Results

Each result is a dated record in the ledger, made headless on the host's command-line tool, on scratch copies of the
fixture, with no model named in the run. A result holds for that host, that date and those runs — not in general.

- **The judge at the stop (D19, D25).** Six scenarios, each a run of `test/judge.sh`: a planted violation of R6, a
  clean rename, a ruling whose reason the diff makes untrue, an unlogged change to a ruled number, an amendment
  through `/rule`, and a ledger entry the maker wrote itself. The latest record, of 2026-10-02 on "version 2.1.287
  (Claude Code)", printed "every outcome: met": each planted case blocked with the verdict and the line the protocol gives
  it, the clean rename passed, and the amendment halted at its confirm block with the ledger unchanged. Every judge
  recorded at its first attempt, and each ended between 23 and 35 seconds after it started. The first record, of
  2026-09-24, held at four stops of five.
- **The stale reading (D25).** In that record's two further runs of the stale case, it met its outcome in 1 of 2; in
  each of the two runs recorded before it, in 2 of 2.
- **The intake (D18).** One run of each measure beside an empty project, 2026-09-23: told the reader was a general
  audience, `/constitute` refused it and wrote nothing, one of one; given four acceptable answers, it printed
  CONSTITUTION — PLEASE CONFIRM and wrote nothing, one of one.
- **The fresh install (D50).** On 2026-10-08, on "version 2.1.294 (Claude Code)": the plugin added from this
  repository's marketplace and installed into a scratch project's local scope, at version 0.1.0. `/constitute`
  reached its confirm block and wrote nothing, one of one. An edit in a governed region printed "Governed here" from
  the installed hook, and the stop's judge recorded a PASS and ended 22 seconds after it started, one of one.
- **The hook (D17, D49).** Asked to edit a governed region, the maker named a ruling from the hook's list in three of
  three runs; told to remove the toolbar, it named R6 and left the toolbar in place in three of three (2026-09-21).
  This is not evidence the list was read: the fixture's code names its rulings in its own comments, no run turned the
  hook off, a re-run scored citing two of three, and in two live runs the harness itself denied the edit the obeying
  measure reads as declined.

## Known Limits

- **The maker can record a verdict (D11).** The maker's session may run the core — `/rule` and `/docket` do — and a
  PASS the maker records passes the diff in front of it as one you record does. What stands in the way is the
  permission to run the core and the call's place in the maker's transcript, where you can read it: the boundary is
  permission and visibility, not cryptography.
- **The judge's permission is a text pattern (D37).** It admits any node command whose text names a `docket.js`, not
  the core alone. The core refuses the judge `append`, `constitute` and `vendor`; nothing refuses another script of
  that name.
- **The stale reading is the weakest (D19, D25, D27).** Whether a ruling's reason still holds after the diff is the
  judge's hardest call: the latest record met the stale case in 1 of 2 further runs, and the first named it the least
  reliable of the five. Every answer the judge gives about a reason carries the line that shows it; read that line.
- **A judge that ends with no record blocks once (D11, D38).** It names how the judge ended and keeps its output in
  `.docket/judge.log`; the next stop in the same turn is allowed. That block counts toward the session's cap, 5
  blocks since the last PASS, as a FAIL does.
- **A stop can take minutes (D42).** The judge is bounded at seven hundred seconds, and the stop hook's timeout is
  seven hundred and thirty. Each judged stop is a headless session of its own, and uses your account as one does.
- **The judge runs on the host's default model (D13, D43).** The binding names no model, so the judge most likely
  shares the maker's model, and its blind spots. A second model is yours to set in the host.
- **What the calibration covers (D25).** Six planted cases on one fixture, read through the code pack and the
  decisions pack. The design and prose packs' features are read by the judge and driven by no planted case.
- **The hook's effect is not shown (D17, D49).** No measurement of the hook has had a control; it informs and never
  blocks, and the judge does not depend on it.
- **One host (D13).** Every measurement ran on Claude Code's command-line tool. `docs/PROTOCOL-BINDING.md` binds
  the core to another host, and none has been bound or measured.
