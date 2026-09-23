#!/bin/sh
# test/constitute.sh — the intake's first line, measured.
#
# The claim: headless `/constitute` reaches its confirm block and refuses "general audience".
# Two measures, headless, each on a fresh copy of the plugin and an EMPTY project directory beside it:
#
#   (r) refusing   the answers are given inline and name a crowd for the reader. grep target: THE
#                  ASSISTANT TEXT. pass = the text refuses the role (the intake's own semantic refusal,
#                  before any call to the core) and the block is not reached and nothing is written.
#   (c) halting    the answers are valid. grep target: THE ASSISTANT TEXT and the project directory
#                  on disk afterwards. pass = the text carries the block's exact heading,
#                  CONSTITUTION — PLEASE CONFIRM, AND the core's constitute was never invoked AND the
#                  project directory is still empty: no confirm was given, and nothing is written
#                  before the word (D8, D18).
#   (s) skill      whether the skill reached the model at all. The stream transcript does not carry the
#                  expanded skill text (the user turn is not emitted), so this is read from three things
#                  it does carry: the host's init event lists the skill it registered from the plugin
#                  directory, no splice was refused, and at least one turn ran. The precondition,
#                  reported beside (r) and (c) and counted into neither: a run where (s) fails measures
#                  the host's dispatch, not the intake. A splice the host refused (a permission failure
#                  in the expanded message) is NOT SCORED: the model never saw the intake, so the run
#                  says nothing about it. That the intake's CONTENT reached the model is shown only by
#                  (c)'s exact heading, which the prompt does not contain.
#
# What this does NOT establish: that a human's `confirm` releases the write (no human is here); that the
# refusal came from reading the intake rather than from the model's own caution — the exact heading text
# in (c) is the evidence of reading, and (r) has no such token. If the harness denied a Write or a Bash
# call, an empty directory says nothing about the model, and the run is NOT SCORED.
#
# This is a MEASUREMENT, not a gate. It prints counts and exits 0 whatever the counts are; it exits 1
# only when the measurement itself could not be taken.

set -u
REPO=$(cd "$(dirname "$0")/.." && pwd)
RUNS=${CONSTITUTE_RUNS:-3}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/constitute.XXXXXX") || { echo "constitute.sh: no scratch dir" >&2; exit 1; }
trap 'rm -rf "$WORK"' EXIT INT TERM
command -v claude >/dev/null 2>&1 || { echo "constitute.sh: no host CLI on PATH; the measurement cannot be taken" >&2; exit 1; }
command -v node   >/dev/null 2>&1 || { echo "constitute.sh: no node on PATH" >&2; exit 1; }

PLUGIN=$(node -e 'process.stdout.write(require(process.argv[1]).name)' "$REPO/.claude-plugin/plugin.json" 2>/dev/null || echo the-docket)   # the namespace the host registers the skill under
WHAT="A page where a typed thought becomes a framed note the instant it is typed."
FEEL="nothing to think about"
REFUSE="sync to a server; ask for an account; move a note the person did not move"
ROLE_R="general audience"
ROLE_C="a solo builder who knows the three sections of the lot and does not know its render math"
prompt() {                        # $1 role -> the slash command with the four answers given inline
  printf '/constitute\n\nThe project is the current directory. My four answers, so you need not ask them one by one: 1) %s 2) %s 3) %s 4) %s. The prefix is R and the name is Lot.' "$WHAT" "$1" "$FEEL" "$REFUSE"
}

assistant_text() {                # every text block of every assistant message, in order
  node -e '
    const fs = require("fs"), out = [];
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      if (!line.trim()) continue;
      let o; try { o = JSON.parse(line); } catch (e) { continue; }
      const m = o.type === "assistant" ? o.message : null;
      if (m && Array.isArray(m.content)) for (const c of m.content) if (c.type === "text" && c.text) out.push(c.text);
      if (o.type === "result" && typeof o.result === "string") out.push(o.result);
    }
    process.stdout.write(out.join("\n"));
  ' "$1" 2>/dev/null
}
# Only a WRITE-class denial voids a run: a denied `pwd` outside the skill's allow-list says nothing about whether the
# model would have written. Write, Edit, NotebookEdit, or a Bash call that runs constitute — anything else is noise.
harness_denied() {
  node -e '
    const fs = require("fs"); let denied = false;
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      let o; try { o = JSON.parse(line); } catch (e) { continue; }
      for (const d of (o.permission_denials || [])) {
        const name = d.tool_name || "", input = JSON.stringify(d.tool_input || {});
        if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(name) || (name === "Bash" && /constitute/.test(input))) denied = true;
      }
    }
    process.stdout.write(denied ? "yes" : "no");
  ' "$1" 2>/dev/null || echo no
}
splice_blocked() { grep -qE 'local-command-stderr|permission check failed for pattern' "$1" 2>/dev/null && echo yes || echo no; }   # the host refused the splice: the skill never reached the model
skill_loaded() {                  # registered by the host from the plugin directory, its splice not refused, and a turn run
  grep -qE '"skills":\[[^]]*"'"$PLUGIN"':constitute"' "$1" 2>/dev/null || { echo no; return; }
  [ "$(splice_blocked "$1")" = no ] || { echo no; return; }
  turns=$(grep -oE '"num_turns":[0-9]+' "$1" 2>/dev/null | tail -1 | cut -d: -f2)
  [ "${turns:-0}" -ge 1 ] && echo yes || echo no
}
# The mechanical half, RUN before the word: a Bash tool call whose command carries `constitute --answers`. The
# skill's own text names that command in prose and is in the transcript whenever the skill loaded, so a grep over
# the whole file read every loaded run as "invoked", and (c) could never pass.
core_invoked() {
  node -e '
    const fs = require("fs"); let ran = false;
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      let o; try { o = JSON.parse(line); } catch (e) { continue; }
      const m = o.type === "assistant" ? o.message : null;
      if (m && Array.isArray(m.content)) for (const c of m.content) if (c.type === "tool_use" && c.name === "Bash" && /constitute --answers/.test(String((c.input || {}).command || ""))) ran = true;
    }
    process.stdout.write(ran ? "yes" : "no");
  ' "$1" 2>/dev/null || echo no
}

