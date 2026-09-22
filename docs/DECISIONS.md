# DECISIONS.md — The Docket

The ledger of this repository's own rulings. The repository is governed by
this file through the plugin it ships (D6): `bin/docket.js` cites the rulings
below where it implements them, the hooks run on this working tree, and the
witness checks every cite. A file a ruling names that is not yet in the tree is
one the ruling anticipates: the law is stated whole from the first commit, and
the mechanisms arrive under it.

| Question | Authority |
|---|---|
| What the ledger grammar is, and what `docket check` verifies | `docs/FORMAT.md` |
| What the judge does, in what order, and what it returns | `judge/PROTOCOL.md` |
| What a pack is and how a feature is scored | `docs/PACKS.md` |
| How a host other than the first binds the core | `docs/PROTOCOL-BINDING.md` |
| Why the plugin does what it does, and what has already been ruled | **this file** |

**Append only.** An entry is superseded, refined, waived or reversed by a later
entry that names it with a verb; it is never edited away. A ruling whose stated
reason no longer holds gets a dated addendum under it first, and a superseding
ruling second. Existing headings and bodies are unchanged from one commit to
the next except for appended addendum lines; the seventh check of `docket check`
enforces it against the committed ledger — `HEAD`'s, or its first parent's when
the ledger in the working tree already equals `HEAD`'s, so that the check in CI
judges the commit it was given: a fresh commit compared with itself would
witness nothing.

**Header contract.** Every entry from D1 on satisfies the header contract in
section 11 of `docs/FORMAT.md`: a heading `### D<n>. <Title> (<grounding>; <edges>)`,
a `Principle:` line naming one of the principles below, and a `Reason:`
sentence.
<!-- docket: contract from D1 -->

**Principles.** Every ruling names the one it resolves against; `docket append`
refuses an entry that names none of these.

- **A rule carries its reason.** A ruling, a number, a feature: each states why it is so, so a later reader can tell whether the why still holds. A rule without its reason can only be obeyed or ignored, never re-examined.
- **One home per value.** Every value, hook, feature and ruling lives in exactly one file. Two homes drift apart, or fire twice.
- **Append, never amend.** The ledger records what was ruled; a later ruling supersedes a clause, and nothing is edited away. A record that can be rewritten proves nothing about what was tried.
- **The maker does not grade its own work.** Whoever changed the code neither spawns the judge nor confirms the ruling it failed. A verdict is worth exactly the independence of its judge.
- **Claim no more than you measured.** A threshold is mechanical or it is an argument; a result is dated and excerpted or it is a slogan; a number preserves a stated property or it is a superstition.

**Bare-cite baseline.** Spec cites in this repository carry their document
(`UIUX §x`, `PRD §x`); no file here has a bare-`§` allowance.
<!-- docket: bare-cites -->

---

## D. Rulings

### D1. Inform at the edit, gate at the stop (the hook that runs before every edit)
Principle: Claim no more than you measured.
The pre-edit hook never denies; the judge at stop can. The hook prints what governs the edited region and asks the maker to name the ruling it relies on; the judge reads the whole diff against the rulings and blocks a stop that contradicts one. Reason: a mechanical deny would block on a cite it cannot understand; a semantic judgment belongs where the whole diff is visible.

### D2. Window ±20 lines, cap 8, nearest first (how much a person reads before an edit)
Principle: Claim no more than you measured.
The pre-edit hook lists the rulings cited within 20 lines either side of the edited line, at most eight, nearest first. Reason: a ledger-governed codebase runs about one citing line per 12 lines of code; ±20 yields four to six rulings, a list a person reads; the enclosing function would dump twenty. The fixture in `test/fixture/` is built at that density so the number is testable here.
> Addendum 2026-09-18: Measured on the fixture the ruling says is built at that density: 260 lines of code with 20 citing lines is one per 13, not one per 12, and a window centred on a citing line holds two to five rulings, a mean of 3.5 — across every line of the file, zero to five, a mean of 2.67. Six never occurs, and the cap of eight is never reached. The window and the cap stand; the estimate that motivated them was high, and this records what the fixture yields rather than what the reason predicted.
> Addendum 2026-09-21: The mean in the addendum above is wrong by a hundredth: 2.67 came from dividing the 696 rulings-per-window by 261 rather than 260, counting the empty string after the file's last newline as a line of it. Over the file's 260 lines the mean is 2.676923, which this repository's own rounding writes as 2.68. Every other number in that addendum holds — 260 lines, 20 citing lines, one per 13, two to five in a window centred on a citing line with a mean of 3.5, zero to five across every line. The witness now counts the fixture's lines as the file has them, so the arithmetic cannot drift back.

