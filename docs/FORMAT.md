# FORMAT.md — the ledger grammar

What `bin/docket.js` reads, what `docket append` writes, and what
`docket check` verifies. Everything is stated in terms of files, lines and
text. No host, model or tool is named here (D13).

**Reader.** Whoever implements or checks a docket core, in any language; they
know git, Markdown and regular expressions, and they do not know this
repository's rulings. **Purpose.** State the ledger grammar so that two
implementations parse one ledger identically. **Source.** D1–D7 and D9 in
`docs/DECISIONS.md`, and the code in `bin/docket.js` that follows them.

## 1. Discovery (D5)

The **ledger** of a file is the nearest `DECISIONS.md` or `docs/DECISIONS.md`
found by walking up from the file's own directory to the project root. At each
directory `dir`, `dir/DECISIONS.md` is tried first, then `dir/docs/DECISIONS.md`.
The project root is the environment variable `CLAUDE_PROJECT_DIR` when set and
the file lies under it (the host's project directory; a second host sets the
same variable to its own before it calls the core), else the git root of the
file's directory, else the filesystem root. The root bounds the walk and never
redirects it: the variable bounds only the tree it holds, so when it names a
directory the file does not lie under, the file's git root is the bound, and the
filesystem root when there is none. A ledger file with no entries governs nothing, and still ends
the walk: nothing above it is consulted, so an empty ledger placed in a subtree
declares that subtree ungoverned — none of the seven checks runs on its files —
and `check` says so with an info line. A file
with no ledger above it is **ungoverned** and is skipped by every subcommand.

The **spec documents** `UIUX.md` and `PRD.md` are looked for in the ledger's own
directory and nowhere else. The first section of `PRD.md` (the spec heading
numbered 1) is where a project's principles live; a ledger with no `PRD.md`
beside it carries them in its preamble (10).

Resolution is per file: `docket check` resolves every git-tracked text file to
its own nearest ledger, so a repository may hold more than one ledger, and an
example `R6` in a file that resolves to a ledger whose prefixes are `{D}` is not
a cite (8).

A ledger's **home** is the directory that holds it, or that holds the `docs/`
holding it: `docs/DECISIONS.md` has the project root as its home;
`test/fixture/DECISIONS.md` has `test/fixture/`. Paths printed by `near` and
listed in the bare-cite baseline (9) are relative to the home.

A **text file** is a file whose first 8000 bytes contain no NUL byte — git's
own sniff for a binary, so the two agree on what is text, which is the property
the number preserves (D14); a text file is then read in full. `check`, `governs` and `status` walk the git-tracked text files;
`near` reads the edited file from disk whether or not it is tracked; `gate` adds
untracked text files that cite a ruling to the diff it hashes. Line endings are
normalised on reading, the working tree's file and the committed version alike:
CRLF and LF both end a line, a bare CR does not, and a CRLF ledger parses, cites
and compares line for line exactly as an LF one, whatever a checkout's
line-ending settings made of either side. A ledger saved with bare CR endings
alone is one line, so it has no entries, and the info line above names it.

The **enumeration root** — the tree `check`, `spec-check`, `status`, `governs`
and the witness read — is the working directory's project root by the same
rule; with neither variable nor git root it is the home of the nearest ledger
above the working directory, else the working directory itself, while the
walk's bound stays the filesystem root. A walk goes up, so a ledger below the
working directory is never found by one: when no ledger governs the working
directory, `status` names the ledgers below it and the error of a command that
needs one names them too (a tree the host names or git tracks is searched for
them; a bare directory is not). `--ledger <path>` names the ledger outright for
`index`, `query`, `governs`, `principles`, `status`, `spec-check` and `append`,
and the root becomes that ledger's own, so the check that follows an `append`
covers the ledger's tree; `check` and the bare witness cover every ledger under
the root, take no `--ledger`, and exit 2 if given one.

## 2. The entry

An entry begins at a heading line

    ### <P><n>. <heading>

and ends at the line before the next entry heading or the next line that begins
`## `, or at the end of the file. `<P>` is one or more ASCII letters, `A`–`Z` or `a`–`z` (the
**prefix**), `<n>` a positive integer of at most fifteen ASCII digits with no leading zero (`D01` is not an entry, nor is a sixteen-digit numeral: fifteen keeps the number exact), and the two together are
the **id** (`D7`, `R12`, `A1`). A heading whose prefix uses any other letter is
not an entry. A line that begins `### ` and is not an entry heading — a leading
zero, a digit in the prefix, no `. ` after the id — ends nothing: it is body text
of the entry above it, or preamble when no entry precedes it, and every check
reads it there. Text before the first entry heading or `## ` line is the
**preamble**.

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
`{ledger, prefixes, contractFrom, baseline, rulings[], sections[], specs{}}` —
`contractFrom` the header-contract line's prefixes and numbers (11), `baseline`
the bare-cite baseline (9) or null when the comment is absent, `specs` an object
with a `UIUX` and a `PRD` key, each the document's headings (7) or null when the
document is absent.

