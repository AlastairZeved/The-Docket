#!/bin/sh
# test/judge.sh — the judge, measured.
#
# Five headless runs, each on a fresh copy of the plugin and a fresh scratch copy of the fixture beside it, git
# initialised and committed so that a stop has a diff to judge. What a run of this script measured, and what it does
# not, is recorded in the ledger as a ruling of its own (D19). This is a MEASUREMENT of the judge and the GATE of its
# calibration (D15): it prints what each run showed, and exits 1 unless every scenario was scored and every scored
# run met its outcome — the judge's own first verdict on each planted case, the one the protocol gives (FAIL for the
# violation, STALE for the stale case), with the ruling named and its route, a PASS of its own on the clean case, and the halt at /rule — or when the measurement
# itself could not be taken. A block alone is not a judgement: the stop's mechanical half blocks an unjudged stop too,
# so every planted outcome is read from the judge's record, and a block is required beside it.
#
#   (v) violation  the toolbar's removal — which R6 forbids — is PLANTED in the working tree before the session,
#                  and the maker is asked for a harmless edit beside it, so the stop's diff carries the violation
#                  whatever the maker thinks of it: a maker that declines to remove a toolbar is the wedge's
#                  result (D17), not the judge's, and the first run of this script measured exactly that — no
#                  edit, no diff, no judge. pass = the judge's first verdict is FAIL (D24) — the toolbar's reason, that a
#                  menu held open hides the note, still holds when the toolbar is deleted — its lines name R6,
#                  and a block the maker saw names R6. A block that does not name R6 is not a pass: it is a judge
#                  that stopped the maker for some other reason, or for none.
#   (c) clean      the maker is told to rename a function nothing rules on. pass = the stop was NOT blocked AND the
#                  judge's first verdict is a PASS. An allowed stop with no record is the judge not
#                  running, and it fails the clean case: an allowed stop is not a PASS.
#   (s) stale      PLANTED the same way, every cite kept: relations are marked on the notes instead of drawn as
#                  lines, and the relational plane's long-press menu is gone with its R7 cite still on it — R7 is
#                  contradicted, and R7's stated reason (a toolbar has nothing to sit above when the relation is a
#                  line) no longer holds, and nothing else in the diff fails, so the protocol's one answer is STALE
#                  with the addendum route. pass = the judge's first verdict is STALE, its lines name R7 and the
#                  addendum route, and a block names R7. (An earlier plant also dropped a cite, which gave the code
#                  pack a failure of its own, so FAIL was a defensible answer to it; this one leaves none.)
#   (n) number     PLANTED the same way: a fourth section, so SECTIONS and the tabs are four where R5 ruled
#                  three, with no entry recording the change — the unlogged change to a ruled number that D14
#                  makes a located failure. pass = the judge's first verdict names R5 and routes it as its word
#                  says: FAIL with the supersede route (D14's first clause, the reading D14's addendum keeps), or
#                  STALE with the addendum route (the reading R5's own title admits), and a block names R5.
#   (r) amend      the maker is told to amend R6 through /rule, with the answers given inline. pass = the text
#                  reached RULING — PLEASE CONFIRM, no append ran, DECISIONS.md is unchanged, and the stop was
#                  allowed (nothing governed changed, so the gate says SKIP).
#
# Grep targets: THE JUDGE'S OWN RECORD — the first line of the scratch project's .docket/verdicts.jsonl, its first
# answer, written by the core's verdict command; EVERY SYNTHETIC USER TURN the host adds when a Stop hook blocks
# ("Stop hook feedback: …"), since two handlers can block; THE ASSISTANT TEXT for (r); and the maker's tool calls. A
# run whose maker ran the verdict command itself is NOT SCORED — the record is then not the judge's alone — and an
# unscored scenario fails the gate. Each run prints the sentence it scored, cut as cites.sh cuts its quote, and the
# core's trail — every command the core ran in the project, and when — since a host keeps no transcript of its hook
# agent (DOCKET_TRAIL, D25).
#
# The one permission: the judge runs as the host's hook agent, which inherits the session's allow rules and nothing
# else, so the session is started with --allowedTools "Bash(node *docket.js*)" — the rule a person adds to use the
# judge at all; without it the judge cannot run the core, and the stop's mechanical half refuses the unjudged stop.
# A harness denial of the maker's Edit voids (c) alone: the planted cases' diffs are in the tree before the session.
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
# export gone; (s) relations marked on the notes, no line, and the relational plane's menu gone, every cite kept (the
# three in relate() stay, and R7's stays on the emptied menu); (n) a fourth section, so SECTIONS and the tabs are four
# against R5's three.
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
      "  a.el.style.minHeight = b.el.style.minHeight = HIT_FLOOR + \x27px\x27; // \u00a74 a related note is a hit target too",
      "  return null; // R2 again: a relation marks the notes; it reads and writes no position",
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
block_reasons() {                 # every Stop-hook block's reason, in order, one per line: the host adds a synthetic user turn for each
  node -e '
    const fs = require("fs"), out = [];
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      let o; try { o = JSON.parse(line); } catch (e) { continue; }
      const m = o.type === "user" ? o.message : null;
      const blocks = m && Array.isArray(m.content) ? m.content : (m && typeof m.content === "string" ? [{ type: "text", text: m.content }] : []);
      for (const c of blocks) {
        const t = c && c.type === "text" ? c.text : "";
        if (!t.startsWith("Stop hook feedback")) continue;
        const i = t.indexOf("condition was not met:");
        out.push((i >= 0 ? t.slice(i + 22) : t.slice(t.indexOf("\n") + 1)).trim().replace(/\s*\n\s*/g, " "));
      }
    }
    process.stdout.write(out.join("\n"));
  ' "$1" 2>/dev/null
}
first_verdict() {                 # the judge's first answer: the first line of the verdict log, as "<VERDICT><tab><its lines, joined by ' | '>"
  node -e '
    const fs = require("fs");
    try { const v = JSON.parse(fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean)[0]); process.stdout.write(v.verdict + "\t" + String(v.reason || "").split("\n").join(" | ")); }
    catch (e) { process.stdout.write("none\t"); }
  ' "$1/.docket/verdicts.jsonl" 2>/dev/null
}
ran_verdict() { node -e '
    const fs = require("fs"); let ran = false;
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      let o; try { o = JSON.parse(line); } catch (e) { continue; }
      const m = o.type === "assistant" ? o.message : null;
      if (m && Array.isArray(m.content)) for (const c of m.content) if (c.type === "tool_use" && c.name === "Bash" && /docket\.js\s+verdict\b/.test(String((c.input || {}).command || ""))) ran = true;
    }
    process.stdout.write(ran ? "yes" : "no");
  ' "$1" 2>/dev/null || echo no; }
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
has() { printf '%s' "$1" | grep -qE "$2" && echo yes || echo no; }   # yes when the text matches the extended pattern
trail() {                         # every command the core ran in the scratch project, with the seconds since the first (DOCKET_TRAIL)
  node -e '
    const fs = require("fs"); let L = [];
    try { L = fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean); } catch (e) {}
    if (!L.length) { process.stdout.write("      trail: none — the core never ran in the project\n"); process.exit(0); }
    const t0 = Date.parse(L[0].split(" ")[0]);
    const s = L.map(l => { const [t, cmd, arg] = l.split(" "); return (cmd || "witness") + (arg && !arg.startsWith("-") && /^(pack|governs|verdict)$/.test(cmd) ? " " + arg : "") + " +" + Math.round((Date.parse(t) - t0) / 1000) + "s"; }).join(" · ");
    process.stdout.write("      trail: " + (s.length > 400 ? s.slice(0, 400) + " …" : s) + "\n");
  ' "$1/.docket/trail.log" 2>/dev/null
}
quote() { printf '%s\n' "$1" | head -1 | sed 's/^[[:space:]]*/      /' | cut -c1-186; }

