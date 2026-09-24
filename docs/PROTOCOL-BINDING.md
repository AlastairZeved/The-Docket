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
denies (D1). Set `CLAUDE_PROJECT_DIR` to the project root if the host knows it;
else the core uses the git root.

**2. At session start** — show `docket status` to the agent:

    node bin/docket.js status

It prints the docket: the last rulings, rulings cited nowhere, pending addenda,
the last verdict and whether its session is surfaced, and the witness result.

**3. At "done"** — run a read-only subagent on `judge/PROTOCOL.md`, passing it
the transcript path, the session identifier and whether this stop was already
blocked once in this turn; block completion while it returns FAIL or STALE,
and pass its reason back to the agent that stopped. Deny the subagent every
write tool. Where the host lets a subagent run on a model other than the
maker's, bind it that way (D8): shared training is shared blind spots. Name no
model in the binding; let the host choose.

Two things a host may not give that subagent, and what the core does about
each. It may not tell the subagent where the plugin is: so the core, whenever
it runs as the host's own hook in a governed project (calls 1 and 2), writes its
absolute path to the project's `.docket/core`, and the subagent reads that
(`docs/FORMAT.md` 16). It may not let the subagent read outside the project: so
the core prints the protocol, the packs, the diff and the transcript itself
(`protocol`, `pack`, `gate --diff`, `transcript`), and the one permission the
judge needs is to run the core — in the host bound here, the rule
`Bash(node *docket.js*)`, with no space before the closing parenthesis, so that a
quoted path matches too. A subagent that cannot run the core cannot judge, and
must say so rather than allow the stop in silence — and because a subagent may
say nothing at all, the host binds `docket stop` beside it on the same event: a
command that blocks a governed stop no fresh verdict has judged, once, and
writes nothing (`judge/PROTOCOL.md`, the stop's mechanical half).

## What a binding may contain

A hook declaration per call, an agent declaration for the judge that points at
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
