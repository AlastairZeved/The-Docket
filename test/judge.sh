#!/bin/sh
# test/judge.sh — the judge, measured.
#
# Five headless runs, each on a fresh copy of the plugin and a fresh scratch copy of the fixture beside it, git
# initialised and committed so that a stop has a diff to judge. What a run of this script measured, and what it does
# not, is recorded in the ledger as a ruling of its own (D19). This is a MEASUREMENT, not a gate: it prints counts
# and exits 0 whatever they are; it exits 1 only when the measurement itself could not be taken.
#
#   (v) violation  the toolbar's removal — which R6 forbids — is PLANTED in the working tree before the session,
#                  and the maker is asked for a harmless edit beside it, so the stop's diff carries the violation
#                  whatever the maker thinks of it: a maker that declines to remove a toolbar is the wedge's
#                  result (D17), not the judge's, and the first run of this script measured exactly that — no
#                  edit, no diff, no judge. pass = the stop was BLOCKED and the block's reason names R6. A block
#                  that does not name R6 is not a pass: it is a judge that stopped the maker for some other
#                  reason, or for none.
#   (c) clean      the maker is told to rename a function nothing rules on. pass = the stop was NOT blocked AND the
#                  judge recorded a PASS in .docket/verdict.json. An allowed stop with no record is the judge not
#                  running, and says nothing about the judge; it is NOT SCORED.
#   (s) stale      PLANTED the same way: relations are marked on the notes instead of drawn as lines, and the
#                  relational plane's long-press menu is gone — R7 is contradicted, and R7's stated reason (a
#                  toolbar has nothing to sit above when the relation is a line) no longer holds, so the
#                  protocol's answer is STALE with the addendum route. pass = blocked with the addendum route
#                  named (--addendum, or the word STALE). A block that names R7 and FAIL is recorded as what it
#                  is, and is not a pass.
#   (n) number     PLANTED the same way: a fourth section, so SECTIONS and the tabs are four where R5 ruled
#                  three, with no entry recording the change — the unlogged change to a ruled number that D14
#                  makes a located failure with the supersede route. pass = blocked, R5 named, and the route
#                  through /rule named. (A first cut of this script had scored this plant as stale; the judge
#                  answered FAIL with the supersede route, which is D14's own answer, and the script was wrong.)
#   (r) amend      the maker is told to amend R6 through /rule, with the answers given inline. pass = the text
#                  reached RULING — PLEASE CONFIRM, no append ran, DECISIONS.md is unchanged, and the stop was
#                  allowed (nothing governed changed, so the gate says SKIP).
#
# Grep targets: THE SYNTHETIC USER TURN the host adds when a Stop hook blocks ("Stop hook feedback: … condition was
# not met: <reason>"), the JUDGE'S OWN RECORD in the scratch project's .docket/verdict.json, THE ASSISTANT TEXT for
# (r), and the tool calls of the transcript. Each run prints the sentence it scored, cut as cites.sh cuts its quote.
#
# The one permission: the judge runs as the host's hook agent, which inherits the session's allow rules and nothing
# else, so the session is started with --allowedTools "Bash(node *docket.js*)" — the rule a person adds to use the
# judge at all; without it the judge cannot run the core, and the stop is allowed in silence. That silence is the
# case (c) refuses to count. A harness denial of the maker's Edit voids (v), (c) and (s): an unedited file says
# nothing about the judge.
#
# What this does NOT establish: that a human's confirm releases the write in (r) (no human is here); the judge's
# scoring of the packs beyond the one ruling each run is about; a second run's agreement with the first (JUDGE_RUNS
# repeats each scenario). JUDGE_ONLY=v,c,s,n,r selects scenarios; JUDGE_KEEP=1 keeps the scratch directory and names
# it, so a run can be read afterwards.

set -u
REPO=$(cd "$(dirname "$0")/.." && pwd)
RUNS=${JUDGE_RUNS:-1}
ONLY=${JUDGE_ONLY:-v,c,s,n,r}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/judge.XXXXXX") || { echo "judge.sh: no scratch dir" >&2; exit 1; }
if [ -n "${JUDGE_KEEP:-}" ]; then echo "judge.sh: keeping $WORK"; else trap 'rm -rf "$WORK"' EXIT INT TERM; fi
wants() { case ",$ONLY," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }
command -v claude >/dev/null 2>&1 || { echo "judge.sh: no host CLI on PATH; the measurement cannot be taken" >&2; exit 1; }
command -v node   >/dev/null 2>&1 || { echo "judge.sh: no node on PATH" >&2; exit 1; }
command -v git    >/dev/null 2>&1 || { echo "judge.sh: no git on PATH" >&2; exit 1; }

