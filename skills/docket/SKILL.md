---
name: docket
description: Read the ledger of rulings that governs this codebase — the docket, a search, or everything that bears on one ruling.
allowed-tools: Bash(node *docket.js *)
---

# /docket

`/docket` — the docket: the last rulings, the uncited ones, pending addenda,
and what the witness says.

`/docket query <term>` — every ruling whose heading or body matches, with its
edges and addenda.

`/docket governs <id>` — one ruling: what it governs, what governs it, each
edge with the clause that states it, its addenda, and the code that cites it.

Run the subcommand the argument names and show its output. With no argument,
run `status`:

!`node ${CLAUDE_PLUGIN_ROOT}/bin/docket.js status`

For `query` and `governs`, run the command yourself with the argument given:

```
node ${CLAUDE_PLUGIN_ROOT}/bin/docket.js query <term>
node ${CLAUDE_PLUGIN_ROOT}/bin/docket.js governs <id>
```

The output is the ledger's own reading. Report it; do not restate a ruling in
your own words, and do not compute a status the ledger does not give.
