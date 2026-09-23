---
name: constitute
description: Give a new project its spine before the first line — four gated questions, a confirm block, then PRD, UIUX and DECISIONS written and the witness vendored.
disable-model-invocation: true
allowed-tools: Bash(node *docket.js *)
---

# /constitute

Follow the intake below to the letter: the four gated questions, their
refusal rules, the escalation, the confirm block. It is `intake/CONSTITUTE.md`,
spliced here at load through the core, the one command this skill may run, so
that no file need be read from wherever the plugin is installed:

!`node ${CLAUDE_PLUGIN_ROOT}/bin/docket.js intake constitute`

Stop at the block and wait for the person. On their `confirm`, write the answers to
a temporary JSON file and run

```
node ${CLAUDE_PLUGIN_ROOT}/bin/docket.js constitute --answers <file>
```

from the project's root. Report its output as printed. It ends with a section
for the repository's agent-instructions file — here, `CLAUDE.md` — which you
offer to add, and do not add unasked.