## 3. The title rule (D7)

The title is the heading text after the id, in three steps and in this order:

1. cut at the first ` (` (a space followed by an opening parenthesis) that lies
   outside a backtick span, keeping what precedes it — a parenthesis inside
   inline code is part of the code, not the meta; an unpaired backtick is a
   literal character and opens no span (as in CommonMark), so a heading with an
   odd number of backticks has no code span;
2. strip backticks and `**`;
3. if what remains is longer than 72 characters (a title of exactly 72 is kept
   whole), keep the first 72, cut back to the last space inside them (the ASCII
   space; the heading text is trimmed, so it never begins with one), trim, and
   append `…`. A heading with no space in
   its first 72 characters is cut at 71 characters and `…` appended. Characters
   are Unicode code points: `±`, `…` and an emoji such as `🜲` each count as
   one, whatever their length in a host language's string units. The cut falls
   between code points: a combining sequence that straddles it is split, a price
   paid only by a heading with no space in its first 72 code points.

The order matters: a heading whose parenthetical begins before the 72nd
character is cut at the parenthetical, never at 72, and the marks are stripped
before the count so that 72 counts the characters a reader sees, not the
backticks and asterisks around them. The result is never longer than 72
characters.

## 4. Meta, grounding and issue

The **meta** is the text of the first parenthetical on the heading line that
lies outside a backtick span: from the first `(` that begins the heading or
follows a space to its matching `)`. A heading that is only its parenthetical
has an empty title and a meta. Text after the meta's closing parenthesis is
neither title nor meta: a bound entry then fails check 6 (its heading does not
end with its meta), and a loose entry is held to nothing (D4), so an edge
written there is not read. Its **clauses** are separated by `;`. The
first clause that is not an edge (5) is the entry's **grounding**: `issue #12`,
or a phrase naming the context the ruling answers. `issue` is the number in the
first `issue #<n>` found in the meta. `append` refuses, before writing, an
`--issue` that holds `;`, `(` or `)` and an edge qualifier that holds `;`, since
either would split or close the meta it writes; the same `--edge` given twice
is written once.

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
The same edge stated twice — in the heading's meta and again in the body — is
one edge, and its clause is the first statement. One verb may name several
targets joined by `/` (`keeps R1/R2`): that is one edge per target, all with
the same clause.

Text inside backticks is quoted, not asserted: `supersedes R3` inside a code
span describes an edge and creates none, which is how prose talks about an
edge it does not make. The verbs are recognised in this one form and no other —
`superseded R3` and `superseding R3` make no edge — save that a verb or adverb
may open a sentence with a capital, `Supersedes R3` or `In part reverses R6`,
and is recorded in lowercase; and a sentence that needs a
verb of the list beside an id it does not mean to bind quotes the id. An edge's target must exist and must be defined earlier
in the ledger than its source (a strictly smaller heading line). An edge from a ruling to itself is a
failure (13, check 5). No status is ever computed from edges (D3): `governs`
shows them with their clauses and the reader judges.

## 6. Addenda

An **addendum** is a line under an entry of the form

    > Addendum <YYYY-MM-DD>: <text>

It records that something about the entry has changed without amending the
entry: most often that the entry's stated reason no longer holds. An addendum
is **pending** until a later ruling has an edge into the entry (any verb); the
docket (`docket status`) lists pending addenda. `docket append --addendum <id>
--text <text>` writes one with today's date as the last line of the entry;
`append` refuses a `--body` that carries an addendum line, so an addendum is
dated by the tool and never by hand.

## 7. Sections and spec headings

In a ledger, a **section** is a line `## <X>. <title>` where `<X>` is one or more
ASCII letters, `A`–`Z` or `a`–`z`; sections group entries and are indexed for
their titles. A `## ` line of any other form ends nothing: it is body text of
the entry above it, or preamble, as a `### ` line that is not an entry is (2). A **spec heading** is
a heading in `UIUX.md` or `PRD.md` of the form

    #… §<x>[.<y>[.<z>]] <title>

and is cited as `UIUX §<x>.<y>` or `PRD §<x>`. Both are indexed by
`docket index` under `sections[]` and `specs[]`; `near` prints a spec cite with
its title (`UIUX §<x>.<y> <title>`).

## 8. Cites

