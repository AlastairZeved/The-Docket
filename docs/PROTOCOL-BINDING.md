# PROTOCOL-BINDING.md — binding the core to a host

The core is `bin/docket.js`, `packs/`, `intake/`, `templates/`, `docs/FORMAT.md`
and `judge/PROTOCOL.md`. It speaks stdin JSON, stdout text, exit codes and
markdown, and names no host, model or vendor (D13). A host binds it with three
calls. Everything else — discovery, the window, the edges, the gate, the
verdict, the intakes — is the core's, and nothing in it moves when a second
host arrives.

**Reader.** The author of a second host's binding; they know their host's hook
and subagent mechanisms, and they do not know this core. **Purpose.** Bind the
core to a host in three calls and nothing more. **Source.** D13 in
`docs/DECISIONS.md`.

## The three calls

**1. Before an edit** — pipe the edit into `near` and show its stdout to the
agent that is about to edit:

    echo '{"tool_name":"Edit","tool_input":{"file_path":"<abs path>","old_string":"<text>","replace_all":false}}' \
      | node bin/docket.js near

`tool_name` is `Edit` or `Write`; for `Write`, `tool_input` carries `file_path`
and `content`. `near` prints the governed list (D2, D7) or nothing; it never
denies (D1). Inside a repository every command roots at the git root, whatever
the host says; outside one, set `CLAUDE_PROJECT_DIR` to the project root if the
host knows it, and `stop` hands its root to the judge it starts, so the judge and
the stop read one state whichever of them the host tells the project directory
(D28, D44).

**2. At session start** — show `docket status` to the agent, with the hook's
input on stdin:

    node bin/docket.js status --session-start

It prints the docket: the last rulings, rulings cited nowhere, pending addenda,
the last verdict and whether its session is surfaced, and the witness result.
From the input it reads the session's identifier (`session_id`) and why it starts
(`source`), and records the commit its diff runs from, so a change the maker
commits before it stops is still judged (D40).

**3. At "done"** — run the core's `stop` with the hook's input on stdin — a
JSON object with the session identifier (`session_id`), the maker's transcript
(`transcript_path`), the project directory (`cwd`) and whether this stop was
already blocked once in this turn (`stop_hook_active`) — and give it, with
`--judge`, the command that starts your agent headless as the
judge: a session of its own that reads its prompt on stdin, with every write
tool denied, one permission — to run the core — and a turn limit of its own:

    node bin/docket.js stop --permission "<the rule>" --judge "<the command>"

The command is one command, run as `exec <the command>`, so the judge is the
process `stop` waits on and stops at its bound: no `;`, `&&` or `|` outside quotes,
and a variable set as `env NAME=value <the command>`.

`stop` decides what needs no judge, starts the judge for the rest with a prompt
that names the core and carries the hook input's session, transcript path and
directory — none of what the maker wrote — waits for it, and answers on
stdout: nothing, to allow the stop, or a block with its reason as JSON. The judge
runs on the model the host gives a headless session; name no model in the
binding, and a person who wants the judge on a model other than the maker's —
shared training is shared blind spots — sets that in the host (D43).

Two things the judge needs that a host may not give it, and what the core does
about each. Where the plugin is: `stop` is the core, so it writes its own path
into the judge's prompt; for a judge a person runs by hand the core, whenever it
runs as the host's own hook in a governed project (calls 1 and 2), writes its
absolute path to the project's `.docket/core`, and that judge reads it
(`docs/FORMAT.md` 16). Reading outside the project: the core prints the
protocol, the packs, the diff and the transcript itself (`protocol`, `pack`,
`gate --diff`, `transcript`), and the one permission the judge needs is to run
the core — in the host bound here, the rule `Bash(node *docket.js*)`, with no
space before the closing parenthesis, so that a quoted path matches too; a
project whose own checks are not the core (the code pack's first feature) grants
the judge that command as well. A judge that cannot run the core cannot judge,
and records nothing; and a judge may say anything, so `stop` reads the record
and not the judge's words, and a governed stop with no record for its diff does
not stand, once (`judge/PROTOCOL.md`, the stop). The host's own names stay in the
binding: its command hooks pass the plugin root to the core as
`DOCKET_PLUGIN_ROOT`, and `stop` is given the command and the permission's
spelling as text, so the core names neither the host's variable, nor its
command, nor its rule syntax (D13, D20, D37).

A host may also cap its agent's turns. The host bound here stops an agent hook
at its fiftieth message, about two for each tool call, and a judge stopped there
recorded nothing (D30); so the judge is not the host's hook agent but a session
of its own, started by `stop`, with the turn limit the binding gives it and the
bound `stop` keeps. The protocol's commands print what a judgement needs in few
calls (D30).

## What a binding may contain

A hook declaration per call — the third carrying the command that starts the
judge — an agent declaration for a judge run by hand that points at
`judge/PROTOCOL.md` and denies writing, and a skill or command per intake
(`intake/RULE.md`, `intake/CONSTITUTE.md`) that says "follow this file, then run
the subcommand". Each is a few lines. A binding that contains a rule, a
threshold, a feature or a template has taken something that belongs to the
core; move it back.

## The vendored witness

`docket vendor <dir>` copies `bin/docket.js` to `<dir>/test/docket.js` and prints
the CI step that runs it. Run with no subcommand, the copy is the witness that
`docs/FORMAT.md` (13) describes (D9). CI needs no host and no plugin: the law is
checked where it lives.
