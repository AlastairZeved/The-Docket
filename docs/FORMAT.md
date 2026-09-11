# FORMAT.md — the ledger grammar

What `bin/docket.js` reads, what `docket append` writes, and what
`docket check` verifies. Everything is stated in terms of files, lines and
text. No host, model or tool is named here (D13).

## 1. Discovery (D5)

The **ledger** of a file is the nearest `DECISIONS.md` or `docs/DECISIONS.md`
found by walking up from the file's own directory to the project root. At each
directory `dir`, `dir/DECISIONS.md` is tried first, then `dir/docs/DECISIONS.md`.
The project root is the environment variable `DOCKET_PROJECT_DIR` when set,
else `CLAUDE_PROJECT_DIR` when set (the first host's name for the same value),
else the git root of the file's directory, else the filesystem root. A file
with no ledger above it is **ungoverned** and is skipped by every subcommand.

The **spec documents** `UIUX.md` and `PRD.md` are looked for in the ledger's own
directory and nowhere else. The first section of `PRD.md` (the spec heading
numbered 1) is where a project's principles live; a ledger with no `PRD.md`
beside it carries them in its preamble (10).

Resolution is per file: `docket check` resolves every git-tracked text file to
its own nearest ledger, so a repository may hold more than one ledger, and an
example `R6` in a file that resolves to a ledger whose prefixes are `{D}` is not
a cite (8).

A **text file** is a git-tracked file whose first 8 KiB contain no NUL byte.
`check`, `governs` and `status` read tracked files; `near` reads the edited file
from disk whether or not it is tracked; `gate` adds untracked governed content
to the diff it hashes. Line endings are normalised on reading: a CRLF ledger
parses, cites and compares line for line exactly as an LF one.

## 2. The entry

An entry begins at a heading line

    ### <P><n>. <heading>

and ends at the line before the next line that begins `### ` or `## `, or at the
end of the file. `<P>` is one or more letters (the **prefix**), `<n>` a positive
integer, and the two together are the **id** (`D7`, `R12`, `A1`). Text before the
first `## ` or `### ` heading is the **preamble**.

An entry parses to

| Field | Meaning |
|---|---|
| `id`, `prefix`, `n` | `R12`, `R`, `12` |
| `line` | the 1-based line of the heading |
| `heading` | the heading text after `<id>. `, verbatim, backticks and bold kept |
| `title` | the heading reduced by the title rule (3) |
| `meta` | the first parenthetical of the heading (4), or empty |
| `issue` | the number in `issue #<n>` inside `meta`, or empty |
| `edges[]` | every edge in the heading and body (5) |
| `addenda[]` | every addendum line under the entry (6) |
| `body` | every line after the heading to the end of the entry, addendum lines included |

`docket index` prints the whole parse of a ledger as
`{ledger, prefixes, rulings[], sections[], specs[]}`.

## 3. The title rule (D7)

The title is the heading text after the id, in three steps and in this order:

1. cut at the first ` (` (a space followed by an opening parenthesis), keeping
   what precedes it;
2. strip backticks and `**`;
3. if what remains is longer than 72 characters, keep the first 72, cut back to
   the last space inside them, trim, and append `…`. A heading with no space in
   its first 72 characters is cut at 71 characters and `…` appended. Characters
   are Unicode code points: `±` and `…` each count as one.

The order matters: a heading whose parenthetical begins before the 72nd
character is cut at the parenthetical, never at 72. The result is never longer
than 72 characters.

## 4. Meta, grounding and issue

The **meta** is the text of the first parenthetical on the heading line: from
the first ` (` to its matching `)`. Its **clauses** are separated by `;`. The
first clause that is not an edge (5) is the entry's **grounding**: `issue #12`,
or a phrase naming the context the ruling answers. `issue` is the number in the
first `issue #<n>` found in the meta.

## 5. Edges and verbs

An **edge** is a verb followed by an id, anywhere in the heading or body:

    [<adverb> ]<verb> <P><n>[ (<qualifier>)]

The verbs, and only these: `supersedes`, `overrides`, `retires`, `reverses`,
`waives`, `extends`, `keeps`, `re-tunes`, `refines`, `replaces`, `corrects`,
`revises`. The optional adverb is one of `partially`, `partly`, `in part`. The
optional qualifier is a parenthetical immediately after the target id. The
entry that contains the text is the edge's **source**; the id named is its
**target**. The edge's **clause** is the sentence that contains it: in the
heading, the meta clause; in the body, the text between the nearest sentence
boundaries (`.`, `;`, or a line break).

An edge renders as `<source> [<adverb> ]<verb> <target>[ (<qualifier>)]`, so
`R7 partially reverses R6 (relational plane only)` is one edge from R7 to R6.

An edge's target must exist and must be defined earlier in the ledger than its
source (a strictly smaller heading line). An edge from a ruling to itself is a
failure (13, check 5). No status is ever computed from edges (D3): `governs`
shows them with their clauses and the reader judges.

## 6. Addenda

An **addendum** is a line under an entry of the form

    > Addendum <YYYY-MM-DD>: <text>

It records that something about the entry has changed without amending the
entry: most often that the entry's stated reason no longer holds. An addendum
is **pending** until a later ruling has an edge into the entry (any verb); the
docket (`docket status`) lists pending addenda. `docket append --addendum <id>
--text <text>` writes one with today's date as the last line of the entry.

## 7. Sections and spec headings

A **section** is a line `## <X>. <title>` where `<X>` is one or more letters;
sections group entries and are indexed for their titles. A **spec heading** is
a heading in `UIUX.md` or `PRD.md` of the form

    #… §<x>[.<y>[.<z>]] <title>

and is cited as `UIUX §<x>.<y>` or `PRD §<x>`. Both are indexed by
`docket index` under `sections[]` and `specs[]`; `near` prints a spec cite with
its title (`UIUX §<x>.<y> <title>`).

## 8. Cites

A **cite** is an id on word boundaries, `<P><n>`, in any text file, where
`<P>` is one of the prefixes of that file's ledger. A cite to a number that
does not exist in that ledger is a failure (check 1). An id whose prefix is not
one of the ledger's prefixes is not a cite and is ignored. Cites inside the
ledger itself are references between rulings, not code cites: `governs` and
`status` count code cites in every governed file except the ledger.

A **governed file** is a text file with at least one cite that resolves.

A **spec cite** is `UIUX §<x>[.<y>[.<z>]]` or `PRD §<x>[.<y>]`; it must resolve
to a spec heading (check 3). A **bare cite** is `§<digits>` not preceded by a
document name; it is counted per file, and the count is ratcheted against the
baseline (9). Spec documents themselves are exempt from the bare-cite count.

## 9. The bare-cite baseline

The ledger preamble may carry one comment

    <!-- docket: bare-cites <file>=<n> <file>=<n> … -->

with paths relative to the ledger's directory. When the comment is present, a
file's bare-cite count may not exceed its allowance, and a file not listed has
an allowance of 0 (check 4). When the comment is absent, counts are reported and
nothing fails. `docket append --baseline` rewrites the comment from the current
counts.

## 10. Principles

The **principles** are the list `docket principles` prints: the bulleted list
under the first section of `PRD.md` when a `PRD.md` sits beside the ledger, else
the bulleted list in the ledger preamble that follows a line containing the
word `Principles`. When neither exists, `principles` prints that it found none
and exits 1, and `append` refuses every entry until one exists. Each item
begins with a bold phrase, which is the principle's name:

    - **One home per value.** Every value lives in exactly one file.

A `Principle:` line in an entry names one by that phrase; matching ignores case
and a trailing period.

## 11. The header contract (D4)

The preamble may carry one comment per prefix

    <!-- docket: contract from <P><n> -->

Every entry of that prefix with a number of `<n>` or more satisfies the
**header contract**; entries before it, and every entry of a ledger with no
contract line, parse loosely (2) and are held to nothing more. The contract:

1. the heading ends with a parenthetical meta (4);
2. the meta's first clause is a grounding, not an edge;
3. every further clause of the meta is an edge, `<verb> <P><m>`, with a verb from
   the list (5);
4. the body has a line beginning `Principle: ` that names a principle (10);
5. the body contains `Reason:`.

`docket append` writes only entries that satisfy it, in this form:

    ### <P><n+1>. <title> (<grounding>; <verb> <P>m; <verb> <P>k)
    Principle: <principle>.
    <body, which contains Reason:>

## 12. Prefixes and numbering

The prefixes of a ledger are the distinct `<P>` of its entry headings. Within a
prefix, numbers are contiguous from 1 in order of appearance (check 2); `docket
append` writes `<P><max+1>` for the prefix given with `--prefix`, else for the
prefix of the ledger's last entry; a ledger with no entry requires `--prefix`
and `append` exits 2 without it.

## 13. What `docket check` verifies

Each failure prints one line, `<file>:<line>  check <k>: <message>`; the exit
code is 1 if any check fails, else 0. A failure names the line of the offending
cite, heading or edge, never only the file.

| k | Check | Fails when |
|---|---|---|
| 1 | Cites resolve | a cite in a git-tracked text file names a number that does not exist in that file's ledger |
| 2 | Numbering | a prefix's numbers are not contiguous from 1 in order of appearance |
| 3 | Spec cites resolve | a `UIUX §x` or `PRD §x` cite names a heading that does not exist in the document beside the ledger, or the document is absent |
| 4 | Bare-cite ratchet | a file's bare-`§` count exceeds its allowance, when a baseline comment is present |
| 5 | Edges point back | an edge's target does not exist, is the source itself, or is defined later than the source |
| 6 | Header contract | an entry bound by the contract line breaks any of the five clauses in 11 |
| 7 | Append only | an existing entry's heading or body differs, line for line, from the committed ledger (`git show HEAD:<ledger>`) other than by appended addendum lines; skipped for a ledger with no committed version |

`docket check --json` prints the same findings as JSON.

## 14. A worked example

    <!-- docket: contract from R6 -->
    <!-- docket: bare-cites app.js=3 -->

    ### R3. Fold similarity (issue #4)
    Notes fold by shape and by size. Reason: one similarity law, not two.

    ### R4. Fold similarity: shape held, size uniform (supersedes R3)
    The shape clause of R3 stands; only its size rule is superseded. …

    ### R6. The toolbar replaces the long-press menu (issue #12)
    …
    > Addendum 2026-09-11: the long-press menu returned on the relational plane; see R7.

    ### R7. The relational plane keeps its long-press menu (issue #14; partially reverses R6 (relational plane only))
    Principle: …
    … Reason: …

R4's title is `Fold similarity: shape held, size uniform` (cut at ` (`); R4 has
one edge, `R4 supersedes R3`, with the clause `supersedes R3`; R7 has one edge,
`R7 partially reverses R6 (relational plane only)`; R6 has one addendum,
resolved by R7's edge into it. `near` on a window that cites R6, R4 and R2
prints the edges touching them and the addendum's date; `governs R3` shows the
in-edge from R4 with its clause; `check` 6 binds R6 and R7, not R3 or R4.

## 15. The pre-edit window (`near`; D1, D2, D7)

`near` reads one edit from stdin — `{"tool_name","tool_input":{"file_path",
"old_string","replace_all"}}` for an edit, `{"tool_name":"Write","tool_input":
{"file_path","content"}}` for a whole-file write — and prints what governs the
region, or nothing. It never exits non-zero on an input it cannot use (D1).

| `old_string` matches | `replace_all` | `near` does |
|---|---|---|
| one | any | the window: 20 lines either side of the match |
| many | `true` | the union of the windows; cap 8 by citation count, then by nearness to the first match |
| many | `false` or absent | silent: the edit tool will reject the edit, and the retry fires `near` again |
| zero, or `old_string` empty | any | silent |
| `Write` of an existing governed file | | the whole file; cap 8 by citation count |
| `Write` of a file that does not exist | | silent |

A window lists at most eight rulings (D2), nearest first, each as
`<id>  <title>` plus `  · issue #<n>` when the entry has one; then the edges
touching any listed ruling (5), each rendered with its qualifier; then the
listed rulings that carry addenda, with their dates; then the spec cites in the
window with their titles (7); then one instruction line. A governed file whose
window cites nothing gets a one-line notice that names the window and says so.
A file that cites nothing anywhere, or has no ledger above it, gets silence.
When the stdin object carries a `hook_event_name`, the same text is printed
inside `{"hookSpecificOutput":{"hookEventName":<that>,"additionalContext":<text>}}`
so a host that reads that shape can inject it; otherwise the text is printed
bare.
