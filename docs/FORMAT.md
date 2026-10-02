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
found by walking up from the file's own directory, as the filesystem resolves it
(a path through a symbolic link walks from where the link leads), to the project
root. At each
directory `dir`, `dir/DECISIONS.md` is tried first, then `dir/docs/DECISIONS.md`.
The project root is the git root of the file's directory, whatever directory the
host names, so that every command reads the tree the stop judges (D44); outside a
repository it is the environment variable `CLAUDE_PROJECT_DIR` when set and the
file lies under it (the host's project directory; a second host sets the same
variable to its own before it calls the core); else the filesystem root. The root
bounds the walk and never redirects it: the variable bounds only the tree it
holds, so when it names a directory the file does not lie under, the filesystem
root is the bound. A ledger file with no entries governs nothing, and still ends
the walk: nothing above it is consulted, so an empty ledger placed in a subtree
declares that subtree ungoverned — none of the seven checks runs on its files —
and `check` says so with an info line. Such a ledger holds no line that begins
`### `, fenced or not (a fence quotes cites, not headings, 8): one that does
reads as though it rules and would rule
nothing — its headings fail the grammar (2), or a bare CR began them — and check 2
fails at the first such line, its lines read for this one question as its author
ended them, a bare CR ending one (13, D39). Nor does it hold a line that reads
as an entry heading in another form — another number of `#`, no space after
them, bold, or the id alone at a line's start (`## R1.`, `###R1.`, `**R1.**`,
`R1.`) — and check 2 fails at the first such line too. And a ledger is UTF-8
text: one that a UTF-16 byte order mark opens reads as no entries at all, and
one that holds a NUL byte is not text (1), so check 2 fails either at its first
line (D45). A file
with no ledger above it is **ungoverned** and is skipped by every subcommand,
before it is read: the walk looks at each directory's ledger once, and a file
under none is not opened, so a tree the docket does not govern costs the listing
of its names (D14's addendum) — save a file named `docket.js`, read wherever it
lies to tell the vendored witness (D9).

The stop's commands take the same root: `gate`, `verdict` and `stop`, and the
state, verdict log and trail they keep under `.docket/`, root at the git root of
the working directory, as every command does; outside a repository, at the root
the stop passed to the judge it started, `DOCKET_ROOT`, when the working
directory lies under it, else as above. The host names a project directory to its
command hooks and none to the judge's shell, so the stop hands its root down and
its two halves keep one state (D28, D44). The core's breadcrumb, `.docket/core`,
is written under the same root, the project's.

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
Where the root is not a git repository there is no tracked set, so the walk of
the tree stands in for one: it reads at most twenty thousand entries, refuses
past that rather than reading a whole disk, and follows a symlink to a file
inside the root (a link out of it, or one leading nowhere, is not the tree's
file), so that the walk, `git ls-files` and `near` agree on what is there. Past
the bound, a tree with no ledger between the working directory and the root is
read as the ungoverned tree it would be — the gate answers `SKIP`, `stop` allows,
and `status` names no ledger below it — since the hooks do not tax a project the
docket does not govern; a ledger deeper in such a tree is not looked for, and with
one between the working directory and the root the refusal stands.
`near` reads the edited file from disk whether or not it is tracked, and reads
it only if it is a text file — a binary one is no more governed for `near` than
for the walk, and an edit of it is silent; `gate` adds
untracked text files that cite a ruling to the diff it hashes. Line endings are
normalised on reading, the working tree's file and the committed version alike:
CRLF and LF both end a line, a bare CR does not, and a CRLF ledger parses, cites
and compares line for line exactly as an LF one, whatever a checkout's
line-ending settings made of either side. A ledger saved with bare CR endings
alone is one line: one that opens with anything but an entry heading has no
entries — the info line above names it, and check 2 fails at its first line that
begins `### ` once a bare CR ends a line, as above; one that opens with an entry heading
is one entry whose heading runs to the end of the file, and check 2 fails on the
carriage returns it carries (13). A leading U+FEFF, the byte order mark an editor
may write, is an encoding mark and not text: a heading on the first line of a
ledger or a spec document is read past it, and a write keeps it.

The **enumeration root** — the tree `check`, `spec-check`, `status`, `governs`
and the witness read — is the working directory's project root by the same
rule; with neither variable nor git root it is the home of the nearest ledger
above the working directory, else the working directory itself, while the
walk's bound stays the filesystem root. A walk goes up, so a ledger below the
working directory is never found by one: when no ledger governs the working
directory, `status` names the ledgers below it and the error of a command that
needs one names them too (a tree the host names or git tracks is searched for
them; a bare directory is not, nor a tree past the walk's bound). `--ledger <path>` names the ledger outright for
`index`, `query`, `governs`, `principles`, `status`, `spec-check` and `append`,
and the root becomes that ledger's own, so the check that follows an `append`
covers the ledger's tree; `check` and the bare witness cover every ledger under
the root, take no `--ledger`, and exit 2 if given one.

## 2. The entry

An entry begins at a heading line

    ### <P><n>. <heading>

and ends at the line before the next entry heading or the next section line (7),
or at the end of the file. `<P>` is one or more ASCII letters, `A`–`Z` or `a`–`z` (the
**prefix**), `<n>` a positive integer of at most fifteen ASCII digits with no leading zero (`D01` is not an entry, nor is a sixteen-digit numeral: fifteen keeps the number exact), and the two together are
the **id** (`D7`, `R12`, `A1`). A heading whose prefix uses any other letter is
not an entry. A line that begins `### ` and is not an entry heading — a leading
zero, a digit in the prefix, no `. ` after the id — ends nothing: it is body text
of the entry above it, or preamble when no entry precedes it, and every check
reads it there; in a ledger with no entry at all it fails check 2 (1). A line
that begins `## ` and is no section (7) ends nothing either; `check` names each
such line inside an entry in an info line, and whose body it is. Text before the
first entry heading or section line is the **preamble**.

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

A heading is one line to this reader and to any other: `docket append` refuses a
title, a grounding or an edge carrying U+2028 or U+2029, the line separators
that a host may write and a reader may not see, and reads one written by hand
as content of the heading rather than as the end of it.

## 3. The title rule (D7)

The title is the heading text after the id, in three steps and in this order:

1. cut at the first ` (` (a space followed by an opening parenthesis) that lies
   outside a code span, keeping what precedes it — a parenthesis inside
   inline code is part of the code, not the meta; a code span, as in CommonMark,
   is a run of backticks closed by the next run of as many on its line, and a run
   that finds none is literal characters and opens no span;
2. strip backticks and `**`;
3. if what remains is longer than 72 characters (a title of exactly 72 is kept
   whole), keep the first 72, cut back to the last space inside them (the ASCII
   space; the heading text is trimmed, so it never begins with one), trim, and
   append `…`. A heading with no space in
   its first 72 characters is cut at 71 characters and `…` appended. A heading that is only its
parenthetical has an empty title: the entry is named by its id alone, `check`
says so in an info line, and an entry the contract binds fails check 6 (11). Characters
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
heading's meta, the meta clause; in the title — the heading before its meta —
the title's sentence; in the body, the text between the nearest sentence
boundaries (`.`, `;`, or a line break).

An edge renders as `<source> [<adverb> ]<verb> <target>[ (<qualifier>)]`, so
`R7 partially reverses R6 (relational plane only)` is one edge from R7 to R6.
The same edge stated twice — in the meta, the title or the body — is one edge,
and its clause is the first statement in that order: meta, then title, then body. The same edge is
the same rendering, qualifier included: `extends R1` and `extends R1 (desktop)` are two edges, the second
binding less than the first, and each is kept. One verb may name several
targets joined by `/` (`keeps R1/R2`): that is one edge per target, all with
the same clause.

Text inside backticks is quoted, not asserted — a code span is a run of
backticks and the next run of as many (3), so ``supersedes R3`` is one as
`supersedes R3` is: `supersedes R3` inside a code
span describes an edge and creates none, which is how prose talks about an
edge it does not make. The verbs are recognised in this one form and no other —
`superseded R3` and `superseding R3` make no edge — save that a verb or adverb
may open a sentence with a capital, `Supersedes R3` or `In part reverses R6`,
and is recorded in lowercase — a sentence as the clause above bounds it, so a
capitalised verb or adverb anywhere else, `The Lot Keeps R5`, is a word of its
sentence and makes no edge; and a sentence that needs a
verb of the list beside an id it does not mean to bind quotes the id. An edge's target must exist and must be defined earlier
in the ledger than its source (a strictly smaller heading line). An edge from a ruling to itself is a
failure (13, check 5). No status is ever computed from edges (D3): `governs`
shows them with their clauses and the reader judges.

## 6. Addenda

An **addendum** is a line under an entry of the form

    > Addendum <YYYY-MM-DD>: <text>

It records that something about the entry has changed without amending the
entry: most often that the entry's stated reason no longer holds. An addendum
is **pending** until a ruling written after it has an edge into the entry (any
verb); the docket (`docket status`) lists every pending addendum, each on one
line with its text cut at one hundred characters (D14) — `governs <id>` prints
the whole, and `status --json` carries it. The list has no cap, as the witness
failures beside it have five: each line is a route no ruling has taken yet, and
the list is the one place it is kept (D21), where a failure's other lines are
in `docket check`. `docket append --addendum <id>
--text <text>` writes one with today's date as the last line of the entry;
`append` refuses a `--body` that carries an addendum line, so an addendum is
dated by the tool and never by hand.

Which was written first is read from history (D21): the line holding the edge
was added in a commit that descends from the one that added the addendum's line
(a commit that changes only a line's whitespace or its ending, such as a
renormalisation to CRLF or back, adds no line: each keeps the commit that wrote it),
or in that same commit — the preamble's order, the addendum first and the ruling
second — or it is not committed yet. An in-edge older than the addendum does not
resolve it: supersession is clause-level (D3), so a ruling that once named an
entry, superseding one clause or extending it, has not moved the law past the
clause a later addendum is about. With no history to read — no repository, or a
ledger never committed — a later entry's edge into the entry resolves it.
Where history holds no order between the two — one commit holds both, neither
is committed, or there is no history — the ledger's own dates are read first:
entries are appended, so an entry was written by the earliest date an addendum
carries under it or under any entry after it, and an edge from one written by a
day before the addendum's is older than it and answers nothing. Only where the
dates say nothing is the preamble's order read, the addendum first: a ruling and
an addendum written on one day in one session, or squashed into one commit, are
read in that order.

The date on an addendum is the tool's clock. `DOCKET_TODAY`, when the
environment names a date, replaces it: a hook for a test that must be repeatable,
not a way to write a ruling into the past. A value that is not a day of the
calendar from the year 1000 on, written `YYYY-MM-DD`, is refused, exit 2, before
anything is written:
written, it would be a line the grammar does not read as an addendum. An addendum
that would add a failure to `check` is refused before it is written, as an entry
is (11).

## 7. Sections and spec headings

In a ledger, a **section** is a line `## <X>. <title>` where `<X>` is one or more
ASCII letters, `A`–`Z` or `a`–`z`; sections group entries and are indexed for
their titles. A `## ` line of any other form ends nothing: it is body text of
the entry above it, or preamble, as a `### ` line that is not an entry is (2). A **spec heading** is
a heading in `UIUX.md` or `PRD.md` of the form

    #… §<x>[.<y>[.<z>]] <title>

and is cited as `UIUX §<x>.<y>` or `PRD §<x>`; a heading numbered four levels
deep, `§4.5.1.1`, is no spec heading. Both are indexed by
`docket index` under `sections[]` and `specs[]`; `near` prints a spec cite with
its title (`UIUX §<x>.<y> <title>`).

## 8. Cites

A **cite** is an id on word boundaries, `<P><n>`, in any text file, where
`<P>` is one of the prefixes of that file's ledger. A word boundary is where a
letter, digit or underscore — in any script, not only ASCII — meets a character
that is none of these: `styléR9` is one word and not a cite, `→R7` is a cite.
Edges (5) and spec cites (below) share the rule. A cite to a number that
does not exist in that ledger is a failure (check 1); `<n>` has the grammar of 2
(`D05` is not a cite, nor is a numeral of sixteen digits). The number of the
contract line (11) is the directive's own and not a cite: it names the first entry
the contract binds, which may be one not yet written. An id whose prefix is not
one of the ledger's prefixes is not a cite and is ignored. An id inside a code
span (backticks) is quoted, not cited, in every text file, as an edge inside one
is quoted and not asserted (5): the `D7` in section 2 is an example, not a
reference, and check 1, `near`, `governs` and `status` pass over it. Cites inside the
ledger itself are references between rulings, not code cites: check 1 requires
them to resolve like any other, and `governs` and `status` count code cites in
every governed file except the ledger. A fenced code block — a line that
begins, after any indentation, with three backticks opens it, the next such line
closes it — is quoted
like a code span: no id, spec cite or bare cite inside it is counted, so a
document may quote a ledger's output or another project's rulings. A fence
quotes cites, not headings: an entry heading inside one still opens an entry, so
that the entries are the lines that begin `### ` and nothing else decides it;
`check` names such a heading in an info line, and a ledger that shows its heading
form indents it four spaces. An edge's target is a cite: an id whose prefix is
none of the ledger's prefixes is no edge (D3's addendum). A fence
never closed quotes every line after it: in the ledger that is check 2's failure
(below); in any other file `check` names the line that opened it in an info line.

A ledger's **governed tree** is every git-tracked text file that resolves to it (1),
cited or not; `check`'s summary counts those, which is why the number is larger
than the number of files that carry a cite, and why a ledger with no entries
still has a governed tree to name while governing nothing in it.

A **governed file** is a text file with at least one cite that resolves. A
**ledger document** — the ledger itself or a copy of one: a file named
`DECISIONS.md`, as discovery names a ledger, or one whose name begins `DECISIONS`
and ends `.md`, the name read in any case, that holds an entry heading (2) — has
its cites checked (check 1) but is never governed code:
`governs`, `status` and `gate` leave it out of code cites and governed files,
and `near` is silent for an edit inside one: the ledger is amended through
`append` (11), and a direct edit is check 7's business. A file so named that holds
no entry heading — notes about decisions, say — is read as any other file is, and
governed when it cites a ruling (D5's addendum).

A **spec cite** is `UIUX §<x>[.<y>[.<z>]]` or `PRD §<x>[.<y>[.<z>]]`, the same
depth the heading grammar allows (7) — a deeper number is read to its third level,
so `UIUX §4.5.1.1` cites `UIUX §4.5.1` — and it must resolve to a spec heading
(check 3). A **bare cite** is `§<digits>` not preceded by a
document name; it is counted per file, and the count is ratcheted against the
baseline (9). Spec documents themselves are exempt from the bare-cite count.

The core at `bin/docket.js` is governed by the ledger of the repository it
belongs to (D6). The same text anywhere else — at another path, or running
from a directory other than `bin/` — is the witness that `docket vendor` copied
there (D9), and is not a governed file: its
comments cite the plugin's own ledger and its fixture's examples, which resolve
to nothing under the ledger it serves, so no check reads it for cites or for
the bare-§ count, `near` prints nothing for an edit to it, and `check` says so
in an info line. Identity is the text itself, line endings normalised, which no
marker could forge; a copy that has drifted from the running core is not
exempt, and its cites failing is the sign to vendor again.

A fence is closed before the entry ends. One that is not quotes every line to
the end of the ledger, cites included, and `docket append` refuses a body that
opens one without closing it; a fence left open by hand is check 2's failure,
named at the line that opened it.

## 9. The bare-cite baseline

The ledger preamble may carry one comment

    <!-- docket: bare-cites <file>=<n> <file>=<n> … -->

with paths relative to the ledger's home (1); a path that holds a space, a double
quote, a backslash or `>` is written as a JSON string, `"Design Notes.md"=1`, as
`append --baseline` writes it. When the comment is present, a
file's bare-cite count may not exceed its allowance, and a file not listed has
an allowance of 0 (check 4); the comment may list no file at all, and then every
file's allowance is 0. When the comment is absent, counts are reported and
nothing fails. `docket append --baseline` rewrites the comment from the current
counts; on a tree with no bare cites that is the empty comment, the strictest
baseline. An allowance may fall; one it raises, or a file it lists anew, fails
check 7 until an entry written since carries the new pair, `app.js=4`, as a word of its own — no
path character before it and no digit after, so `app.js=40` and `myapp.js=4` do not carry it — the
ratchet is loosened on the record, with its reason, or not at all (13, D41).

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
writing, since the ledger is append only — an entry that would add a failure to
`check`: its title, its grounding, an edge's qualifier or its body naming a ruling
that does not exist (the entry's own id excepted) or a spec heading that does not,
an edge to itself, a meta a code span runs into, or an `--issue` that reads as an
edge; it is read as `check` reads it, on the ledger as it would stand. Each of its
three modes refuses another mode's options — `--addendum` takes `--text`, `--baseline`
takes neither, an entry takes no `--text` — since a dropped option reads as one that
worked. It writes in this form:

    ### <P><n+1>. <title> (<grounding>; <verb> <P>m; <verb> <P>k)
    Principle: <principle>.
    <body, which contains Reason:>

With `--dry-run`, in any of its three modes, `append` refuses what the write
would refuse and prints what it would write — the entry, the addendum's line, the
baseline's comment — exactly as the write prints it, and writes nothing. The
intake's confirm block is that output (RULE.md), so the person confirms the bytes
the write appends; the entry's number is the next free one when the write runs.

## 12. Prefixes and numbering

The prefixes of a ledger are the distinct `<P>` of its entry headings. Within a
prefix, each entry's number is its position among that prefix's entries — 1, 2,
3… in order of appearance, so a gap, a repeated id and an entry out of order all
fail (check 2), and a repeated id resolves — for a cite, `query`, `governs` and
`near` — to the first entry bearing it, the one at its position; `docket
append` writes `<P><max+1>` for the prefix given with `--prefix`, else for the
prefix of the ledger's last entry; a ledger with no entry requires `--prefix`
and `append` exits 2 without it. An id given to a command — `governs`,
`append --edge` and `append --addendum` — resolves exactly, and failing that
whatever its case, when exactly one entry's id matches it so; two ids that
differ only in case are both named and the command exits 2.

## 13. What `docket check` verifies

Each failure prints one line, `<file>:<line>  check <k>: <message>`; the exit
code is 1 if any check fails, else 0. A failure names the line of the offending
cite, heading or edge, never only the file. Every line the core prints, here and
in every subcommand, replaces a control character, or a character that reorders
what a terminal shows — one of Unicode's bidi controls, U+061C, U+200E–U+200F,
U+202A–U+202E and U+2066–U+2069 — with U+FFFD, and a name the repository holds — a file, a
ledger — is printed on its one line with its own line breaks and tabs replaced
too, so a failure is one line whatever its file is called; the JSON forms carry
names as they are: check 2 fails an entry that carries one, and
text no check reads for one — a ledger's preamble, a section heading — still
prints straight.

| k | Check | Fails when |
|---|---|---|
| 1 | Cites resolve | a cite in a git-tracked text file names a number that does not exist in that file's ledger |
| 2 | Numbering, and what an entry may carry | an entry's number is not its position among its prefix's entries in order of appearance: a gap, a repeated id, an entry out of order; or a heading or body carries a control character or a character that reorders what a terminal shows; or the ledger has no entries and a line of it, fenced or not, begins `### ` — a heading the grammar does not read, or one a bare CR began, its lines read here as its author ended them (1, D39); or the ledger has no entries and a line of it reads as an entry heading in another form (1, D45); or the ledger is not UTF-8 text — a UTF-16 byte order mark opens it, or it holds a NUL byte (1, D45) |
| 3 | Spec cites resolve | a `UIUX §x` or `PRD §x` cite names a heading that does not exist in the document beside the ledger, or the document is absent |
| 4 | Bare-cite ratchet | a file's bare-`§` count exceeds its allowance, when a baseline comment is present |
| 5 | Edges point back | an edge's target does not exist, is the source itself, or is defined later than the source |
| 6 | Header contract | an entry bound by the contract line breaks any of the five clauses in 11 |
| 7 | Append only | an entry of the committed ledger is missing from the working tree's ledger, or its heading or body differs there, line for line, other than by appended addendum lines — the committed entries are the ones enumerated, so a removed entry fails as a changed one does; the committed ledger is the one at the revision `DOCKET_BASE` names when the environment names one (CI names the commit before the push — this repository's does, and so does the CI step `vendor` and `constitute` print — so an amendment inside a range of commits is compared, not only the tip's parent), else `HEAD`'s, or its first parent's when the ledger in the working tree already equals `HEAD`'s (so a check run on a fresh commit, as in CI, judges the commit it was given, never a commit against itself), all read from the repository root whatever directory the host names and with the normalisation of 1; a ledger the compared revision has and the working tree lacks fails as removed, and so does one git no longer tracks, struck from the index and left on disk; with no base named, or one naming `HEAD`, a ledger `HEAD`'s first parent has and `HEAD`'s own commit removed fails as removed too, the tip's rule read for the ledger as for an entry (D4's addendum); skipped when no such version exists — a ledger not yet committed, or one the revision compared with has no file of: a first commit, the commit that added it, or a `DOCKET_BASE` whose tree has none, which the tip's rule never stands in for — and an info line names the ledger whose check 7 was skipped, and the base when the base had none, so a skip is never mistaken for a pass; a `DOCKET_BASE` that names `HEAD` itself would compare a clean commit with itself, one the repository does not hold — a force-push leaves the commit before it behind — names nothing to compare, one of all zeros is a CI's word for no commit before a branch's first push, and one that is no revision — a space, a control character or a colon in it, or a leading `-` — names none; each is read as unset, with an info line naming the ledger, the value and what the ledger was compared with instead (for `HEAD` itself, when that is not `HEAD`), while any other value is git's to resolve, a long branch name and a reflog's `main@{1}` among them; and against the same committed ledger the preamble's directives are held too (D41): a contract line does not move or go, the bare-cites comment does not go, and an allowance may fall but rises only when an entry written since carries its new pair (`app.js=4`) |

Check 7's reference point — the first parent when the ledger is unchanged since
`HEAD` — is a rule of this repository's ledger, stated with its reason in the preamble of
`docs/DECISIONS.md` beside the append-only law it enforces. `docket status`, whose
witness line sums the check up, says beside an `ok` for how many ledgers check 7
was skipped, as the info lines do, so that line is not read as a pass either.

`docket check --json` prints the same findings as JSON. Run with no subcommand,
`docket` is the witness: `check` over the tree and `spec-check` for the nearest
ledger, exit 1 on any failure (D9); `docket vendor <dir>` copies the core to
`<dir>/test/docket.js`, so a repository runs that witness without the plugin.
`docket intake rule|constitute` prints an intake file for a skill to splice at
load — a host runs a splice under the skill's own allow-list, which names the
core and nothing else, and a splice is a fixed command with no argument text in
it, since a host may paste that text into the command as written (D48) — and the vendored copy, with no `intake/` beside it,
says so rather than printing nothing.
`--json` is on every subcommand. A subcommand that prints a file — `intake`,
`protocol`, `pack <name>…` — prints, with it, the file's name and its whole text
(a pack's with its domain); `transcript` prints the turns it keeps, each its role
and its lines, and a line that is not JSON as `raw`. A turn's lines are its text,
each tool call — the tool named in brackets, then every line of its command, or
its file, pattern or prompt, each after the first indented under it — and each
tool result, marked `[result]`, or `[result, error]` where the host marks it one;
a call or result over forty lines prints forty in all — its first ten, the count
between and its last twenty-nine, so the mark stands for two lines or more (D42) —
and a line of one over four hundred characters is cut, marked (D14), the maker's
own text printed whole; `transcript --last <n>`, n a positive whole number written
as digits, keeps the last n assistant turns
and what follows the first of them, and n at or past the number of assistant turns
keeps the whole transcript, as no `--last` does; `stop` prints its answer as
it always does, and `{}` for a stop it allows, where it otherwise prints nothing.
`docket check` covers every ledger in the tree; `docket spec-check` covers the
ledger nearest the working directory (a fixture ledger under `test/` is reached
from inside it, or with `--all`). It reads two kinds of row in `UIUX.md`: a
**token row**, whose first two cells are a `--token` and a hex colour of 3, 4,
6 or 8 digits, matched by one CSS declaration of that token (a) — as a colour,
not a spelling: `#fff`, `#FFFFFF` and `#ffffffff` are one value; a second
declaration of another value beside it is a theme's and is reported, not failed;
a value inside a CSS comment is not a declaration, and a comment never closed
runs to the end of the file, as CSS reads it; and a
**contrast row**, a table row holding token names and an `N:1` value — the `1`
ends it, so `4.5:10` is not one, and a row that names two tokens with a ratio in
another shape (`4.5:10`, `4.5 : 1`, `4.5 to 1`) fails, named, and is not read as
prose — which names exactly two tokens or fails, and whose ratio is recomputed from the two
hexes to two decimals (b): the stated ratio is rounded half-up on its written
digits, the recomputed one on its value, and the two are compared in hundredths. `governs <id>` names the ledger it searched and
exits 2 when `<id>` is not one of its entries; `query <term>…` reads each argument
as a term, lists every ruling any term matches, once each, in the ledger's order,
refuses a blank term, and prints that nothing matches and exits 0 when none does;
every subcommand refuses, exit 2, an argument it does not take, as it refuses an
option it does not read; `diff` exits 2 when a revision or file cannot be read,
and 1 when an existing entry's heading or body differs between the two readings
— the comparison is check 7's own, so the two cannot disagree — and lists that
first, before what was added; each addendum is counted, so one that repeats an
earlier one, date and words, is listed as added. A reader that stops reading
early — `docket check | head -1` — takes no more lines, and the exit is the
command's own: a failing check exits 1 whoever stopped reading it (D6's addendum).

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
| one | any | the window: the 20 lines before and the 20 after the matched line — the line where the match begins — both inclusive (41 lines), clamped to the file; at most eight rulings, nearest first, a ruling cited more than once ranked by its nearest cite and never by how many times it is cited, then by that cite's line, the earlier first, then by its place on that line |
| many | `true` | the union of the windows — a line inside two overlapping windows is read once, at its distance to the nearest match, and two matches on one line are one anchor; the eight most cited within it, nearest to the first match among equals, then by the line of that nearest cite, the earlier first, then by its place on that line, listed in that order |
| many | `false` or absent | silent: the edit tool will reject the edit, and the retry fires `near` again |
| zero, or `old_string` empty | any | silent |
| an edit of a file that does not exist | any | silent: there is no region to govern, and the edit tool refuses the edit |
| `Write` of an existing governed file | | the whole file; the eight most cited, earliest first among equals |
| `Write` of an existing file that cites nothing | | silent |
| `Write` of a file that does not exist | | silent |

Silent is silent on both streams: nothing on standard output, nothing on
standard error, exit 0.

The text opens with one line naming the ledger and the region —
`Governed here (<ledger>, ±20 lines of <file>:<line>):` — the ledger's path
relative to the project root, which holds every ledger the walk finds (1), and
absolute when there is none, the file's relative to the ledger's home. A union
names each matched line once, `<file>:70, 140, 210`, the first eight and then
`+<n> more`: the count tells the maker how much denser the region is than the
list shows, and the list stops where the ruling list does so that the hook's
text stays short enough to be read at every edit; a whole-file write says
`whole file <file>`. `near --json` prints the same window as one object —
`ledger`, `file`, `mode`, `anchors`, `region`, `rulings` (id, title, issue,
count, line), `more`, `edges`, `addenda`, `specCites`, `notice` — and is silent
exactly where the text is.

Under it the window lists at most eight rulings (D2) in the order its row gives
— a single window nearest first, ties by the line of each ruling's nearest cite, the earlier first, and among two on one line the earlier on that line —
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

An `old_string` of more than one line covers the lines from its first to its last
(a final newline ends its last line and opens none, as a file's does, 1);
the window is ±20 around the whole of it, the header names the span as
`file:first–last`, and a line inside the span is at distance 0 — the rulings
cited in the text being replaced are what the edit most needs to know.

## 16. The gate, the verdict file and the core's breadcrumb (D10, D11)

`docket gate --session <id>` decides mechanically whether a stop is judged. Its
hash is the SHA-256 of `git diff <base>` over every governed file, every ledger
and the spec documents beside it under the root (D40). The base is the session's:
the commit `HEAD` was at when the session started — `status --session-start`, the
binding's call at a session's start, records it from its input — moved to `HEAD` by a PASS
recorded while nothing governed differs from `HEAD`; a session with none, or whose
base is no longer an ancestor of `HEAD`, reads from `HEAD`. So a change the maker
commits before it stops is in the diff. The files are those the working tree
governs, and those the base governed that the working tree does not: a governed file deleted or stripped of its last cite,
a file under a ledger that is gone, and the ledger itself, each read at the base
(D22), a spec document gone as a ledger gone, a rename read as the deletion and
the addition it is and a file at the base read as text by its bytes, as 1 reads
one; an untracked governed file is read as if added — intent to add, in a copy of
the index, never the repository's own — so its diff is a new file's and the hash
is the same before `git add` and after; an untracked path the base holds — a
governed file or a ledger struck from the index, `git rm --cached` — is the
deletion git shows, not a new file added again. git is run as the repository
holds its files, whatever the person's own configuration says: no external diff
program, no text conversion and no colour, the `a/` and `b/` prefixes, three
lines of context, `GIT_DIFF_OPTS` and `GIT_EXTERNAL_DIFF` set aside, and every
path a literal path; and what changes only how git prints a diff is pinned too —
the full blob names on the index line, the default algorithm and indent
heuristic, no hunks joined, git's own order of files, paths quoted as git quotes
them, a blank context line kept — so one diff is the same text on every run and
every machine (D40's addendum). How the checkout holds its files — its line
endings, the filters its attributes name — is read as configured: read past it,
a clean file would show as changed. A diff the gate cannot read whole is
refused, exit 2, with the reason: the copy of the index not made, or the add
failing, would leave every tracked file read as deleted; and a repository git
will not read — its ownership, its config — is not a tree with no repository,
whose governed files all read as new, as they do before a first commit. `SKIP` when that text is empty, when its hash
equals the last PASS's, or when the session is surfaced;
`SURFACE` when the session has been blocked five times or more since its last PASS or
its located failures have not fallen across the last two verdicts after the
third block, with the residue printed beneath and the session marked surfaced —
the residue's last verdict is `last`, one for the repository (below), and one
another session recorded is named on its line as that session's, not this one's;
else `JUDGE <hash>
<files…>`, and with `--diff` the diff beneath, each touched function whole
(`git diff <base> --function-context` over the same files, read the same way), and beneath it each ruling cited within the window of a hunk
(15) — its lines in the working tree and the lines it removed, read in the base, a
new file read whole and a deleted one read whole in the base — every one, without
`near`'s cap, as `governs` prints it; the hash reads neither (D30, D33, D46). `docket verdict` records
the judge's answer; a PASS resets the session's block count and remembers the
hash, a FAIL or STALE bumps the count and appends the failure count to the
session's history; a changed hash never resets anything. A FAIL
or STALE carries `--reason`, one located failure per line in the protocol's form,
as many lines as `--failures` says; a code-pack line that names a ruling answers,
in a field of its own, `reason holds: <the premise> (<file:line>)`, `reason gone:
<what changed> (<file:line>)` or `cite stale`, the line one of a file in the
repository before or after the diff, a link read as 1 reads one, so that a link
out of the tree is outside it — a range or several will do (D27), though a
`reason holds` whose every location lies in the entry of a ruling the line names,
or in the line's own location, is refused: a claim is not its own evidence (D36). The
answer is read in the field that begins with it and nowhere else — prose that says the
words is not an answer — and an answer on any line, of any pack, naming a ruling or not,
is held to its line the same way; a `cite stale` line's evidence is its own location,
held to the same rule (D27). A line is a stale one when its answer is `reason gone` or
`cite stale`: STALE is refused unless every line is a stale one and FAIL when every
line is; a PASS carries no reason (D23). A line's own location, its third field,
is held as its evidence is: each `<file:line>` there a line of a file in the
repository before or after the diff, or the record is refused. Before the diff is
the file as the session's base and as `HEAD` hold it — a governed file the session
deleted in a commit is located there, since the diff runs from the base (D40) —
and after it, the working tree's. A path with a
space or a parenthesis is written in backticks, `` `app/(group)/login.js`:46 ``,
in the location and in the evidence alike (D23).

The state lives in `.docket/verdict.json` under the stop's root (1): `last` (verdict, hash,
failures, time, session, and the reason it was recorded with), `lastPassHash`,
and `sessions`, one entry per identifier with `blocks`, `history` and `surfaced`,
and `base`, the commit its diff runs from, once one is recorded;
`docket status` names the last verdict's session when it is surfaced, and every other
session the file marks surfaced on a line of its own with its blocks and its failures
per verdict, since `last` names one session and each surfaced session waits for the
human (`status --json` lists them all, as `surfacedSessions`). Every
verdict is also appended, one JSON line each and in order, to
`.docket/verdicts.jsonl`: the judge's record, for a person to read and for a
measurement to score the judge's first answer by; nothing in the core reads it.
A file that is missing, half-written or hand-edited is read as what it holds and
nothing more: a session's count that is not a whole number, a history that is not
a list of them, a mark that is not `true`, holds nothing; and a last verdict whose
word, time or count is missing or of another kind holds nothing, and is read as
none, its hash, session and reason, when present, text. Each change is made under
a lock beside the file, `verdict.json.lock`, the state re-read inside it and written
whole to a new file renamed over the old, so judges recording at once lose nothing.
A state with nowhere to go — `.docket` a file, or `verdict.json` anything but a
file — is refused by the verdict, exit 2, naming it, and the gate's answer and the
stop's block stand without it.
A lock names its holder, and one whose holder is gone is taken over, the ledger's
lock and the state's alike; the state's held past five seconds is written through,
with a note, except by the call at a session's start, which waits one second and
then records no base, so that the session reads from `HEAD` as one with none does.
`verdict` records the diff in front of the judge: a `--hash` the working tree does
not hash to is refused, exit 2, and with none it records the diff in front of it;
with no `--failures` the count is 0, which a FAIL or a STALE refuses. A `--session`
whose value is empty or blank is refused, exit 2, by the gate, the verdict and the
stop alike: it names no session, and read as none it would record under another.
The verdict refuses a `--hash` so given the same way: an option accepted and
ignored is a silence. `.docket/` is ignored by git: the core makes it with a `.gitignore`
of `*` inside, whatever the project's own says, and a constituted project is told to ignore it too.

`docket stop` is the stop: a host runs it when the maker declares the work done,
with its hook input on stdin — of which it reads the session's identifier, whether
this stop follows a block in the same turn and the project directory, and the judge
the transcript's path — and gives it, with `--judge`, the command that
starts the host's agent as the judge — headless, a session of its own that reads
its prompt on stdin — and, with `--permission`, the spelling of the one rule that
command grants it. The command is one command, which the stop runs as
`exec <command>` so that the judge is the process it waits on and stops at the
bound, its exit status the judge's: a stop it would judge with an operator
outside quotes in the command (`;`, `&`, `|`, `<`, a parenthesis, a line break)
or an assignment before it is a usage error, exit 2, as one with no `--judge`
is, and a variable is set as `env NAME=value <command>`. `--session <id>`, given,
names the session in place of the hook input's identifier. A session's identifier
is text, and a control character in it is kept as its escape, `\u0000`, in the
state, the judge's environment and its prompt. It allows at once when the host's re-entry flag is set, when
nothing governed changed or the last PASS judged this diff, or when the session
is surfaced; it blocks, with the residue and no judge, a stop at which the gate
surfaces the session. For any other stop it starts the judge with a prompt that
names the core by its path, the permission's spelling when given, and the hook
input's session, transcript path and directory — none of what the maker wrote;
waits for it to end, up to `--wait` seconds (700 by default; a whole number
written as digits, at most 9007199254740, the most seconds whose milliseconds are
counted exactly), then stops
it; and reads the state: a PASS for this diff allows; a FAIL or STALE recorded
for this diff and this session since the judge started is relayed as a block
carrying the recorded reason and its route — the judge runs with `DOCKET_SESSION`
set to the stop's session, so a verdict that names none is this session's, with `DOCKET_ROOT`
set to the stop's root (1), and with `DOCKET_STOP`, the stop's own mark: a second record its
judge makes in that stop replaces the first in the count, so the session's blocks move once
and its history ends with the later record, and one stop counts once (D38's addendum). A FAIL or
STALE recorded for the diff the last PASS judged takes that PASS back: the later word on a
diff decides; a session surfaced while the judge ran is relayed
with the residue; anything else — a judge that recorded nothing, ended in an
error, or was stopped at the bound — is blocked once, with a reason that names
the files, how the judge ended (one that ended before it read its prompt ended,
and is named so, never as one that could not be started; one whose output passed
the 64 MiB the stop keeps of it was stopped for it, and is named so; one that ended
while a process it left held its output open is named as ended, with that, though
the stop waited the bound out on it — D37's addendum; a process the judge started
is the judge's own: the stop stops the judge at the bound, not what it left behind)
and where its output is, and the block counts in
the session's `blocks` as a recorded FAIL does, with nothing added to its
`history` (D38). A stop it would judge with no `--judge` given is a usage error,
exit 2. Beside that count it writes one file, `.docket/judge.log` — the command,
how the judge ended and the bound it ran under, and what it printed — for a person to read; nothing in the
core reads it (D37).

With `DOCKET_TRAIL` set in the environment, every run of the core in a project
that has a `.docket/` appends one line to `.docket/trail.log` — the time and the
command as given, an argument over forty characters cut to forty — so a
measurement can read what a judge ran when its session keeps no transcript
(D25); a refusal adds `  refused (exit <n>): ` and the refusal, and `stop` adds a
line for each block it makes, `  blocked: ` and the block's first line, each cut
to four hundred characters, so a measurement reads the stop's blocks and the
core's refusals from the core's own record, beside the host's wording of them.
Every cut keeps that many characters in all, its mark `…` among them, counted as
code points (D14's addendum, D42). It is off by default.

`status --session-start`, the binding's call at a session's start, reads the
tree within three and a half seconds of the core's start — the hook's five, less
the time to start, the base's lock wait and the time to print (D14's addendum);
past that it prints the last rulings, the pending addenda and the last verdict,
and its lines for the uncited rulings and the witness say they were not read at
the session's start and that `docket status` reads them whole. Where no ledger
governs the working directory, the look below it is read within the same bound,
and past it the tree is read as the ungoverned tree it would be: nothing is
printed and no base is recorded, as past the walk's bound (1). `DOCKET_START_MS`,
when the environment names a whole number of milliseconds, seven digits at most,
replaces the bound: a hook for a test that must be repeatable.

`.docket/core` is the core's breadcrumb: the absolute path of the `docket.js`
that last ran as the host's own hook in this project — written by `near` and
`status` only when the binding passes a plugin root (`DOCKET_PLUGIN_ROOT`) that
contains the running file, both as the filesystem resolves them — a root named
through a symbolic link contains the file it leads to — and only where a ledger
governs; rewritten only when it changes. The judge `docket stop`
starts is given the core's path in its prompt; a judge a person runs by hand is
given no word of where the plugin is, so it finds the core here, and everything
else it reads it asks the core to print. One run by hand in a project with a
ledger and no breadcrumb says the session did not start with the plugin loaded;
one in a project with neither says the project is not under the docket.
