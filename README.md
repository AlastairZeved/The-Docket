<!-- HEADER -->
<br />
<div align="center">

  <h3 align="center">TheDocket</h3>

  <p align="center">
    A repo's decisions, kept where the code can find them.
    <br />
    <a href="https://github.com/AlastairZeved/the-docket"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://github.com/AlastairZeved/the-docket/issues/new?labels=bug">Report Bug</a>
    ·
    <a href="https://github.com/AlastairZeved/the-docket/issues/new?labels=enhancement">Request Feature</a>
  </p>
</div>

<!-- BADGES -->
<div align="center">

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]
[![Version][version-shield]][version-url]
[![Node][node-shield]][node-url]

</div>

<br />

<!-- READER + PURPOSE HEADER -->
> **Who this is for.** A builder who uses a coding agent on one project across many sessions, and who has watched the agent undo a decision that was already made — because nothing made it read the *why* first.
>
> **What you already know.** You keep decisions somewhere, or you mean to. You know a coding agent starts every session from the code as it is, not the argument that made it that way.
>
> **What you will not need to know.** You do not need to have used a decision log before, or to know how a plugin binds to a repo. This page starts there.
>
> **Purpose.** After reading, you can install TheDocket on a repository and record your first ruling, and the next edit to that region will print what governs it before it changes.

---

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#the-problem">The Problem</a></li>
        <li><a href="#the-five-jobs">The Five Jobs</a></li>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li><a href="#screenshots">Screenshots</a></li>
    <li><a href="#the-ledger">The Ledger</a></li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
        <li><a href="#run-locally">Run Locally</a></li>
        <li><a href="#running-tests">Running Tests</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#known-limits">Known Limits</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#faq">FAQ</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
  </ol>
</details>

---

<!-- ABOUT THE PROJECT -->
## About The Project

Every ruling this plugin enforces is a plain numbered line in a markdown file in
your repository. Nothing lives in the plugin. Uninstall TheDocket and the
constitution still governs, because the witness that checks it is a node script
your repo owns and your CI runs.

### The Problem

Coding agents have no memory of *why*. Every session starts from the code as it
is, not the argument that made it that way. So a decision that was argued,
measured and recorded gets quietly undone three weeks later, by an agent that
never saw the argument, or by you in a later stretch who forgot it existed.

The conventional answer is memory: a `CLAUDE.md`, an auto-memory file, a notes
document. All of them store *facts*. None store *rulings* — numbered, with the
principle they resolved against, with what they supersede, cited from the code
that implements them. A memory cannot say "B91 partially reverses B84 for the
relational plane only." A memory is never red in CI.

TheDocket makes the record something the agent cannot skip.

### The Five Jobs

| # | Job | When | What happens |
|---|-----|------|--------------|
| 1 | **What governs this region?** | before an edit | A hook prints the rulings cited around the edit, with their edges, as context. It never blocks. |
| 2 | **Did this break a ruling?** | at "done" | A read-only judge scores the diff against the ledger and the packs. It can block the stop. |
| 3 | **Record it where it will be found.** | at a decision | `/rule` demands issue, principle and every ruling it touches, then appends it in the contract format. |
| 4 | **A spine before the first line.** | at a new project | `/constitute` asks four gated questions and writes the triad plus the vendored witness and a CI step. |
| 5 | **What changed in the law?** | across time | `docket diff`, `docket query`, `docket governs`. |

Plus **the docket** itself, printed at session start: what is pending — addenda
unresolved, rulings cited nowhere, the last verdict — so a resumed stretch opens
with *confirmed / open / blocked*.

### Built With