A **cite** is an id on word boundaries, `<P><n>`, in any text file, where
`<P>` is one of the prefixes of that file's ledger. A word boundary is where a
letter, digit or underscore — in any script, not only ASCII — meets a character
that is none of these: `styléR9` is one word and not a cite, `→R7` is a cite.
Edges (5) and spec cites (below) share the rule. A cite to a number that
does not exist in that ledger is a failure (check 1); `<n>` has the grammar of 2
(`D05` is not a cite). An id whose prefix is not
one of the ledger's prefixes is not a cite and is ignored. An id inside a code
span (backticks) is quoted, not cited, in every text file, as an edge inside one
is quoted and not asserted (5): the `D7` in section 2 is an example, not a
reference, and check 1, `near`, `governs` and `status` pass over it. Cites inside the
ledger itself are references between rulings, not code cites: check 1 requires
them to resolve like any other, and `governs` and `status` count code cites in
every governed file except the ledger. A fenced code block — a line that
begins with three backticks opens it, the next such line closes it — is quoted
like a code span: no id, spec cite or bare cite inside it is counted, so a
document may quote a ledger's output or another project's rulings.

A **governed file** is a text file with at least one cite that resolves. A
**ledger document** — any file named `DECISIONS*.md`, the ledger itself or a
frozen copy of it — has its cites checked (check 1) but is never governed code:
`governs`, `status` and `gate` leave it out of code cites and governed files,
and `near` is silent for an edit inside one: the ledger is amended through
`append` (11), and a direct edit is check 7's business.

A **spec cite** is `UIUX §<x>[.<y>[.<z>]]` or `PRD §<x>[.<y>[.<z>]]`, the same
depth the heading grammar allows (7); it must resolve to a spec heading
(check 3). A **bare cite** is `§<digits>` not preceded by a
document name; it is counted per file, and the count is ratcheted against the
baseline (9). Spec documents themselves are exempt from the bare-cite count.

## 9. The bare-cite baseline

The ledger preamble may carry one comment

    <!-- docket: bare-cites <file>=<n> <file>=<n> … -->

with paths relative to the ledger's home (1). When the comment is present, a
file's bare-cite count may not exceed its allowance, and a file not listed has
an allowance of 0 (check 4); the comment may list no file at all, and then every
file's allowance is 0. When the comment is absent, counts are reported and
nothing fails. `docket append --baseline` rewrites the comment from the current
counts; on a tree with no bare cites that is the empty comment, the strictest
baseline.

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

Both are read outside code spans and fenced blocks (5): a `Reason:` or a
`Principle:` line quoted in code is an example, not the statement.