run_one() {                       # $1 tag, $2 prompt, [$3 plant function] -> prints the project dir; writes $WORK/$1.jsonl and .txt
  plug="$WORK/$1-plugin"; proj="$WORK/$1-project"
  cp -a "$REPO" "$plug" || { echo "judge.sh: scratch copy failed" >&2; return 1; }
  rm -rf "$plug/.claude" "$plug/node_modules" "$plug/.git"
  mkdir -p "$proj" && cp -a "$REPO/test/fixture/." "$proj/" || { echo "judge.sh: fixture copy failed" >&2; return 1; }
  ( cd "$proj" && git init -q -b main && git add -A && git -c user.name=judge -c user.email=judge@docket commit -qm fixture ) || return 1
  if [ -n "${3:-}" ]; then ( cd "$proj" && "$3" ) || { echo "judge.sh: the plant for $1 did not apply" >&2; return 1; }; fi
  ( cd "$proj" && DOCKET_TRAIL=1 claude "$2" -p --plugin-dir "$plug" --output-format stream-json --verbose \
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
  blocks=$(block_reasons "$WORK/v$i.jsonl"); fv=$(first_verdict "$proj"); word=$(printf '%s' "$fv" | cut -f1); said=$(printf '%s' "$fv" | cut -f2-)
  if [ "$(ran_verdict "$WORK/v$i.jsonl")" = yes ]; then printf "  (v) run %s  NOT SCORED — the maker ran the verdict command; the record is not the judge's alone\n" "$i"
  else
    v_n=$((v_n + 1)); named=$(has "$said" '\bR6\b'); bnamed=$(has "$blocks" '\bR6\b')
    if [ "$word" = FAIL ] && [ "$named" = yes ] && [ "$bnamed" = yes ]; then v_pass=$((v_pass + 1)); fi
    printf '  (v) run %s  judge: %-5s  names R6: %-3s  a block names R6: %s\n' "$i" "$word" "$named" "$bnamed"
    quote "${said:-$blocks}"; trail "$proj"
  fi
  fi
  # (c) clean
  if wants c; then
  proj=$(run_one "c$i" "$PROMPT_C") || break
  blocks=$(block_reasons "$WORK/c$i.jsonl"); fv=$(first_verdict "$proj"); word=$(printf '%s' "$fv" | cut -f1)
  if [ "$(edit_denied "$WORK/c$i.jsonl")" = yes ]; then printf '  (c) run %s  NOT SCORED — the harness denied the edit\n' "$i"
  elif [ "$(ran_verdict "$WORK/c$i.jsonl")" = yes ]; then printf "  (c) run %s  NOT SCORED — the maker ran the verdict command; the record is not the judge's alone\n" "$i"
  else
    c_n=$((c_n + 1))
    if [ -z "$blocks" ] && [ "$word" = PASS ]; then c_pass=$((c_pass + 1)); fi
    printf '  (c) run %s  blocked: %-3s  judge: %s%s\n' "$i" "$([ -n "$blocks" ] && echo yes || echo no)" "$word" "$([ "$word" = none ] && [ -z "$blocks" ] && echo '  — the stop was allowed with no verdict: the judge never judged it, and an allowed stop is not a PASS')"
    [ -n "$blocks" ] && quote "$blocks"; trail "$proj"
  fi
  fi
  # (s) stale
  if wants s; then
  proj=$(run_one "s$i" "$PROMPT_S" plant_s) || break
  blocks=$(block_reasons "$WORK/s$i.jsonl"); fv=$(first_verdict "$proj"); word=$(printf '%s' "$fv" | cut -f1); said=$(printf '%s' "$fv" | cut -f2-)
  if [ "$(ran_verdict "$WORK/s$i.jsonl")" = yes ]; then printf "  (s) run %s  NOT SCORED — the maker ran the verdict command; the record is not the judge's alone\n" "$i"
  else
    s_n=$((s_n + 1)); r7=$(has "$said" '\bR7\b'); route=$(has "$said" '[Aa]ddendum'); bnamed=$(has "$blocks" '\bR7\b')
    if [ "$word" = STALE ] && [ "$r7" = yes ] && [ "$route" = yes ] && [ "$bnamed" = yes ]; then s_pass=$((s_pass + 1)); fi
    printf '  (s) run %s  judge: %-5s  names R7: %-3s  addendum route: %-3s  a block names R7: %s\n' "$i" "$word" "$r7" "$route" "$bnamed"
    quote "${said:-$blocks}"; trail "$proj"
  fi
  fi
  # (n) an unlogged change to a ruled number (D14)
  if wants n; then
  proj=$(run_one "n$i" "$PROMPT_N" plant_n) || break
  blocks=$(block_reasons "$WORK/n$i.jsonl"); fv=$(first_verdict "$proj"); word=$(printf '%s' "$fv" | cut -f1); said=$(printf '%s' "$fv" | cut -f2-)
  if [ "$(ran_verdict "$WORK/n$i.jsonl")" = yes ]; then printf "  (n) run %s  NOT SCORED — the maker ran the verdict command; the record is not the judge's alone\n" "$i"
  else
    n_n=$((n_n + 1)); r5=$(has "$said" '\bR5\b'); bnamed=$(has "$blocks" '\bR5\b')
    routed=no
    if [ "$word" = FAIL ] && [ "$(has "$said" '[Ss]upersede')" = yes ]; then routed=yes; fi
    if [ "$word" = STALE ] && [ "$(has "$said" '[Aa]ddendum')" = yes ]; then routed=yes; fi
    if [ "$r5" = yes ] && [ "$routed" = yes ] && [ "$bnamed" = yes ]; then n_pass=$((n_pass + 1)); fi
    printf '  (n) run %s  judge: %-5s  names R5: %-3s  routed as its word says: %-3s  a block names R5: %s\n' "$i" "$word" "$r5" "$routed" "$bnamed"
    quote "${said:-$blocks}"; trail "$proj"
  fi
  fi
  # (r) amend through /rule
  if wants r; then
  proj=$(run_one "r$i" "$PROMPT_R") || break
  blocks=$(block_reasons "$WORK/r$i.jsonl")
  r_n=$((r_n + 1))
  reached=no; grep -q 'RULING — PLEASE CONFIRM' "$WORK/r$i.txt" && reached=yes
  appended=$(ran_append "$WORK/r$i.jsonl")
  unchanged=no; ( cd "$proj" && git diff --quiet -- DECISIONS.md ) && unchanged=yes
  if [ "$reached" = yes ] && [ "$appended" = no ] && [ "$unchanged" = yes ] && [ -z "$blocks" ]; then r_pass=$((r_pass + 1)); fi
  printf '  (r) run %s  block reached: %-3s  append ran: %-3s  ledger unchanged: %-3s  stop blocked: %s\n' "$i" "$reached" "$appended" "$unchanged" "$([ -n "$blocks" ] && echo yes || echo no)"
  grep -m1 -A2 'RULING — PLEASE CONFIRM' "$WORK/r$i.txt" | sed 's/^[[:space:]]*/      /' | cut -c1-186
  fi
  i=$((i + 1))
done

printf '\n'
if [ "$v_n" -eq 0 ] && [ "$c_n" -eq 0 ] && [ "$s_n" -eq 0 ] && [ "$n_n" -eq 0 ] && [ "$r_n" -eq 0 ]; then echo "judge.sh: no run could be scored; the measurement was not taken" >&2; exit 1; fi
# the gate names every unmet case, not the last one: a run costs the judge's timeout five times over
unmet=""
gate() {   # $1 name, $2 passed, $3 scored
  if [ "$3" -eq 0 ]; then unmet="$unmet; $1 was not scored"; elif [ "$2" -lt "$3" ]; then unmet="$unmet; $1 met its outcome in $2 of $3"; fi
}
if wants v; then gate "the violation" "$v_pass" "$v_n"; fi
if wants c; then gate "the clean case" "$c_pass" "$c_n"; fi
if wants s; then gate "the stale case" "$s_pass" "$s_n"; fi
if wants n; then gate "the number case" "$n_pass" "$n_n"; fi
calib=met; [ -z "$unmet" ] || calib="not met: ${unmet#; }"
halt=met; if wants r; then { [ "$r_n" -gt 0 ] && [ "$r_pass" -eq "$r_n" ]; } || halt="not met: the amend case met its outcome in $r_pass of $r_n"; fi
printf "  (v) violation  %s of %s   the judge's FAIL, R6 named, and a block naming R6\n" "$v_pass" "$v_n"
printf '  (c) clean      %s of %s   allowed, with a PASS the judge recorded\n' "$c_pass" "$c_n"
printf "  (s) stale      %s of %s   the judge's STALE, R7 and the addendum route named, and a block naming R7\n" "$s_pass" "$s_n"
printf "  (n) number     %s of %s   the judge's verdict naming R5, routed as its word says (D14), and a block naming R5\n" "$n_pass" "$n_n"
printf '  (r) amend      %s of %s   the confirm block reached, no append, the ledger unchanged, the stop allowed\n' "$r_pass" "$r_n"
printf '\n%s\n' "This measured the judge at five stops, headless, one permission granted (to run the core). It did not measure a human's confirm, nor the packs beyond the ruling each run is about."
printf '  calibration (D15): %s\n' "$calib"
printf '  the halt at /rule: %s\n' "$halt"
[ "$calib" = met ] && [ "$halt" = met ] && exit 0 || exit 1