### D3. The index is an edge list, never a status table (supersession is clause-level)
Principle: Claim no more than you measured.
`docket governs <id>` shows the chain in and out of a ruling with each edge's clause text; the reader judges. No command computes a "superseded" status. Reason: supersession in a real ledger is clause-level (a later ruling supersedes one clause of an earlier one, or waives it for one case); a computed "superseded" status would declare a ruling dead while most of it still binds.

### D4. Two-tier format (a ledger that already exists cannot be migrated)
Principle: Append, never amend.
Existing entries parse loosely; entries written through `docket append` satisfy the header contract; addenda are dated lines under an entry. The contract line in a ledger's preamble names the first entry it binds. Reason: append-only ledgers cannot be migrated; the contract applies only to what is not yet written.

### D5. Zero config (where the ledger is, and what governs a file)
Principle: One home per value.
A file is governed if it cites a ruling that exists; the ledger is the nearest `DECISIONS.md` or `docs/DECISIONS.md` walking up from the edited file; prefixes are read from headings; spec documents sit beside the ledger. Nothing is configured anywhere else. Reason: a value with two homes has no home.

### D6. The repo governs itself (a law that does not bind its author)
Principle: One home per value.
`bin/docket.js` cites D-numbers where it implements them; all three hooks run on this repo through `claude --plugin-dir .`, which `CLAUDE.md` names as the only way to work here; its own CI runs its own witness. There is no `.claude/settings.json`: it would duplicate the plugin's own hooks and fire `near` twice per edit. Reason: a law that does not bind its author is a suggestion, and a hook with two homes fires twice (D5).

### D7. The four located rules (cases cheap to decide now, expensive to discover in use)
Principle: A rule carries its reason.
(1) Non-unique `old_string`: without `replace_all`, the hook is silent, because the edit tool will reject the edit and the retry fires the hook again; with `replace_all`, the union of the windows, capped at eight by citation count and then by nearness to the first match. (2) Title truncation: a title is the heading after its id, cut at the first ` (`, backticks and bold stripped, then at the last word boundary before 72 characters with `…`. (3) The wedge is measured: whether a maker names a ruling from the injected list, and whether it surfaces a conflict the list forbids, are counted in headless runs and recorded in this ledger as a dated result. (4) STALE and the addendum: a ruling contradicted whose stated reason no longer holds is STALE, routed to a dated addendum under it, not to a new ruling and not to a FAIL. Reason: cheap to decide now, expensive to discover in use.
> Addendum 2026-09-13: a fifth located rule, found by the fixture: a governed file whose edit window cites no ruling gets a one-line notice naming the window, so the maker learns the file is governed without a list to read (FORMAT.md 15); a file that cites nothing anywhere stays silent.

### D8. The harness runs the judge, and the human confirms the law (who may grade, and who may amend)
Principle: The maker does not grade its own work.
The judge is a stop-time agent named by `agents/docket-judge.md`, with Write, Edit and NotebookEdit denied. `/rule` ends at a confirm block that only the human can answer, so a maker blocked by the judge cannot amend the ruling it failed. Where the host lets a subagent run on a model other than the maker's, the judge is bound that way (`docs/PROTOCOL-BINDING.md` says so without naming one): shared training is shared blind spots, and a second mind is a cheaper independence than a second process. The confirm block is product behaviour; `test/judge.sh` tests it by observing a headless run halt at it with the ledger unchanged. Reason: the maker cannot grade its own homework if it does not spawn the grader, and cannot move the goalposts if it cannot confirm its own ruling.

### D9. The witness is vendored (the law's witness must run where the law lives)
Principle: The maker does not grade its own work.
`/constitute` copies `bin/docket.js` into the target repo as `test/docket.js` and adds a CI step that runs it. Reason: the law's witness must run where the law lives, in CI, with the plugin uninstalled. One file, no dependencies, MIT, so vendoring costs nothing.

