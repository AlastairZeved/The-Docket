#!/bin/sh
# test/install.sh — the plugin installed fresh from its marketplace, measured.
#
# Two headless runs, each in a scratch project of its own into which the plugin is installed from its marketplace —
# the published repository by default — at the project's local scope, so that nothing is declared in the machine's
# user settings, and uninstalled after. What a run of this script measured, and what it does not, is recorded in the
# ledger as a ruling of its own. It prints first the source it installs from, then the host's command-line tool as the
# tool reports its version, with the date, then what each run showed, and exits 1 unless both passed — or when the
# measurement itself could not be taken: the host's tool missing, an install refused, or the machine's own plugin
# state changed by the run, each named on a line of its own.
#
#   (k) constitute  an empty project, git initialised; `/constitute` with the four answers given inline. pass = a line
#                   of the maker's text opens with CONSTITUTION — PLEASE CONFIRM, markup aside, as test/constitute.sh
#                   reads it (a mention in prose is not the block); the maker ran no command that writes — no
#                   constitute with --answers, no append with a write flag outside a dry run, each read in the
#                   segments the shell runs, as test/judge.sh reads them (a quoted body naming --dry-run is no dry
#                   run); and the project holds no ledger, no PRD.md and no UIUX.md: the intake halts at its confirm
#                   block, and only the person confirms (D18).
#   (e) edit, stop  the fixture copied as a governed project, committed; the maker is asked for one edit in a
#                   governed region, the toolbar's offset in the function R6 governs, and has no shell, so the edit
#                   goes through the host's edit tool, the one the pre-edit hook is bound to. pass = the maker made one
#                   edit call, the pre-edit hook PRINTED for it in the scratch project — the host's own record of that
#                   hook's response carries the governed list, "Governed here" — and the stop was judged: a line of the
#                   project's .docket/verdicts.jsonl records a verdict, PASS, FAIL or STALE, or the stop blocked with
#                   one, its reason relaying what the judge recorded. A block saying the judge recorded no verdict is no
#                   judgement, and an install that succeeded beside a hook that printed nothing is no pass: the install
#                   is the means, and the list printed in the project the plugin was installed into is the measure.
#
# INSTALL_SOURCE names the marketplace (default AlastairZeved/The-Docket, the published repository; a path to a clone
# measures an unpublished tree, and the record says which ran). INSTALL_KEEP=1 keeps the scratch directory and names it.
# The core's own switches (DOCKET_*) are not passed to the runs: a run measures the plugin as a person gets it.

set -u
SRC=${INSTALL_SOURCE:-AlastairZeved/The-Docket}
for v in $(env | sed -n 's/^\(DOCKET_[A-Za-z0-9_]*\)=.*/\1/p'); do unset "$v"; done
command -v claude >/dev/null 2>&1 || { echo "install.sh: no host command-line tool on PATH; the measurement cannot be taken" >&2; exit 1; }
REPO=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/install.XXXXXX") || { echo "install.sh: no scratch directory" >&2; exit 1; }
if [ -n "${INSTALL_KEEP:-}" ]; then echo "install.sh: keeping $WORK"; else trap 'rm -rf "${WORK:?}"' EXIT INT TERM; fi

# The machine's own plugin state, read before and after: the marketplaces and the plugins the host lists. A run that
# leaves either changed has touched more than its scratch project.
state() { { claude plugin marketplace list 2>&1; claude plugin list 2>&1; } | sed 's/[[:space:]]*$//'; }
BEFORE=$(state)