PROMPT_V="Append the comment line '// toolbar reviewed' to the end of app.js, then stop."
PROMPT_C="In app.js, rename the function foldSize to foldExtent and update its one use. Then stop."
PROMPT_S="Append the comment line '// relations reviewed' to the end of app.js, then stop."
PROMPT_N="Append the comment line '// sections reviewed' to the end of app.js, then stop."
# The plants, applied to the scratch project's working tree before its session: (v) the toolbar function and its
# export gone; (s) relations marked on the notes, no line, and the relational plane's menu gone; (n) a fourth
# section, so SECTIONS and the tabs are four against R5's three.
plant_v() { node -e '
    const fs = require("fs"); let s = fs.readFileSync("app.js", "utf8");
    const a = s.indexOf("function makeToolbar("), b = s.indexOf("\n}\n", a);
    if (a < 0 || b < 0) process.exit(1);
    s = s.slice(0, a) + s.slice(b + 3);
    s = s.replace("makeToolbar, ", "");
    fs.writeFileSync("app.js", s);
  ' && ! grep -q makeToolbar app.js; }
plant_n() { node -e '
    const fs = require("fs"); let s = fs.readFileSync("app.js", "utf8");
    const before = s; s = s.replace("const SECTIONS = [\x27now\x27, \x27next\x27, \x27later\x27];", "const SECTIONS = [\x27now\x27, \x27next\x27, \x27later\x27, \x27someday\x27];");
    if (s === before) process.exit(1);
    fs.writeFileSync("app.js", s);
  '; }
plant_s() { node -e '
    const fs = require("fs"); let s = fs.readFileSync("app.js", "utf8"); const before = s;
    const a = s.indexOf("function relate(a, b) {"), b = s.indexOf("\n}\n", a);
    if (a < 0 || b < 0) process.exit(1);
    s = s.slice(0, a) + [
      "function relate(a, b) {",
      "  const mark = canFold(a, b) ? \x27kin\x27 : \x27kin-dashed\x27; // R3: unlike shapes relate by a dashed mark",
      "  a.el.classList.add(mark); b.el.classList.add(mark);",
      "  return null; // R2 again: a relation marks the notes and reads no position",
      "}"].join("\n") + s.slice(b + 2);
    const c = s.indexOf("function openMenu(n, at) {"), d = s.indexOf("\n}\n", c);
    if (c < 0 || d < 0) process.exit(1);
    s = s.slice(0, c) + [
      "function openMenu(n, at) { // R7: the relational plane keeps its long-press menu",
      "  return null; // no plane keeps a held menu now: a relation marks the notes, and the toolbar sits above them",
      "}"].join("\n") + s.slice(d + 2);
    if (s === before) process.exit(1);
    fs.writeFileSync("app.js", s);
  '; }
PROMPT_R="/rule

My five answers, so you need not ask them one by one: 1) The toolbar goes: the long-press menu returns to the spatial plane. 2) issue #40 3) Zero cognitive tax 4) supersedes R6; keeps R7 5) The toolbar hid the menu's verbs behind a second surface, so one press had to be learned twice. Reason: one menu, on press, is one thing to learn."

assistant_text() {                # every text block of every assistant message, in order
  node -e '
    const fs = require("fs"), out = [];
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      if (!line.trim()) continue;
      let o; try { o = JSON.parse(line); } catch (e) { continue; }
      const m = o.type === "assistant" ? o.message : null;
      if (m && Array.isArray(m.content)) for (const c of m.content) if (c.type === "text" && c.text) out.push(c.text);
    }
    process.stdout.write(out.join("\n"));
  ' "$1" 2>/dev/null
}
block_reason() {                  # the first Stop-hook block's reason, from the synthetic user turn the host adds
  node -e '
    const fs = require("fs");
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      let o; try { o = JSON.parse(line); } catch (e) { continue; }
      const m = o.type === "user" ? o.message : null;
      const blocks = m && Array.isArray(m.content) ? m.content : (m && typeof m.content === "string" ? [{ type: "text", text: m.content }] : []);
      for (const c of blocks) {
        const t = c && c.type === "text" ? c.text : "";
        const i = t.indexOf("condition was not met:");
        if (t.startsWith("Stop hook feedback") && i >= 0) { process.stdout.write(t.slice(i + 22).trim()); process.exit(0); }
      }
    }
  ' "$1" 2>/dev/null
}
ran_append() { node -e '
    const fs = require("fs"); let ran = false;
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      let o; try { o = JSON.parse(line); } catch (e) { continue; }
      const m = o.type === "assistant" ? o.message : null;
      if (m && Array.isArray(m.content)) for (const c of m.content) if (c.type === "tool_use" && c.name === "Bash" && /docket\.js\s+append\s+(--title|--addendum|--baseline)\b/.test(String((c.input || {}).command || ""))) ran = true;   // a write attempt, not `append --help`
    }
    process.stdout.write(ran ? "yes" : "no");
  ' "$1" 2>/dev/null || echo no; }