* [Node.js](https://nodejs.org/) — the core is one dependency-free file
* [Markdown](https://commonmark.org/) — the ledger, the packs, the intakes
* [Git](https://git-scm.com/) — the witness reads `git show HEAD:` to detect an edited ruling
* [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — the host binding: hooks, skills, subagents

The core (`bin/docket.js`, `packs/`, `intake/`, `templates/`, `docs/FORMAT.md`,
`judge/PROTOCOL.md`) names no host, no model and no vendor. The Claude Code
binding is three thin files that point at core files.

---

<!-- SCREENSHOTS -->
## Screenshots

The two-second demo: the governed list appears before the diff.

```text
> edit the toolbar in test/fixture/app.js

Governed here (test/fixture/DECISIONS.md, ±20 lines of app.js:41):
  R6  The toolbar replaces the long-press menu  · issue #12
  R4  Fold similarity: shape held, size uniform
  R2  Positions are never mutated on read
Edges among these: R7 partially reverses R6 (relational plane only); R4 supersedes R3.
Addenda: R2 (2026-09-11).
Also cited: UIUX §4.5 The minimum.
Name the ruling you rely on before you edit.
```

The gate, at "done":

```text
Failures    code · F3 · app.js:1112 · R6 keeps the toolbar; this diff removes it · fix route: amend via /rule, or change the code
Verdict     FAIL
```

The docket, at session start:

```text
Last ruling   D18  The judge test: four runs, four verdicts (2026-09-11)
Cited nowhere D2, D7, D14
Addenda       D8 (2026-09-11)
Last verdict  PASS  sha256:1f4c…
Witness       PASS  7/7 checks
```

---

<!-- THE LEDGER -->
## The Ledger

A ruling is a heading and a body. Existing entries parse loosely; entries
written through `docket append` satisfy a header contract.

```markdown
### R6. The toolbar replaces the long-press menu (issue #12; supersedes R4)

Reason: the long-press menu hid the primary actions behind a gesture that no
test could reach and no spec could cite. The toolbar is visible at rest and
each control cites the ruling that put it there.

> Addendum 2026-09-11: the toolbar collapses to icons below 480px; the actions
> are unchanged, only their labels are withheld.
```

Edges use a fixed verb list — `supersedes`, `overrides`, `retires`, `reverses`,
`waives`, `extends`, `keeps`, `re-tunes`, `refines`, `replaces`, `corrects`,
`revises` — and every edge must target an earlier ruling. Supersession is
clause-level and forward-only: a ruling that supersedes one clause of an earlier
one does not mark the earlier one dead. That is why `governs <id>` shows the
chain in and out with each edge's clause text, and the reader judges.

---

<!-- GETTING STARTED -->
## Getting Started

### Prerequisites

* **Node 20 or newer**

  ```bash
  node --version   # v20.x or newer
  ```

* **A Claude Code session** on `2.1.250` or newer, for the hooks and skills.

* **Git**, with an identity set — the witness uses `git show HEAD:` to detect a
  changed ruling.

### Installation

Install as a Claude Code plugin:

```bash
# In a Claude Code session
/plugin marketplace add AlastairZeved/the-docket
/plugin install the-docket@the-docket
```

Or load it for one session, from a clone:

```bash
git clone https://github.com/AlastairZeved/the-docket.git
cd the-docket
claude --plugin-dir .
```

### Run Locally

The repo governs itself, so the way to work in it is the way the plugin works:

```bash
# Clone the project
git clone https://github.com/AlastairZeved/the-docket.git

# Go to the project directory
cd the-docket

# Run the witness
node test/docket.js

# Work in it — the hooks run on this repo through the plugin dir
claude --plugin-dir .
```

### Running Tests

The mechanical witness, which CI also runs:

```bash
node test/docket.js
```

The witness checks seven things, each with a planted failure in a temp copy:

1. every cite in a git-tracked text file names a ruling that exists
2. numbering is contiguous per prefix
3. every `UIUX §x` / `PRD §x` cite resolves to a heading
4. the bare-`§` ratchet does not exceed its recorded baseline
5. every supersession edge targets an earlier ruling
6. entries after the contract line satisfy the header contract
7. no existing entry's heading or body changed against `HEAD`

The two model-dependent suites, which need the CLI and credentials:

```bash
# The wedge: does the model cite a ruling from the injected list?
sh test/cites.sh

# The judge: four planted runs — FAIL, PASS, STALE, and a halt at /rule
sh test/judge.sh
```

Neither script is in CI, because they need credentials. Both are runnable by
anyone with the CLI. Their results are recorded in the ledger, under D16 and
D18.

---

<!-- USAGE -->
## Usage

### Record a ruling

```text
/rule
```

Five questions, refused if vague: what changed; the issue; the principle, from
the list spliced at load; every ruling it touches, with a verb; and the ruling
in prose, with its reason. It prints `RULING — PLEASE CONFIRM` and waits. Only
the human confirms — the maker that was blocked by the judge cannot amend the
ruling it failed.

### Start a project with a spine

```text
/constitute
```

Four gated questions with refusal rules. "General audience", "everyone" and
"non-technical" are refused; a purpose must be a specific verb on a specific
object; the feeling must survive every iteration and may not be a feature; and
the project must name at least three things it will refuse to do. It writes
`docs/PRD.md`, `docs/UIUX.md` and `docs/DECISIONS.md`, vendors the witness as
`test/docket.js`, and prints a CI step.

### Inspect the law

```text
/docket status
/docket query toolbar
/docket governs R6
/docket diff HEAD~1 HEAD
```

### Use it from a script

Every subcommand takes `--json`. The judge reads `docket index`, which is the
whole parse: an edge list, never a status table.

```bash
node bin/docket.js index | node -e 'const j=JSON.parse(require("fs").readFileSync(0));console.log(j.rulings.length)'
node bin/docket.js governs R6
node bin/docket.js check && node bin/docket.js status
```

---

<!-- KNOWN LIMITS -->
## Known Limits

* **A forged verdict is a visible call, not an impossibility.** Within one
  session the maker could run `docket verdict` itself. The judge is the only
  party the harness runs at Stop, and a forged verdict is a visible Bash call in
  the transcript. The boundary is tool permission, not cryptography.
* **The judge is an LLM pass over prose rulings.** It can cite, it cannot
  rewrite, and its features are files you can read. That is the whole defence
  against drift.
* **Cost.** One subagent per stop that touched a governed file, at most five per
  session between passes. A one-line change to an ungoverned file spawns
  nothing.
* **The judge's accuracy is the host's subagent's accuracy.** The protocol
  chooses no model, so the results recorded under D18 state which host and which
  date produced them. They are results on that host, on that date — not a
  general claim.

---

<!-- ROADMAP -->
## Roadmap

* [x] The witness: `docket check`, seven checks, CI red on a dangling cite
* [x] The hook: what governs this region, printed before the edit
* [x] `/rule`, `/constitute`, `/docket`, and the docket at session start
* [x] The judge: a Stop hook of type `agent`, scoring before it reads the trace
* [x] The packs: code, design, prose, decisions
* [ ] The substrate: the ~15% of a spatial tool that is reusable as a template
* [ ] A second host binding: the same core, a second thin layer

See the [open issues](https://github.com/AlastairZeved/the-docket/issues) for the
full list of proposed features and known issues.

---

<!-- CONTRIBUTING -->
## Contributing

Contributions are what make the open source community such an amazing place to
learn, inspire, and create. Any contributions you make are **greatly
appreciated**.

If you have a suggestion that would make this better, please fork the repo and
create a pull request. You can also simply open an issue with the tag
"enhancement". Don't forget to give the project a star! Thanks again!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

A change that alters a ruled number must name the ruling it supersedes and give
the measurement that forced the change. The witness will fail otherwise.

### Code of Conduct

This project follows a simple rule: argue with the evidence, not the person.
A finding is dismissed by a command whose output reproduces its absence, never
by argument.

---

<!-- FAQ -->
## FAQ

<details>
<summary>Does my law live in the plugin?</summary>

No. The law is files in your repository — `docs/PRD.md`, `docs/UIUX.md`,
`docs/DECISIONS.md`. The plugin can be uninstalled and the constitution still
governs, because the witness is a node script your repo owns and your CI runs.
A product that holds your law hostage is the failure this design exists to
avoid.

</details>

<details>
<summary>Why is supersession clause-level and not a status column?</summary>

Because in a real ledger a later ruling supersedes one clause of an earlier one,
or waives it for one case. A computed "superseded" status would declare a ruling
dead while most of it still binds. The index is an edge list; the reader judges.

</details>

<details>
<summary>What if the model ignores the hook?</summary>

The hook is informational, by rule. The gate is the judge, and the judge is the
gate whether or not the hook is read. If the measured wedge result is low, the
README and the marketplace description lead with job 2, the judge, and present
the hook as its first half.

</details>

<details>
<summary>Will the judge block every stop?</summary>

No. It scores only when the diff since the last pass touches a governed file or
the ledger. A one-line change to an ungoverned file spawns nothing. And if
located failures do not decrease after the third cycle, it surfaces the residue
once, tells the maker to relay it verbatim, then answers `SKIP` until a pass or
a new session. A judge that never passes and one that always passes are both
broken.

</details>

<details>
<summary>Can I use this without Claude Code?</summary>

The core is host-agnostic: it speaks stdin JSON, stdout text, exit codes and
markdown. `docs/PROTOCOL-BINDING.md` is one page on binding a second host: pipe
the edit event into `docket near` before an edit, show `docket status` at
session start, and run a read-only subagent on `judge/PROTOCOL.md` at "done".

</details>

---

<!-- LICENSE -->
## License

Distributed under the MIT License. See `LICENSE` for more information.

---

<!-- CONTACT -->
## Contact

Alastair Zeved — [@AlastairZeved](https://github.com/AlastairZeved)

Project Link: [https://github.com/AlastairZeved/the-docket](https://github.com/AlastairZeved/the-docket)

---

<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[contributors-shield]: https://img.shields.io/github/contributors/AlastairZeved/the-docket.svg?style=for-the-badge
[contributors-url]: https://github.com/AlastairZeved/the-docket/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/AlastairZeved/the-docket.svg?style=for-the-badge
[forks-url]: https://github.com/AlastairZeved/the-docket/network/members
[stars-shield]: https://img.shields.io/github/stars/AlastairZeved/the-docket.svg?style=for-the-badge
[stars-url]: https://github.com/AlastairZeved/the-docket/stargazers
[issues-shield]: https://img.shields.io/github/issues/AlastairZeved/the-docket.svg?style=for-the-badge
[issues-url]: https://github.com/AlastairZeved/the-docket/issues
[license-shield]: https://img.shields.io/github/license/AlastairZeved/the-docket.svg?style=for-the-badge
[license-url]: https://github.com/AlastairZeved/the-docket/blob/main/LICENSE
[version-shield]: https://img.shields.io/badge/version-0.1.0-blue?style=for-the-badge
[version-url]: https://github.com/AlastairZeved/the-docket/releases
[node-shield]: https://img.shields.io/badge/node-20%2B-brightgreen?style=for-the-badge
[node-url]: https://nodejs.org/