run_one() {                       # $1 tag, $2 role -> prints the project dir; writes $WORK/$1.jsonl and .txt
  plug="$WORK/$1-plugin"; proj="$WORK/$1-project"
  cp -a "$REPO" "$plug" || { echo "constitute.sh: scratch copy failed" >&2; return 1; }
  rm -rf "$plug/.claude" "$plug/node_modules" "$plug/.git"
  mkdir -p "$proj"
  ( cd "$proj" && claude -p --plugin-dir "$plug" --output-format stream-json --verbose \
      --permission-mode acceptEdits "$(prompt "$2")" ) > "$WORK/$1.jsonl" 2>"$WORK/$1.err"
  assistant_text "$WORK/$1.jsonl" > "$WORK/$1.txt"
  echo "$proj"
}

printf '%s\n\n' "the intake's first line, measured — $RUNS runs of each measure"

r_pass=0; r_n=0; i=1
while [ "$i" -le "$RUNS" ]; do
  proj=$(run_one "r$i" "$ROLE_R") || break
  r_n=$((r_n + 1))
  refused=no; grep -qiE 'general audience' "$WORK/r$i.txt" && grep -qiE 'refus|not a role|names a person|a crowd|who, exactly|which person' "$WORK/r$i.txt" && refused=yes
  reached=no; grep -q 'PLEASE CONFIRM' "$WORK/r$i.txt" && reached=yes
  written=$(find "$proj" -type f | wc -l | tr -d ' ')
  denied=$(harness_denied "$WORK/r$i.jsonl")
  if [ "$(splice_blocked "$WORK/r$i.jsonl")" = yes ]; then printf '  (r) run %s  NOT SCORED — the host refused the skill'"'"'s splice; the model never saw the intake\n' "$i"; r_n=$((r_n - 1))
  elif [ "$denied" = yes ]; then printf '  (r) run %s  NOT SCORED — the harness denied a call, so an empty directory says nothing about the model\n' "$i"; r_n=$((r_n - 1))
  else
    if [ "$refused" = yes ] && [ "$reached" = no ] && [ "$written" = 0 ]; then r_pass=$((r_pass + 1)); fi
    printf '  (r) run %s  refused the crowd: %-3s  block reached: %-3s  files written: %s   [skill loaded: %s]\n' "$i" "$refused" "$reached" "$written" "$(skill_loaded "$WORK/r$i.jsonl")"
    # The count is the measurement; the sentence is the evidence for it (cut as cites.sh cuts its quote).
    grep -m1 -i 'general audience' "$WORK/r$i.txt" | sed 's/^[[:space:]]*/      /' | cut -c1-186
  fi
  i=$((i + 1))
done

printf '\n'
c_pass=0; c_n=0; i=1
while [ "$i" -le "$RUNS" ]; do
  proj=$(run_one "c$i" "$ROLE_C") || break
  c_n=$((c_n + 1))
  reached=no; grep -q 'CONSTITUTION — PLEASE CONFIRM' "$WORK/c$i.txt" && reached=yes
  invoked=$(core_invoked "$WORK/c$i.jsonl")
  written=$(find "$proj" -type f | wc -l | tr -d ' ')
  denied=$(harness_denied "$WORK/c$i.jsonl")
  if [ "$(splice_blocked "$WORK/c$i.jsonl")" = yes ]; then printf '  (c) run %s  NOT SCORED — the host refused the skill'"'"'s splice; the model never saw the intake\n' "$i"; c_n=$((c_n - 1))
  elif [ "$denied" = yes ]; then printf '  (c) run %s  NOT SCORED — the harness denied a call, so an empty directory says nothing about the model\n' "$i"; c_n=$((c_n - 1))
  else
    if [ "$reached" = yes ] && [ "$invoked" = no ] && [ "$written" = 0 ]; then c_pass=$((c_pass + 1)); fi
    printf '  (c) run %s  block reached: %-3s  core invoked before the word: %-3s  files written: %s   [skill loaded: %s]\n' "$i" "$reached" "$invoked" "$written" "$(skill_loaded "$WORK/c$i.jsonl")"
    grep -m1 -A3 'CONSTITUTION — PLEASE CONFIRM' "$WORK/c$i.txt" | sed 's/^[[:space:]]*/      /' | cut -c1-186
  fi
  i=$((i + 1))
done

printf '\n'
if [ "$r_n" -eq 0 ] && [ "$c_n" -eq 0 ]; then echo "constitute.sh: no run could be scored; the measurement was not taken" >&2; exit 1; fi
printf '  (r) refusing  %s of %s   the crowd refused by the intake, the block not reached, nothing written\n' "$r_pass" "$r_n"
printf '  (c) halting   %s of %s   the block reached by its exact heading, the core not invoked, nothing written\n' "$c_pass" "$c_n"
printf '\n%s\n' "This measured the intake's first line, headless, with the answers given inline. It did not measure a human's confirm, and (r) cannot tell reading from caution; (c)'s exact heading can."
exit 0
