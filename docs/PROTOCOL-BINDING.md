# PROTOCOL-BINDING.md — binding the core to a host

**Reader.** The author of a second host's binding, who knows that host's hooks
and subagents and not this core. **Purpose.** Bind the core in three calls and
nothing more. **Source.** D13 in `docs/DECISIONS.md`. The core (`bin/docket.js`,
`packs/`, `intake/`, `templates/`, `docs/FORMAT.md`, `judge/PROTOCOL.md`) speaks
stdin JSON, stdout text, exit codes and markdown, names no host, model or
vendor, and does all but these calls (D13).

**1. Before an edit** — pipe the edit into `near` and show its stdout to the
agent about to edit; a `Write`'s `tool_input` carries `content`:

    echo '{"tool_name":"Edit","tool_input":{"file_path":"<abs path>",'\
    '"old_string":"<text>","replace_all":false}}' | node bin/docket.js near

It prints the governed list (D2, D7) or nothing, and never denies (D1). Inside
a repository every command roots at the git root; outside one, set
`CLAUDE_PROJECT_DIR` to the project root, and `stop` hands its root to its
judge (D28, D44).

**2. At session start** — show `docket status` to the agent, the hook's input
on stdin and `--session-start` given: it prints the docket, and records the
commit the session's diff runs from so a commit before the stop is judged (D40).

**3. At "done"** — run the core's `stop`, the hook's input on stdin
(`session_id`, `transcript_path`, `cwd`, `stop_hook_active`), and give it, with
`--judge`, the command that starts your agent headless as the judge: a session
of its own, its prompt on stdin, every write tool denied, one permission — to
run the core — and a turn limit of its own.

    node bin/docket.js stop --permission "<the rule>" --judge "<the command>"

It runs as `exec <the command>`, so `stop` waits on the judge and bounds it: no
`;`, `&&` or `|` outside quotes, a variable as `env NAME=value <the command>`.
`stop` starts a judge only where one is needed, with a prompt naming the core
and the input's session, transcript and directory — nothing the maker wrote —
and answers nothing, to allow the stop, or a block with its reason as JSON. The
judge runs on the host's headless model; a person who wants another than the
maker's — shared training is shared blind spots — sets it in the host (D43).

**What the judge needs.** The core's path: `stop` writes it into the prompt,
and the core run as a hook in a governed project writes it to `.docket/core`
for a judge run by hand (`docs/FORMAT.md` 16). One permission, to run the core,
which prints all the judge reads — on this host `Bash(node *docket.js*)`, no
space before the `)`, so a quoted path matches. The host matches the rule
against a command's text, so it admits any node command naming a docket.js,
`node -e '<code>' x/docket.js` among them; the boundary is the call's place in
the transcript (D37's addendum). A project whose own checks are not the core
grants those too. A judge that cannot run the core cannot judge, and records
nothing: `stop` reads the record, never the judge's words, and a governed stop
with no record for its diff does not stand, once. The host's names stay in the
binding: its hooks pass the plugin root as `DOCKET_PLUGIN_ROOT`, and `stop`
takes the command and the rule as text (D13, D20, D37).

**What a binding may contain.** A hook per call, the third carrying the judge's
command; an agent declaration for a judge run by hand that points at
`judge/PROTOCOL.md` and denies writing; a skill per intake (`intake/RULE.md`,
`intake/CONSTITUTE.md`) that says "follow this file, then run the subcommand".
An intake writes in the turn the person confirms in: a host that grants a
skill's permission for its own turn asks once more there, and a headless session
writes only where its binding allows the core outright. A rule, a threshold, a
feature or a template in a binding is the core's: move it back.

**The vendored witness.** `docket vendor <dir>` copies `bin/docket.js` to
`<dir>/test/docket.js` and prints the CI step; run with no subcommand, the copy
is the witness of `docs/FORMAT.md` 13 (D9). CI needs no host and no plugin.