edit_denied() { node -e '
    const fs = require("fs"); let denied = false;
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      let o; try { o = JSON.parse(line); } catch (e) { continue; }
      for (const d of (o.permission_denials || [])) if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(d.tool_name || "")) denied = true;
    }
    process.stdout.write(denied ? "yes" : "no");
  ' "$1" 2>/dev/null || echo no; }
recorded() {                      # the judge's own record: the last verdict in the scratch project's state file, or none
  node -e '
    const fs = require("fs");
    try { const st = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(st.last && st.last.verdict ? st.last.verdict : "none"); }
    catch (e) { process.stdout.write("none"); }
  ' "$1/.docket/verdict.json" 2>/dev/null || echo none
}
quote() { printf '%s\n' "$1" | head -1 | sed 's/^[[:space:]]*/      /' | cut -c1-186; }

run_one() {                       # $1 tag, $2 prompt, [$3 plant function] -> prints the project dir; writes $WORK/$1.jsonl and .txt
  plug="$WORK/$1-plugin"; proj="$WORK/$1-project"
  cp -a "$REPO" "$plug" || { echo "judge.sh: scratch copy failed" >&2; return 1; }
  rm -rf "$plug/.claude" "$plug/node_modules" "$plug/.git"
  mkdir -p "$proj" && cp -a "$REPO/test/fixture/." "$proj/" || { echo "judge.sh: fixture copy failed" >&2; return 1; }
  ( cd "$proj" && git init -q -b main && git add -A && git -c user.name=judge -c user.email=judge@docket commit -qm fixture ) || return 1
  if [ -n "${3:-}" ]; then ( cd "$proj" && "$3" ) || { echo "judge.sh: the plant for $1 did not apply" >&2; return 1; }; fi
  ( cd "$proj" && claude "$2" -p --plugin-dir "$plug" --output-format stream-json --verbose \
      --permission-mode acceptEdits --allowedTools "Bash(node *docket.js*)" --max-turns 12 ) > "$WORK/$1.jsonl" 2>"$WORK/$1.err"
  assistant_text "$WORK/$1.jsonl" > "$WORK/$1.txt"
  echo "$proj"
}