`docket append` writes only entries that satisfy it, and refuses — before
writing, since the ledger is append only — an entry whose title or body names a
ruling that does not exist (the entry's own id excepted); it writes in this form:

    ### <P><n+1>. <title> (<grounding>; <verb> <P>m; <verb> <P>k)
    Principle: <principle>.
    <body, which contains Reason:>

## 12. Prefixes and numbering

The prefixes of a ledger are the distinct `<P>` of its entry headings. Within a
prefix, each entry's number is its position among that prefix's entries — 1, 2,
3… in order of appearance, so a gap, a repeated id and an entry out of order all
fail (check 2), and a repeated id resolves — for a cite, `query`, `governs` and
`near` — to the first entry bearing it, the one at its position; `docket
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
| 2 | Numbering | an entry's number is not its position among its prefix's entries in order of appearance: a gap, a repeated id, an entry out of order |
| 3 | Spec cites resolve | a `UIUX §x` or `PRD §x` cite names a heading that does not exist in the document beside the ledger, or the document is absent |
| 4 | Bare-cite ratchet | a file's bare-`§` count exceeds its allowance, when a baseline comment is present |
| 5 | Edges point back | an edge's target does not exist, is the source itself, or is defined later than the source |
| 6 | Header contract | an entry bound by the contract line breaks any of the five clauses in 11 |
| 7 | Append only | an entry of the committed ledger is missing from the working tree's ledger, or its heading or body differs there, line for line, other than by appended addendum lines — the committed entries are the ones enumerated, so a removed entry fails as a changed one does; the committed ledger is `HEAD`'s, or its first parent's when the ledger in the working tree already equals `HEAD`'s (so a check run on a fresh commit, as in CI, judges the commit it was given, never a commit against itself), both read with the normalisation of 1; skipped when no such version exists — a ledger not yet committed, or a clean tree whose `HEAD` has no parent — and an info line names the ledger whose check 7 was skipped, so a skip is never mistaken for a pass |

Check 7's reference point — the first parent when the ledger is unchanged since
`HEAD` — is a rule of this repository's ledger, stated with its reason in the preamble of
`docs/DECISIONS.md` beside the append-only law it enforces.

`docket check --json` prints the same findings as JSON. Run with no subcommand,
`docket` is the witness: `check` over the tree and `spec-check` for the nearest
ledger, exit 1 on any failure (D9); `docket vendor <dir>` copies the core to
`<dir>/test/docket.js`, so a repository runs that witness without the plugin.
`docket check` covers every ledger in the tree; `docket spec-check` covers the
ledger nearest the working directory (a fixture ledger under `test/` is reached
from inside it, or with `--all`). It reads two kinds of row in `UIUX.md`: a
**token row**, whose first two cells are a `--token` and a hex colour of 3, 4,
6 or 8 digits, checked against every CSS declaration of that token (a); and a
**contrast row**, a table row holding token names and an `N:1` value, which
names exactly two tokens or fails, and whose ratio is recomputed from the two
hexes to two decimals (b): the stated ratio is rounded half-up on its written
digits, the recomputed one on its value, and the two are compared in hundredths. `governs <id>` names the ledger it searched and
exits 2 when `<id>` is not one of its entries; `query <term>` prints that nothing
matches and exits 0; `diff` exits 2 when a revision or file cannot be read.

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
resolved by R7's edge into it. `near` on a window that cites R6, R4 and R3
prints the edges touching them and the addendum's date; `governs R3` shows the
in-edge from R4 with its clause; `check` 6 binds R6 and R7, not R3 or R4.

## 15. The pre-edit window (`near`; D1, D2, D7)

`near` reads one edit from stdin — `{"tool_name","tool_input":{"file_path",
"old_string","replace_all"}}` for an edit, `{"tool_name":"Write","tool_input":
{"file_path","content"}}` for a whole-file write — and prints what governs the
region, or nothing. It never exits non-zero on an input it cannot use (D1).

| `old_string` matches | `replace_all` | `near` does |
|---|---|---|
| one | any | the window: the 20 lines before and the 20 after the matched line — the line where the match begins — both inclusive (41 lines), clamped to the file; at most eight rulings, nearest first, a ruling cited more than once ranked by its nearest cite |
| many | `true` | the union of the windows — a line inside two overlapping windows is read once, at its distance to the nearest match, and two matches on one line are one anchor; the eight most cited within it, nearest to the first match among equals, then the earlier line, then the earlier on that line, listed in that order |
| many | `false` or absent | silent: the edit tool will reject the edit, and the retry fires `near` again |
| zero, or `old_string` empty | any | silent |
| an edit of a file that does not exist | any | silent: there is no region to govern, and the edit tool refuses the edit |
| `Write` of an existing governed file | | the whole file; the eight most cited, earliest first among equals |
| `Write` of an existing file that cites nothing | | silent |
| `Write` of a file that does not exist | | silent |

The text opens with one line naming the ledger and the region —
`Governed here (<ledger>, ±20 lines of <file>:<line>):` — the ledger's path
relative to the project root (when the directory the host names is not an
ancestor of the ledger, relative to the ledger's git root, and absolute when
there is none), the file's relative to the ledger's home. A union
names each matched line once, `<file>:70, 140, 210`, the first eight and then
`+<n> more`: the count tells the maker how much denser the region is than the
list shows, and the list stops where the ruling list does so that the hook's
text stays short enough to be read at every edit; a whole-file write says
`whole file <file>`. `near --json` prints the same window as one object —
`ledger`, `file`, `mode`, `anchors`, `region`, `rulings` (id, title, issue,
count, line), `more`, `edges`, `addenda`, `specCites`, `notice` — and is silent
exactly where the text is.

Under it the window lists at most eight rulings (D2) in the order its row gives
— a single window nearest first, ties by line order, the earlier line first —
each as
`<id>  <title>` plus `  · issue #<n>` when the entry has one, and when more
than eight are cited a last line `  +<n> more` (a cap that hid its own overflow
would settle a conflict silently, D14); then the edges
touching any listed ruling (5), each rendered with its qualifier; then the
listed rulings that carry addenda, with their dates; then the spec cites in the
window with their titles (7); then one instruction line. A governed file whose
window cites nothing gets a one-line notice that names the window and says so.
A file that cites nothing anywhere, or has no ledger above it, gets silence.
When the stdin object carries a `hook_event_name`, the same text is printed
inside `{"hookSpecificOutput":{"hookEventName":<that>,"additionalContext":<text>}}`
so a host that reads that shape can inject it; otherwise the text is printed
bare. Silent means nothing is printed at all — no wrapper with an empty context —
and the exit code is 0, with or without a `hook_event_name`.