setup() {                          # $1 project dir: the marketplace declared and the plugin installed, at its local scope
  ( cd "$1" && claude plugin marketplace add "$SRC" --scope local >"$1.add" 2>&1 && claude plugin install the-docket@the-docket --scope local -y >>"$1.add" 2>&1 )
}
teardown() {                       # $1 project dir
  ( cd "$1" && claude plugin uninstall the-docket@the-docket --scope local >/dev/null 2>&1; claude plugin marketplace remove the-docket --scope local >/dev/null 2>&1 ) || true
}
# The number of the host's records of a hook of event $2 whose answer carries $3
hook_said() { node -e '
    const fs = require("fs"), [log, ev, pat] = process.argv.slice(1); let n = 0;
    for (const line of fs.readFileSync(log, "utf8").split("\n")) {
      let o; try { o = JSON.parse(line); } catch (e) { continue; }
      if (o && o.type === "system" && o.subtype === "hook_response" && o.hook_event === ev && new RegExp(pat).test(String(o.output || "") + String(o.stdout || ""))) n++;
    }
    process.stdout.write(String(n));
  ' "$1" "$2" "$3" 2>/dev/null || echo 0; }
# The number of the maker's calls of the host's edit tools
edits() { node -e '
    const fs = require("fs"); let n = 0;
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      let o; try { o = JSON.parse(line); } catch (e) { continue; }
      if (o && o.type === "assistant" && o.message && Array.isArray(o.message.content)) for (const c of o.message.content) if (c && c.type === "tool_use" && /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(c.name || "")) n++;
    }
    process.stdout.write(String(n));
  ' "$1" 2>/dev/null || echo 0; }
# yes when a line of the verdict log records a verdict: one that parses, its verdict PASS, FAIL or STALE
recorded() { node -e '
    const fs = require("fs"); let hit = false, t = "";
    try { t = fs.readFileSync(process.argv[1], "utf8"); } catch (e) { /* none */ }
    for (const line of t.split("\n")) { let o; try { o = JSON.parse(line); } catch (e) { continue; } if (o && /^(PASS|FAIL|STALE)$/.test(o.verdict)) hit = true; }
    process.stdout.write(hit ? "yes" : "no");
  ' "$1" 2>/dev/null || echo no; }
# A command's segments as the shell runs them, as test/judge.sh reads them: split at |, ; and & and a line break outside
# quotes, a backslash and the character after it kept together; bare, the text inside quotes left out, so a flag is read
# where the shell reads one and not in a quoted body. A command whose quotes do not close is split at every separator.
SEGS='const segs = (cmd, bare) => {
    const out = []; let cur = "", q = "";
    for (let k = 0; k < cmd.length; k++) {
      const ch = cmd[k];
      if (q) { if (ch === "\\" && q === "\"" && k + 1 < cmd.length) { if (!bare) cur += ch + cmd[k + 1]; k++; } else if (ch === q) { q = ""; cur += ch; } else if (!bare) cur += ch; }
      else if (ch === "\\" && k + 1 < cmd.length) { cur += ch + cmd[k + 1]; k++; }
      else if (ch === "\"" || ch === "\x27") { q = ch; cur += ch; }
      else if (/[|;&\n]/.test(ch)) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return q ? cmd.split(/[|;&\n]/) : out;
  };'
# yes when a shell call of the maker's runs the core's constitute with answers, or an append with a write flag and no
# dry run, read in the segments the shell runs
ran_write() { node -e "$SEGS"'
    const fs = require("fs"); let hit = false;
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      let o; try { o = JSON.parse(line); } catch (e) { continue; }
      if (!o || o.type !== "assistant" || !o.message || !Array.isArray(o.message.content)) continue;
      for (const c of o.message.content) {
        const cmd = c && c.type === "tool_use" && c.input && typeof c.input.command === "string" ? c.input.command : "";
        for (const seg of segs(cmd, true)) if (/\bconstitute\b[\s\S]*?\s--answers\b/.test(seg) || (/\bappend\b[\s\S]*?\s--(?:title|addendum|baseline)\b/.test(seg) && !/\s--dry-run\b/.test(seg))) hit = true;
      }
    }
    process.stdout.write(hit ? "yes" : "no");
  ' "$1" 2>/dev/null || echo no; }
assistant_text() { node -e '
    const fs = require("fs"); let out = "";
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      let o; try { o = JSON.parse(line); } catch (e) { continue; }
      if (o && o.type === "assistant" && o.message && Array.isArray(o.message.content)) for (const c of o.message.content) if (c && c.type === "text") out += c.text + "\n";
    }
    process.stdout.write(out);
  ' "$1" 2>/dev/null; }

HOSTV=$(claude --version 2>/dev/null | head -1)
printf '%s\n' "installing the-docket@the-docket from ${SRC}, at each scratch project's local scope"
printf '%s\n' "on the host's command-line tool, version ${HOSTV:-not reported}, $(date -u +%Y-%m-%d)"

# (k) constitute
K="$WORK/k-project"; mkdir -p "$K" && ( cd "$K" && git init -q . ) || { echo "install.sh: the scratch project could not be made" >&2; exit 1; }
setup "$K" || { echo "install.sh: the install into the scratch project failed (source $SRC):" >&2; cat "$K.add" >&2; teardown "$K"; exit 1; }
( cd "$K" && claude -p "/constitute

My four answers, so you need not ask them one by one: 1) What it is: a sign-out sheet that lends a laptop to a pupil for one lesson. 2) Who it is for: a school librarian who knows the catalogue and does not know how a web app is built. 3) The feeling: the loan takes one breath. 4) We will not: store a pupil's name after the loan ends; send reminders; track where a laptop goes." \
    --output-format stream-json --verbose --include-hook-events --permission-mode acceptEdits --allowedTools "Bash(node *docket.js*)" --max-turns 12 ) > "$WORK/k.jsonl" 2> "$WORK/k.err"
