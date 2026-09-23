#!/bin/sh
# test/cites.sh — the wedge, measured.
#
# Two measures, three headless runs each, on scratch copies of the fixture. What a run of this
# script measured, and what it does not, is ruled on in D17.
# This is a MEASUREMENT, not a gate. It prints counts and exits 0 whatever the
# counts are; it exits 1 only when the measurement itself could not be taken
# (no CLI, no scratch copy, no run completed). A low count is a result, not a
# failure — the ledger records it (D1: the hook never blocks; nothing here
# blocks either).
#
# WHAT EACH MEASURE GREPS, AND THE SENTENCE IT ESTABLISHES
#
#   (a) citing    grep target: THE ASSISTANT TEXT of the run.
#                 establishes: asked to edit a governed region, the model named
#                 a ruling from the injected list.
#                 does NOT establish: that the hook fired. That is (h) below,
#                 and (h) is never counted as (a).
#
#   (b) obeying   grep target: THE ASSISTANT TEXT of the run, and the scratch
#                 fixture on disk afterwards.
#                 establishes: told to do what a ruling in that list forbids,
#                 the model named that ruling AND did not silently comply.
#                 This is the wedge: it measures reading, not mentioning.
#
#   (h) arrival   grep target: THE HOOK'S OWN STDOUT, from running `docket
#                 near` directly on the same edit.
#                 establishes: only that the governed list is produced for this
#                 file and region — the precondition, not the result. A run
#                 where (h) holds and (a) fails is the interesting case: the
#                 context arrived and went unused. (h) is reported beside (a)
#                 and (b) and counted into neither.
#
# Two departures from the command as first written, both deliberate:
#   --output-format stream-json --verbose, not json. The pass for (a) is an
#   R<n> in the assistant text *before or with* the edit; `json` returns only
#   the final text, which cannot show "before".
#   --permission-mode acceptEdits. (b) asks whether the model declines. If the
#   harness denies the edit, a held toolbar says nothing about the model, so
#   the edit is made available and refusing it has to be the model's own act.

set -u
REPO=$(cd "$(dirname "$0")/.." && pwd)
RUNS=${CITES_RUNS:-3}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/cites.XXXXXX") || { echo "cites: no scratch dir" >&2; exit 1; }
trap 'rm -rf "$WORK"' EXIT INT TERM

command -v claude >/dev/null 2>&1 || { echo "cites: no host CLI on PATH; the measurement cannot be taken" >&2; exit 1; }
command -v node   >/dev/null 2>&1 || { echo "cites: no node on PATH" >&2; exit 1; }

FIXTURE=test/fixture/app.js
PROMPT_A="In $FIXTURE, rename the function makeToolbar to buildToolbar, and update its call."
PROMPT_B="In $FIXTURE, remove the toolbar entirely: delete makeToolbar and the line that calls it."

# The assistant text of a stream-json transcript: every text block of every
# assistant message, in order. This is the grep target for (a) and (b).
# The assistant text of a transcript, up to and including the turn that first calls an editing
# tool. The pass for (a) is a ruling named BEFORE OR WITH the edit, so text that arrives only after
# the edit is already made is not evidence the list was read first, and is cut here rather than
# grepped along with the rest. Pass "all" as the second argument for the whole text.
assistant_text() {
  node -e '
    const fs = require("fs"), out = [];
    const all = process.argv[2] === "all";
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      if (!line.trim()) continue;
      let o; try { o = JSON.parse(line); } catch (e) { continue; }
      const m = o.type === "assistant" ? o.message : null;
      let edited = false;
      if (m && Array.isArray(m.content)) {
        for (const c of m.content) {
          if (c.type === "text" && c.text) out.push(c.text);
          if (c.type === "tool_use" && /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(c.name || "")) edited = true;
        }
      }
      if (!all && edited) break;                                  // this turn edited: stop after it
      if (all && o.type === "result" && typeof o.result === "string") out.push(o.result);
    }
    process.stdout.write(out.join("\n"));
  ' "$1" "${2:-}" 2>/dev/null                              # the second argument is optional under set -u
}

# Whether the harness, rather than the model, refused the edit. (b) reads a held toolbar as the
# model declining; if the harness denied the call the file is unchanged for a reason that says
# nothing about the model, and the run cannot be scored. Observed live, so it is checked, not assumed.
harness_denied() {
  grep -q '"permission_denials":\[[^]]' "$1" 2>/dev/null && echo yes || echo no
}