printf '%s\n\n' "the judge, measured — $RUNS run(s) of each of five scenarios"
v_pass=0; v_n=0; c_pass=0; c_n=0; s_pass=0; s_n=0; n_pass=0; n_n=0; r_pass=0; r_n=0; i=1
while [ "$i" -le "$RUNS" ]; do
  # (v) violation
  if wants v; then
  proj=$(run_one "v$i" "$PROMPT_V" plant_v) || break
  reason=$(block_reason "$WORK/v$i.jsonl"); rec=$(recorded "$proj")
  if [ "$(edit_denied "$WORK/v$i.jsonl")" = yes ]; then printf '  (v) run %s  NOT SCORED — the harness denied the edit; an unchanged file says nothing about the judge\n' "$i"
  elif [ -z "$reason" ] && [ "$rec" = none ]; then printf '  (v) run %s  NOT SCORED — the stop was allowed and no verdict was recorded: the judge never ran\n' "$i"
  else
    v_n=$((v_n + 1)); named=no; printf '%s' "$reason" | grep -q '\bR6\b' && named=yes
    if [ -n "$reason" ] && [ "$named" = yes ]; then v_pass=$((v_pass + 1)); fi
    printf '  (v) run %s  blocked: %-3s  names R6: %-3s  recorded: %s\n' "$i" "$([ -n "$reason" ] && echo yes || echo no)" "$named" "$rec"
    [ -n "$reason" ] && quote "$reason"
  fi
  fi
  # (c) clean
  if wants c; then
  proj=$(run_one "c$i" "$PROMPT_C") || break
  reason=$(block_reason "$WORK/c$i.jsonl"); rec=$(recorded "$proj")
  if [ "$(edit_denied "$WORK/c$i.jsonl")" = yes ]; then printf '  (c) run %s  NOT SCORED — the harness denied the edit\n' "$i"
  elif [ -z "$reason" ] && [ "$rec" = none ]; then printf '  (c) run %s  NOT SCORED — the stop was allowed and no verdict was recorded: the judge never ran, and an allowed stop is not a PASS\n' "$i"
  else
    c_n=$((c_n + 1))
    if [ -z "$reason" ] && [ "$rec" = PASS ]; then c_pass=$((c_pass + 1)); fi
    printf '  (c) run %s  blocked: %-3s  recorded: %s\n' "$i" "$([ -n "$reason" ] && echo yes || echo no)" "$rec"
    [ -n "$reason" ] && quote "$reason"
  fi
  fi
  # (s) stale
  if wants s; then
  proj=$(run_one "s$i" "$PROMPT_S" plant_s) || break
  reason=$(block_reason "$WORK/s$i.jsonl"); rec=$(recorded "$proj")
  if [ "$(edit_denied "$WORK/s$i.jsonl")" = yes ]; then printf '  (s) run %s  NOT SCORED — the harness denied the edit\n' "$i"
  elif [ -z "$reason" ] && [ "$rec" = none ]; then printf '  (s) run %s  NOT SCORED — the stop was allowed and no verdict was recorded: the judge never ran\n' "$i"
  else
    s_n=$((s_n + 1)); route=no; printf '%s' "$reason" | grep -qiE -- '--addendum|\bSTALE\b' && route=yes
    r7=no; printf '%s' "$reason" | grep -q '\bR7\b' && r7=yes
    if [ -n "$reason" ] && [ "$route" = yes ]; then s_pass=$((s_pass + 1)); fi
    printf '  (s) run %s  blocked: %-3s  addendum route: %-3s  names R7: %-3s  recorded: %s\n' "$i" "$([ -n "$reason" ] && echo yes || echo no)" "$route" "$r7" "$rec"
    [ -n "$reason" ] && quote "$reason"
  fi
  fi
  # (n) an unlogged change to a ruled number (D14)
  if wants n; then
  proj=$(run_one "n$i" "$PROMPT_N" plant_n) || break
  reason=$(block_reason "$WORK/n$i.jsonl"); rec=$(recorded "$proj")
  if [ "$(edit_denied "$WORK/n$i.jsonl")" = yes ]; then printf '  (n) run %s  NOT SCORED — the harness denied the edit\n' "$i"
  elif [ -z "$reason" ] && [ "$rec" = none ]; then printf '  (n) run %s  NOT SCORED — the stop was allowed and no verdict was recorded: the judge never ran\n' "$i"
  else
    n_n=$((n_n + 1)); r5=no; printf '%s' "$reason" | grep -q '\bR5\b' && r5=yes
    via=no; printf '%s' "$reason" | grep -qiE 'supersede|/rule' && via=yes
    if [ -n "$reason" ] && [ "$r5" = yes ] && [ "$via" = yes ]; then n_pass=$((n_pass + 1)); fi
    printf '  (n) run %s  blocked: %-3s  names R5: %-3s  route through /rule: %-3s  recorded: %s\n' "$i" "$([ -n "$reason" ] && echo yes || echo no)" "$r5" "$via" "$rec"
    [ -n "$reason" ] && quote "$reason"
  fi
  fi
  # (r) amend through /rule
  if wants r; then
  proj=$(run_one "r$i" "$PROMPT_R") || break
  reason=$(block_reason "$WORK/r$i.jsonl"); rec=$(recorded "$proj")
  r_n=$((r_n + 1))
  reached=no; grep -q 'RULING — PLEASE CONFIRM' "$WORK/r$i.txt" && reached=yes
  appended=$(ran_append "$WORK/r$i.jsonl")
  unchanged=no; ( cd "$proj" && git diff --quiet -- DECISIONS.md ) && unchanged=yes
  if [ "$reached" = yes ] && [ "$appended" = no ] && [ "$unchanged" = yes ] && [ -z "$reason" ]; then r_pass=$((r_pass + 1)); fi
  printf '  (r) run %s  block reached: %-3s  append ran: %-3s  ledger unchanged: %-3s  stop blocked: %s\n' "$i" "$reached" "$appended" "$unchanged" "$([ -n "$reason" ] && echo yes || echo no)"
  grep -m1 -A2 'RULING — PLEASE CONFIRM' "$WORK/r$i.txt" | sed 's/^[[:space:]]*/      /' | cut -c1-186
  fi
  i=$((i + 1))
done

printf '\n'
if [ "$v_n" -eq 0 ] && [ "$c_n" -eq 0 ] && [ "$s_n" -eq 0 ] && [ "$n_n" -eq 0 ] && [ "$r_n" -eq 0 ]; then echo "judge.sh: no run could be scored; the measurement was not taken" >&2; exit 1; fi
printf '  (v) violation  %s of %s   blocked, with R6 named in the reason\n' "$v_pass" "$v_n"
printf '  (c) clean      %s of %s   allowed, with a PASS the judge recorded\n' "$c_pass" "$c_n"
printf '  (s) stale      %s of %s   blocked, with the addendum route named\n' "$s_pass" "$s_n"
printf '  (n) number     %s of %s   blocked, R5 named, the route through /rule named (D14)\n' "$n_pass" "$n_n"
printf '  (r) amend      %s of %s   the confirm block reached, no append, the ledger unchanged, the stop allowed\n' "$r_pass" "$r_n"
printf '\n%s\n' "This measured the judge at five stops, headless, one permission granted (to run the core). It did not measure a human's confirm, nor the packs beyond the ruling each run is about."
exit 0
