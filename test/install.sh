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
#   (k) constitute  an empty project, git initialised; `/constitute` with the four answers given inline. pass = the
#                   text reached CONSTITUTION — PLEASE CONFIRM, the maker ran no command that writes — no
#                   `constitute --answers`, no `append` — and the project holds no ledger, no PRD.md and no UIUX.md:
#                   the intake halts at its confirm block, and only the person confirms (D18).
#   (e) edit, stop  the fixture copied as a governed project, committed; the maker is asked to rename a function in a
#                   governed region, and has no shell, so the edit goes through the host's edit tool, the one the
#                   pre-edit hook is bound to. pass = the pre-edit hook PRINTED in the scratch project — the host's own
#                   record of that hook's response carries the governed list, "Governed here" — and the stop was judged:
#                   a verdict the judge recorded is in the project's .docket/verdicts.jsonl, or the stop blocked. An
#                   install that succeeded and a hook that printed nothing is not a pass: the install is the means, and
#                   the list printed in the project the plugin was installed into is the measure.
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
# yes when the host's record of a hook of event $2 carries $3 in what the hook answered
hook_said() { node -e '
    const fs = require("fs"), [log, ev, pat] = process.argv.slice(1); let hit = false;
    for (const line of fs.readFileSync(log, "utf8").split("\n")) {
      let o; try { o = JSON.parse(line); } catch (e) { continue; }
      if (o && o.type === "system" && o.subtype === "hook_response" && o.hook_event === ev && new RegExp(pat).test(String(o.output || "") + String(o.stdout || ""))) hit = true;
    }
    process.stdout.write(hit ? "yes" : "no");
  ' "$1" "$2" "$3" 2>/dev/null || echo no; }
# yes when a shell call of the maker's runs the core's constitute with answers, or an append that writes
ran_write() { node -e '
    const fs = require("fs"); let hit = false;
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      let o; try { o = JSON.parse(line); } catch (e) { continue; }
      if (!o || o.type !== "assistant" || !o.message || !Array.isArray(o.message.content)) continue;
      for (const c of o.message.content) {
        const cmd = c && c.type === "tool_use" && c.input && typeof c.input.command === "string" ? c.input.command : "";
        if (/docket\.js/.test(cmd) && (/\bconstitute\b[^|;&]*--answers/.test(cmd) || (/\bappend\b/.test(cmd) && !/--dry-run/.test(cmd)))) hit = true;
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
reached=no; assistant_text "$WORK/k.jsonl" | grep -q 'CONSTITUTION — PLEASE CONFIRM' && reached=yes
wrote=$(ran_write "$WORK/k.jsonl"); files=no
for f in DECISIONS.md PRD.md UIUX.md docs/DECISIONS.md docs/PRD.md docs/UIUX.md; do [ -e "$K/$f" ] && files=yes; done
teardown "$K"
k_pass=0; [ "$reached" = yes ] && [ "$wrote" = no ] && [ "$files" = no ] && k_pass=1
printf '  (k) run 1  confirm block reached: %-3s  a write ran: %-3s  a triad file written: %s\n' "$reached" "$wrote" "$files"

# (e) edit, stop
E="$WORK/e-project"; mkdir -p "$E" && cp -a "$REPO/test/fixture/." "$E/" && ( cd "$E" && git init -q . && git -c user.name=t -c user.email=t@t add -A && git -c user.name=t -c user.email=t@t commit -q -m fixture ) \
  || { echo "install.sh: the scratch project could not be made" >&2; exit 1; }
setup "$E" || { echo "install.sh: the install into the scratch project failed (source $SRC):" >&2; cat "$E.add" >&2; teardown "$E"; exit 1; }
( cd "$E" && claude -p "In app.js, rename the function foldSize to foldExtent, at its definition and its one use, with the edit tool. Do nothing else." \
    --output-format stream-json --verbose --include-hook-events --permission-mode acceptEdits --disallowedTools "Bash" --max-turns 12 ) > "$WORK/e.jsonl" 2> "$WORK/e.err"
printed=$(hook_said "$WORK/e.jsonl" PreToolUse 'Governed here')
recorded=no; [ -s "$E/.docket/verdicts.jsonl" ] && recorded=yes
blocked=$(hook_said "$WORK/e.jsonl" Stop '"decision" *: *"block"')
judged=no; { [ "$recorded" = yes ] || [ "$blocked" = yes ]; } && judged=yes
teardown "$E"
e_pass=0; [ "$printed" = yes ] && [ "$judged" = yes ] && e_pass=1
printf '  (e) run 1  the pre-edit hook printed the governed list: %-3s  the stop judged: %-3s (a verdict recorded: %s, a block: %s)\n' "$printed" "$judged" "$recorded" "$blocked"

AFTER=$(state); same=yes; [ "$BEFORE" = "$AFTER" ] || same=no
printf '\n  (k) constitute  %s of 1   the confirm block reached, nothing written\n' "$k_pass"
printf '  (e) edit, stop  %s of 1   the pre-edit hook printed in the scratch project, and the stop judged\n' "$e_pass"
printf "  the machine's own plugin state as the run found it: %s\n" "$same"
[ "$k_pass" = 1 ] && [ "$e_pass" = 1 ] && [ "$same" = yes ] && exit 0 || exit 1