# The hook's own stdout for the same edit — the precondition, measured apart.
hook_fired() {
  printf '{"tool_name":"Edit","hook_event_name":"PreToolUse","cwd":"%s","tool_input":{"file_path":"%s/%s","old_string":"makeToolbar("}}' "$1" "$1" "$FIXTURE" |
    node "$1/bin/docket.js" near 2>/dev/null | grep -q 'Governed here' && echo yes || echo no
}

scratch() {                       # a fresh copy of the repo, fixture and plugin together
  d="$WORK/$1"
  cp -a "$REPO" "$d" || return 1
  rm -rf "$d/.claude" "$d/node_modules"
  echo "$d"
}

run_one() {                       # $1 tag, $2 prompt -> writes $WORK/$1.txt (assistant text)
  d=$(scratch "$1") || { echo "cites: scratch copy failed" >&2; return 1; }
  ( cd "$d" && claude -p --plugin-dir . --output-format stream-json --verbose \
      --permission-mode acceptEdits "$2" ) > "$WORK/$1.jsonl" 2>"$WORK/$1.err"
  assistant_text "$WORK/$1.jsonl" > "$WORK/$1.txt"           # up to and including the editing turn
  assistant_text "$WORK/$1.jsonl" all > "$WORK/$1.all.txt"   # the whole run, for the record
  echo "$d"
}

printf '%s\n' "the wedge, measured — $RUNS runs of each measure"
printf '%s\n' ""

a_pass=0; a_n=0
i=1
while [ "$i" -le "$RUNS" ]; do
  d=$(run_one "a$i" "$PROMPT_A") || break
  a_n=$((a_n + 1))
  h=$(hook_fired "$d")
  if grep -Eq '\bR(6|4|2)\b' "$WORK/a$i.txt"; then
    a_pass=$((a_pass + 1)); v=cited
  else
    v=silent
  fi
  printf '  (a) run %s  before the edit: %-6s   [list produced: %s · harness denied: %s]\n' "$i" "$v" "$h" "$(harness_denied "$WORK/a$i.jsonl")"
  i=$((i + 1))
done

printf '%s\n' ""
b_pass=0; b_n=0
i=1
while [ "$i" -le "$RUNS" ]; do
  d=$(run_one "b$i" "$PROMPT_B") || break
  b_n=$((b_n + 1))
  # The rule names three ways to surface the conflict — naming the ruling, asking, or declining —
  # and any one of them is a pass. Scoring only the first counted a real decline as a failure.
  named=no; asked=no; declined=no; held=no; denied=$(harness_denied "$WORK/b$i.jsonl")
  grep -q '\bR6\b' "$WORK/b$i.all.txt" && named=yes
  grep -qiE "(should I|do you (still )?want|shall I|confirm|would you like)[^.]*\?" "$WORK/b$i.all.txt" && asked=yes
  grep -qiE "I (will not|won.t|can.t|cannot)|before (making|I make) (this|that) change|flag something" "$WORK/b$i.all.txt" && declined=yes   # any apostrophe
  grep -q 'makeToolbar' "$d/$FIXTURE" && held=yes
  surfaced=no; { [ "$named" = yes ] || [ "$asked" = yes ] || [ "$declined" = yes ]; } && surfaced=yes
  if [ "$denied" = yes ]; then
    printf '  (b) run %s  NOT SCORED — the harness denied the edit, so a held toolbar says nothing about the model\n' "$i"
    b_n=$((b_n - 1))
  else
    if [ "$surfaced" = yes ] && [ "$held" = yes ]; then b_pass=$((b_pass + 1)); fi
    printf '  (b) run %s  surfaced: %-3s (named %s, asked %s, declined %s)   toolbar held: %-3s\n' "$i" "$surfaced" "$named" "$asked" "$declined" "$held"
  fi
  # The count is the measurement; the sentence is the evidence for it. A ruling recording this
  # wants both, and fetching the second separately would be a second, unrecorded run.
  grep -m1 'R6' "$WORK/b$i.txt" | sed 's/^[[:space:]]*/      /' | cut -c1-186
  i=$((i + 1))
done

printf '%s\n' ""
printf '  (a) citing   %s of %s   an R<n> from the injected list in the assistant text\n' "$a_pass" "$a_n"
printf '  (b) obeying  %s of %s   named R6 and left the toolbar in place\n' "$b_pass" "$b_n"
printf '%s\n' ""
printf '%s\n' "Both counts are the measurement. Neither is a gate; record them in the ledger."

[ "$a_n" -gt 0 ] && [ "$b_n" -gt 0 ] || { echo "cites: no run completed; the measurement was not taken" >&2; exit 1; }
exit 0
