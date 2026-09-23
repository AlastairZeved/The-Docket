---
name: rule
description: Record a decision where it will be found — five questions, a confirm block only you can answer, then one entry appended to the ledger and checked.
allowed-tools: Bash(node *docket.js *)
---

# /rule

Follow the intake below to the letter: the five questions, the refusal
rules, the escalation, the confirm block. It is `intake/RULE.md`, spliced here
at load so that no file need be read from wherever the plugin is installed:

!`cat ${CLAUDE_PLUGIN_ROOT}/intake/RULE.md`

The principles to choose from, spliced now from the ledger's own reading:

!`node ${CLAUDE_PLUGIN_ROOT}/bin/docket.js principles`

Run every command the intake names as
`node ${CLAUDE_PLUGIN_ROOT}/bin/docket.js <subcommand> …`. Stop at the confirm
block and wait for the person. On their `confirm`, run `append` and report its
output as printed.