### D10. Scale trigger (two models and five cycles for a one-line change)
Principle: Claim no more than you measured.
The judge scores only when the diff since the last PASS touches a governed file or the ledger; `docket gate` decides by the hash of that diff and answers `SKIP` otherwise. Reason: two models and up to five cycles for a one-line change is absurd; the trigger is mechanical, so it cannot be argued with.

### D11. Non-convergence surfaces (a judge that never passes, and one that always passes)
Principle: Claim no more than you measured.
Cap 5 blocks per session since the last PASS; if located failures do not decrease after the third, `gate` returns `SURFACE` and the judge blocks one final time with the residue and the instruction "report this to the user verbatim, then stop again"; `gate` records the session as surfaced and answers `SKIP` from then until a PASS or a new session; `stop_hook_active` is honoured. Reason: a judge that never passes and one that always passes are both broken, and the residue must reach the human through the maker's own reply, because an allowed stop carries no message.

### D12. Packs are files (the judge is only as good as its feature set)
Principle: One home per value.
A pack is a markdown file of numbered measurable features per domain; the judge reads the pack(s) for the domains the diff touches, and scores only governed files. Reason: the judge is only as good as its feature set, and a feature set in a file can be diffed, cited and improved without touching the judge.

### D13. The core is host-agnostic; the host binding is thin (the law should outlive the tool that first ran it)
Principle: One home per value.
`bin/docket.js`, `packs/`, `intake/`, `templates/`, `docs/FORMAT.md` and `judge/PROTOCOL.md` name no host, no model and no vendor; they speak stdin JSON, stdout text, exit codes and markdown. `hooks/hooks.json`, `agents/docket-judge.md` and `skills/` are the Claude Code binding, each a few lines that point at a core file. The judge runs on whatever model the host gives a subagent; no model is named anywhere. Reason: the law and its judge should outlive the tool that first ran them; a second host binds the same core with a second thin layer, and nothing else moves.

### D14. A number and the property it preserves are both rulings, and neither wins by default (a number that outlives its purpose)
Principle: A rule carries its reason.
Every number in this repository (±20 lines, cap 8, 72 characters, 5 blocks, the third cycle) exists to preserve a stated property (a list a person reads; one line of context; a cap that binds). When a measured case shows the number and its property in conflict, the conflict is never settled silently by either side: a new ruling supersedes one of them, names which, and logs the reason and the measurement that forced it. The judge treats an unlogged change to a ruled number as a located failure (route: supersede via `/rule`), and treats a number that demonstrably defeats its property as STALE (route: addendum, then a superseding ruling). Reason: a number that outlives its purpose is a superstition, and a property that cannot be re-measured is a slogan; the ledger exists so that neither survives unexamined.
> Addendum 2026-09-21: The numbers added since this ruling was written, each under it from now: the ledger numeral's ceiling of fifteen digits, which keeps an id exact (FORMAT.md 2); the walk's bound of twenty thousand entries, which stops the enumeration of a tree that is not a repository from reading a disk (FORMAT.md 1); the append lock's wait of five seconds, which is long enough for a write and short enough to say so; and the eight thousand bytes a file is sniffed over to tell text from binary, which is git's own window and is the property that keeps the two agreeing.
> Addendum 2026-09-22: The number added at the phase that builds the intake: REFUSALS_MIN, three, the least a constitution's refusals may number. One refusal is a mood and two are a pair; three draw a boundary. The count is the plan's own, and constitute names the field and the count when it refuses fewer.

### D15. A judge is trusted only after it has failed planted defects (a judge that passes a broken build)
Principle: Claim no more than you measured.
No verdict from the judge counts until, on the same protocol and packs, it has returned FAIL or STALE on every planted case in `test/judge.sh` and PASS on the clean one; a change to the protocol or to a pack re-runs the calibration before the next verdict counts. A judge that passes a deliberately broken build is not a judge. Reason: a judge that never fails and one that always fails are indistinguishable without a known-bad case, and the cheapest known-bad case is one you planted yourself.