reached=no; assistant_text "$WORK/k.jsonl" | grep -qE '^[^[:alnum:]]*CONSTITUTION — PLEASE CONFIRM' && reached=yes   # at a line's start, markup before it or not
wrote=$(ran_write "$WORK/k.jsonl"); files=no
for f in DECISIONS.md PRD.md UIUX.md docs/DECISIONS.md docs/PRD.md docs/UIUX.md; do [ -e "$K/$f" ] && files=yes; done
teardown "$K"
k_pass=0; [ "$reached" = yes ] && [ "$wrote" = no ] && [ "$files" = no ] && k_pass=1
printf '  (k) run 1  confirm block reached: %-3s  a write ran: %-3s  a triad file written: %s\n' "$reached" "$wrote" "$files"

# (e) edit, stop
E="$WORK/e-project"; mkdir -p "$E" && cp -a "$REPO/test/fixture/." "$E/" && ( cd "$E" && git init -q . && git -c user.name=t -c user.email=t@t add -A && git -c user.name=t -c user.email=t@t commit -q -m fixture ) \
  || { echo "install.sh: the scratch project could not be made" >&2; exit 1; }
setup "$E" || { echo "install.sh: the install into the scratch project failed (source $SRC):" >&2; cat "$E.add" >&2; teardown "$E"; exit 1; }
( cd "$E" && claude -p "In app.js, in makeToolbar, change the bar's offset above the selection from 48 to 56, the one number on the line that sets bar.style.top. Make that one change with one call of the edit tool, and do nothing else." \
    --output-format stream-json --verbose --include-hook-events --permission-mode acceptEdits --disallowedTools "Bash" --max-turns 12 ) > "$WORK/e.jsonl" 2> "$WORK/e.err"
made=$(edits "$WORK/e.jsonl")
prints=$(hook_said "$WORK/e.jsonl" PreToolUse 'Governed here')
printed=no; [ "$prints" -gt 0 ] && printed=yes
logged=$(recorded "$E/.docket/verdicts.jsonl")
blocked=no; [ "$(hook_said "$WORK/e.jsonl" Stop '^(?=[\s\S]*"decision" *: *"block")(?=[\s\S]*judge recorded (FAIL|STALE) for this stop)')" -gt 0 ] && blocked=yes
judged=no; { [ "$logged" = yes ] || [ "$blocked" = yes ]; } && judged=yes
teardown "$E"
e_pass=0; [ "$made" = 1 ] && [ "$printed" = yes ] && [ "$judged" = yes ] && e_pass=1
printf '  (e) run 1  edit calls: %s  the pre-edit hook printed the governed list: %-3s (%s time(s))  the stop judged: %-3s (a verdict recorded: %s, a block relaying one: %s)\n' "$made" "$printed" "$prints" "$judged" "$logged" "$blocked"

AFTER=$(state); same=yes; [ "$BEFORE" = "$AFTER" ] || same=no
printf '\n  (k) constitute  %s of 1   the confirm block reached, nothing written\n' "$k_pass"
printf '  (e) edit, stop  %s of 1   one edit, the pre-edit hook printed for it in the scratch project, and the stop judged\n' "$e_pass"
printf "  the machine's own plugin state as the run found it: %s\n" "$same"
[ "$k_pass" = 1 ] && [ "$e_pass" = 1 ] && [ "$same" = yes ] && exit 0 || exit 1