### D16. The window's yield is what the fixture measures, not what its reason estimated (the ledger's own D14, applied to D2; partially supersedes D2 (the yield clause alone, not the window or the cap))
Principle: Claim no more than you measured.
D2 reasons that a ledger-governed codebase runs about one citing line per twelve lines of code, and that the window therefore yields four to six rulings. The fixture it names as the place that number is testable yields neither: 260 lines with 20 citing lines is one per thirteen, a window centred on a citing line holds two to five rulings, and across every line of the file zero to five. Six never occurs and the cap of eight is never reached.

The window of twenty lines either side and the cap of eight stand, and this ruling changes neither. What it supersedes is the yield clause: the range a reader should expect from that window is two to five, and the reason to hold the list at eight is that a window can be denser than this fixture, not that this fixture reaches it.

Reason: the measurement is the rule and the estimate was only the argument for it, so a document that states both cannot go on stating the one the measurement contradicts. D2 carries an addendum recording what the fixture yields, and under D14 a measurement that disagrees with a ruled number is settled by a ruling that names which side it supersedes, not by an addendum that leaves both standing.

### D17. The wedge holds: the reader names the ruling and declines to break it (the wedge measured at the phase that binds the hook to a host)
Principle: Claim no more than you measured.
Three runs of each measure, on scratch copies of the fixture, through the plugin directory, with no model named anywhere in the run. Citing: asked to edit a governed region, the assistant text carried a ruling from the injected list in three of three. Obeying: told to remove the toolbar, which the fixture ledger's `R6` preserves, the assistant named `R6` and left it in place in three of three. One run said, on 2026-09-21: "The file is governed by test/fixture/DECISIONS.md (`R6`: the toolbar replaces the long-press menu)." The list reached the reader on every run, reported in its own column and counted into neither score, so a citation is not the reader having read the file for itself. Reason: the hook claims that a maker given the list reads it, and a claim about a reader is worth exactly what it measures; six of six says the wedge holds at this size, so this repository leads with the window before the edit rather than with the judge after it. What this does not measure: no run was made with the hook switched off, so it shows a reader naming the ruling it was given, not that the ruling rather than ordinary caution about a destructive edit stayed its hand. A control belongs in the next measurement of this kind.
> Addendum 2026-09-21: What this measured is confounded, found by readers who were given the build and not this ruling. First, the fixture defeats it: the governed file names its own rulings in comments on the very lines both prompts send a reader to, so the tokens each measure greps for are reachable from the file itself with the hook broken, unwired or unread. The limit recorded above — that no run was made with the hook switched off — does not cover this, because those comments are in the file whether the hook fires or not. Second, the counts have not reproduced: one re-run scored citing two of three, and another scored obeying zero of one on a reading the rule allows and the script did not. Third, and it undoes the obeying measure outright, the script asserts that its permission flag makes the edit available so that refusing it must be the reader's own act; in two live runs the harness denied the edit itself as a sensitive file, which is the exact condition the script names as the one that would make a held file say nothing. So the three of three above is not evidence for the sentence this ruling states. The ruling stands as written because this ledger appends and does not amend, and what stands with it is this: a measurement of this kind needs a governed region that does not name its rulings in its own text, a run with the hook off as a control, and a check that the edit was truly available before a file left unchanged is read as a refusal.

### D18. The intake escalates once, restates once, and stops; only the human confirms (a vague answer at the intake; extends D8)
Principle: The maker does not grade its own work.
The intake for a ruling and the intake for a constitution escalate the same way. A vague answer gets one clarification, phrased as the question the answer left open. A second vague answer to the same question gets the requirement restated as a checklist — each thing an acceptable answer contains, on its own line — and the question asked once more. There is no third attempt: a third vague answer ends the intake, writes nothing, and says so. At the end of either intake the entry is printed whole under a PLEASE CONFIRM heading and the intake stops. Only the human confirms: the word confirm, from the person, in a turn of their own. Silence is not confirmation; a model's own turn is not confirmation; a restatement of the entry is not confirmation; any other reply reopens the question it bears on, and nothing is written before the word. The intake logic lives in intake/RULE.md and intake/CONSTITUTE.md, host-agnostic (D13); the skills that bind them are a few lines each, and the mechanical half of a constitution is docket constitute. Reason: a vague answer to the intake silently corrupts every rule written from it, and an intake that goes on asking accepts in the end the answer it should have refused; and a maker that could confirm its own ruling, or let silence confirm it, could move the goalposts it was blocked by, which is the one thing the confirm block exists to prevent.
