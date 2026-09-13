#!/usr/bin/env node
'use strict';
// The witness of the core: one linear scenario over test/fixture, `ok(name, cond)`, exit 1 on any
// failure. Each block names the grammar or ruling it establishes. Temp copies are git repositories
// so the checks that read the committed ledger (check 7) run for real.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const CORE = path.join(ROOT, 'bin', 'docket.js');
const FIX = path.join(ROOT, 'test', 'fixture');
let passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; return; }
  failed++;
  console.error(`FAIL  ${name}${detail === undefined ? '' : '\n      ' + String(detail).split('\n').join('\n      ')}`);
}
function docket(args, opts) {
  opts = opts || {};
  const r = cp.spawnSync('node', [CORE].concat(args), { cwd: opts.cwd || ROOT, input: opts.input, encoding: 'utf8', env: Object.assign({}, process.env, opts.env || {}) });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
function sh(cmd, args, cwd) { return cp.spawnSync(cmd, args, { cwd, encoding: 'utf8' }); }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function expected(name) { return read(path.join(FIX, 'expected', name)); }
// A temp repository laid out like this one (test/fixture/…) so paths in outputs match byte for byte.
function tempRepo(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-'));
  fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
  fs.cpSync(FIX, path.join(dir, 'test', 'fixture'), { recursive: true });
  if (mutate) mutate(dir);
  sh('git', ['init', '-q', '-b', 'main'], dir);
  sh('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A'], dir);
  sh('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'fixture'], dir);
  return dir;
}
function edit(dir, relPath, from, to) {
  const p = path.join(dir, relPath);
  const s = read(p);
  if (!s.includes(from)) throw new Error('edit anchor missing in ' + relPath + ': ' + from);
  fs.writeFileSync(p, s.replace(from, to));
}
function nearInput(file, oldString, extra) {
  return JSON.stringify(Object.assign({ tool_name: 'Edit', tool_input: Object.assign({ file_path: file, old_string: oldString }, extra || {}) }));
}
const APP = path.join(FIX, 'app.js');
// Planted bad cites are built at run time so that this file carries no spec cite or bare cite of its own.
const SEC = String.fromCharCode(0xa7);

// ── discovery (FORMAT.md 1; D5): nearest ledger up from the file, per file ──
{
  const idx = docket(['index'], { cwd: FIX });
  ok('index parses the fixture ledger', idx.code === 0, idx.err);
  const j = JSON.parse(idx.out);
  ok('discovery: a file under test/fixture resolves to the fixture ledger', j.ledger === 'test/fixture/DECISIONS.md', j.ledger);
  ok('two prefixes are read from the headings', JSON.stringify(j.prefixes) === JSON.stringify(['A', 'R']), JSON.stringify(j.prefixes));
  ok('nine rulings: A1 and R1–R8', j.rulings.length === 9 && j.rulings.map(r => r.id).join(',') === 'A1,R1,R2,R3,R4,R5,R6,R7,R8', j.rulings.map(r => r.id).join(','));
  const root = docket(['index']);
  ok('discovery: the repository root resolves to docs/DECISIONS.md', root.code === 0 && JSON.parse(root.out).ledger === 'docs/DECISIONS.md');
  ok('index carries the spec headings beside the ledger', j.specs.UIUX.map(h => h.num).join(',') === '2,4.5' && j.specs.PRD.map(h => h.num).join(',') === '1,2', JSON.stringify(j.specs));
  ok('index carries the contract line and the baseline', j.contractFrom.R === 8 && j.baseline['app.js'] === 3, JSON.stringify([j.contractFrom, j.baseline]));
  // ── the title rule (FORMAT.md 3; D7): 28-character and 900-character headings ──
  const r1 = j.rulings.find(r => r.id === 'R1'), r8 = j.rulings.find(r => r.id === 'R8'), r4 = j.rulings.find(r => r.id === 'R4'), r6 = j.rulings.find(r => r.id === 'R6');
  ok('the 28-character heading keeps its whole title', ('### R1. ' + r1.heading).length === 28 && r1.title === 'Capture before shape', r1.title);
  ok('the 900-character heading is cut at the last word boundary before 72, with …', ('### R8. ' + r8.heading).length === 900 && r8.title.endsWith('…') && Array.from(r8.title).length <= 72 && !r8.title.includes(' ('), r8.title);
  ok('the title is cut at the first " (" before the 72-character rule', r4.title === 'Fold similarity: shape held, size uniform' && r4.meta === 'supersedes R3', r4.title + ' | ' + r4.meta);
  ok('issue is read from the meta', r6.issue === 12 && r4.issue === null);
  // ── edges (FORMAT.md 5) ──
  const r7 = j.rulings.find(r => r.id === 'R7');
  ok('a body edge carries adverb, target and qualifier', r7.edges.length === 1 && r7.edges[0].adverb === 'partially' && r7.edges[0].verb === 'reverses' && r7.edges[0].to === 'R6' && r7.edges[0].qualifier === 'relational plane only', JSON.stringify(r7.edges));
  ok('an edge stated in the heading and again in the body is one edge', r8.edges.length === 1 && r8.edges[0].verb === 'waives' && r8.edges[0].to === 'R1', JSON.stringify(r8.edges));
  const r2 = j.rulings.find(r => r.id === 'R2');
  ok('an addendum is read with its date', r2.addenda.length === 1 && r2.addenda[0].date === '2026-09-11', JSON.stringify(r2.addenda));
  ok('the contract-bound entry names its principle', r8.principle === 'Capture precedes structure', r8.principle);
  const slash = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', 'and the count is the section count in `app.js`.', 'and the count is the section count in `app.js`; this keeps R1/R2.'));
  const sj = JSON.parse(docket(['index'], { cwd: path.join(slash, 'test', 'fixture') }).out);
  const r5e = sj.rulings.find(r => r.id === 'R5').edges;
  ok('one verb with slash-joined targets is one edge per target', r5e.length === 2 && r5e[0].verb === 'keeps' && r5e[0].to === 'R1' && r5e[1].to === 'R2' && r5e[0].clause === r5e[1].clause, JSON.stringify(r5e));
  ok('…and check 5 accepts them', docket(['check'], { cwd: slash }).code === 0);
  // code spans (FORMAT.md 3, 4, 5): a parenthesis inside backticks is code, not the meta; an edge inside backticks is quoted, not made
  const code = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'),
    '\n### R9. Read `fn (x)` before the `(y)` call (issue #21)\nPrinciple: Capture precedes structure.\nProse may say `supersedes R3` and assert nothing; this entry refines R2. Reason: r.\n'));
  const cj = JSON.parse(docket(['index'], { cwd: path.join(code, 'test', 'fixture') }).out);
  const r9 = cj.rulings.find(r => r.id === 'R9');
  ok('the title cut ignores a " (" inside a code span, then strips the backticks', r9 && r9.title === 'Read fn (x) before the (y) call', r9 && r9.title);
  ok('the meta is the first parenthetical outside code', r9 && r9.meta === 'issue #21' && r9.issue === 21, r9 && r9.meta);
  ok('an edge inside a code span is not an edge; the one in prose is', r9 && r9.edges.length === 1 && r9.edges[0].verb === 'refines' && r9.edges[0].to === 'R2', r9 && JSON.stringify(r9.edges));
  ok('…and check accepts the entry under the contract', docket(['check'], { cwd: code }).code === 0, docket(['check'], { cwd: code }).out);
}

// ── near (FORMAT.md 15; D1, D2, D7): every row of the table ──
{
  const one = docket(['near'], { input: nearInput(APP, 'makeToolbar(') });
  ok('near: one match → the ±20 window, byte for byte', one.code === 0 && one.out === expected('near-41.txt'), one.out);
  const manyNo = docket(['near'], { input: nearInput(APP, "  el.classList.add('note');") });
  ok('near: many matches without replace_all → silent', manyNo.code === 0 && manyNo.out === '', manyNo.out);
  const manyYes = docket(['near'], { input: nearInput(APP, "  el.classList.add('note');", { replace_all: true }) });
  ok('near: many matches with replace_all → the union, cap 8 by count then nearest to the first', manyYes.code === 0 && manyYes.out === expected('near-union.txt'), manyYes.out);
  const zero = docket(['near'], { input: nearInput(APP, 'no such text anywhere') });
  ok('near: zero matches → silent', zero.code === 0 && zero.out === '');
  const empty = docket(['near'], { input: nearInput(APP, '') });
  ok('near: an empty old_string → silent', empty.code === 0 && empty.out === '');
  const whole = docket(['near'], { input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: APP, content: 'x' } }) });
  ok('near: Write of an existing governed file → whole file, cap 8 by count', whole.code === 0 && whole.out === expected('near-whole.txt'), whole.out);
  const fresh = docket(['near'], { input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: path.join(FIX, 'brand-new.js'), content: 'x' } }) });
  ok('near: Write of a new file → silent', fresh.code === 0 && fresh.out === '');
  const far = docket(['near'], { input: nearInput(APP, '  return JSON.stringify(out);') });
  ok('near: a governed file whose window cites nothing → the one-line notice', far.code === 0 && far.out === expected('near-empty-window.txt'), far.out);
  const ungoverned = docket(['near'], { input: nearInput(path.join(ROOT, 'LICENSE'), 'MIT') });
  ok('near: a file that cites nothing → silent', ungoverned.code === 0 && ungoverned.out === '');
  const hook = docket(['near'], { input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: APP, old_string: 'makeToolbar(' } }) });
  const hj = hook.code === 0 ? JSON.parse(hook.out) : null;
  ok('near: with a hook event name the same text is wrapped for injection', hj && hj.hookSpecificOutput.hookEventName === 'PreToolUse' && hj.hookSpecificOutput.additionalContext + '\n' === expected('near-41.txt'), hook.out);
  const garbage = docket(['near'], { input: 'not json' });
  ok('near: unusable stdin never blocks (exit 0, silent)', garbage.code === 0 && garbage.out === '');
  const noLedger = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-nl-'));
  fs.writeFileSync(path.join(noLedger, 'a.js'), 'const x = 1; // R6\n');
  const nl = docket(['near'], { input: nearInput(path.join(noLedger, 'a.js'), 'x = 1') });
  ok('near: a file with no ledger above it → silent', nl.code === 0 && nl.out === '');
  // a governed file of 5,000 lines: the window stays ±20 and the answer is immediate
  const big = tempRepo(dir => {
    const lines = [];
    for (let i = 1; i <= 5000; i++) lines.push(i % 250 === 0 ? `const v${i} = ${i}; // R2` : `const v${i} = ${i};`);
    lines[2499] = 'function anchorHere() {} // R6';
    lines[2509] = 'const nearTheAnchor = 1; // R2';
    fs.writeFileSync(path.join(dir, 'test', 'fixture', 'big.js'), lines.join('\n') + '\n');
  });
  const t0 = Date.now();
  const bigOut = docket(['near'], { cwd: big, input: nearInput(path.join(big, 'test', 'fixture', 'big.js'), 'anchorHere') });
  ok('near: a 5,000-line governed file answers with the ±20 window', bigOut.code === 0 && bigOut.out.startsWith('Governed here (test/fixture/DECISIONS.md, ±20 lines of big.js:2500):\n  R6  ') && bigOut.out.includes('\n  R2  ') && Date.now() - t0 < 5000, bigOut.out);
}

// ── check (FORMAT.md 13): the seven checks, each with a planted failure in a temp copy ──
{
  const clean = tempRepo();
  const c0 = docket(['check'], { cwd: clean });
  ok('check: the clean fixture passes', c0.code === 0 && /^check: ok/m.test(c0.out), c0.out + c0.err);
  const c1 = tempRepo(d => edit(d, 'test/fixture/app.js', '// R6: the toolbar replaces the long-press menu', '// R9: the toolbar replaces the long-press menu'));
  let r = docket(['check'], { cwd: c1 });
  ok('check 1: a cite to a ruling that does not exist fails at its line', r.code === 1 && /^test\/fixture\/app\.js:41  check 1: cite R9 names no ruling/m.test(r.out), r.out);
  const c2b = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', '### R7. The relational plane', '### R9. The relational plane'));
  r = docket(['check'], { cwd: c2b });
  ok('check 2: numbering that skips fails at the heading', r.code === 1 && /DECISIONS\.md:\d+  check 2: numbering: R9 follows R6; expected R7/.test(r.out), r.out);
  const c3 = tempRepo(d => edit(d, 'test/fixture/app.js', 'UIUX ' + SEC + '4.5 the minimum', 'UIUX ' + SEC + '4.6 the minimum'));
  r = docket(['check'], { cwd: c3 });
  ok('check 3: a spec cite that names no heading fails at its line', r.code === 1 && new RegExp('^test/fixture/app\\.js:55  check 3: UIUX ' + SEC + '4\\.6 names no heading', 'm').test(r.out), r.out);
  const c4 = tempRepo(d => edit(d, 'test/fixture/app.js', 'const HIT_FLOOR = 44; // ' + SEC + '4 minimum', 'const HIT_FLOOR = 44; // ' + SEC + '4 ' + SEC + '4 minimum'));
  r = docket(['check'], { cwd: c4 });
  ok('check 4: a bare-§ count above its allowance fails', r.code === 1 && /^test\/fixture\/app\.js:18  check 4: bare-§ cites: 4 > allowance 3 for app\.js/m.test(r.out), r.out);
  const c4b = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', '<!-- docket: bare-cites app.js=3 -->\n', ''));
  r = docket(['check'], { cwd: c4b });
  ok('check 4: with no baseline the count is reported, not failed', r.code === 0 && /^info  test\/fixture\/app\.js: 3 bare-§ cites \(no baseline/m.test(r.out), r.out);
  const c5 = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', '(issue #16; waives R1)', '(issue #16; waives R8)'));
  r = docket(['check'], { cwd: c5 });
  ok('check 5: an edge from a ruling to itself fails', r.code === 1 && /check 5: edge R8 waives R8: a ruling may not name itself/.test(r.out), r.out);
  const c5b = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', 'Fold similarity: shape held, size uniform (supersedes R3)', 'Fold similarity: shape held, size uniform (supersedes R7)'));
  r = docket(['check'], { cwd: c5b });
  ok('check 5: an edge to a later ruling fails', r.code === 1 && /check 5: edge R4 supersedes R7: R7 is defined later/.test(r.out), r.out);
  const c6 = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', 'Principle: Capture precedes structure.\n', ''));
  r = docket(['check'], { cwd: c6 });
  ok('check 6: a contract-bound entry without a Principle: line fails', r.code === 1 && /check 6: R8: no "Principle:" line/.test(r.out), r.out);
  const c6b = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', '(issue #16; waives R1)', '(waives R1; issue #16)'));
  r = docket(['check'], { cwd: c6b });
  ok('check 6: a meta that opens with an edge fails', r.code === 1 && /check 6: R8: meta must open with a grounding/.test(r.out), r.out);
  const c6c = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', 'Reason: a blank frame costs a read', 'Because a blank frame costs a read'));
  r = docket(['check'], { cwd: c6c });
  ok('check 6: a contract-bound entry without Reason: fails', r.code === 1 && /check 6: R8: body has no "Reason:"/.test(r.out), r.out);
  ok('check 6 binds only from the contract line: R3, loose, passes with no Principle: line', c0.code === 0);
  const c7 = tempRepo();
  edit(c7, 'test/fixture/DECISIONS.md', 'Notes fold together by shape and by size', 'Notes fold together by shape');
  r = docket(['check'], { cwd: c7 });
  ok('check 7: an existing body changed after commit fails (append only)', r.code === 1 && /check 7: R3: body changed other than by appended addendum lines/.test(r.out), r.out);
  const c7b = tempRepo();
  edit(c7b, 'test/fixture/DECISIONS.md', '### R3. Fold similarity (issue #4)', '### R3. Fold similarity and size (issue #4)');
  r = docket(['check'], { cwd: c7b });
  ok('check 7: an existing heading changed after commit fails', r.code === 1 && /check 7: R3: heading changed/.test(r.out), r.out);
  const c7c = tempRepo();
  fs.appendFileSync(path.join(c7c, 'test', 'fixture', 'DECISIONS.md'), '> Addendum 2026-09-12: appended after the commit.\n');
  r = docket(['check'], { cwd: c7c });
  ok('check 7: an appended addendum line is allowed', r.code === 0, r.out);
  const c7d = tempRepo();
  fs.appendFileSync(path.join(c7d, 'test', 'fixture', 'DECISIONS.md'), '\n### R9. A new ruling (issue #20)\nPrinciple: Zero cognitive tax.\nText. Reason: r.\n');
  r = docket(['check'], { cwd: c7d });
  ok('check 7: a new entry after the committed ones is allowed', r.code === 0, r.out);
  const c7e = tempRepo();
  edit(c7e, 'test/fixture/DECISIONS.md', 'Notes fold together by shape and by size', 'Notes fold together by shape');
  sh('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'edit'], c7e);
  r = docket(['check'], { cwd: c7e });
  ok('check 7: a clean tree is judged against HEAD~1, so a committed edit still fails', r.code === 1 && /check 7: R3: body changed/.test(r.out), r.out);
  const c7f = tempRepo();
  fs.appendFileSync(path.join(c7f, 'test', 'fixture', 'DECISIONS.md'), '\n### R9. A new ruling (issue #20)\nPrinciple: Zero cognitive tax.\nText. Reason: r.\n');
  sh('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'append'], c7f);
  r = docket(['check'], { cwd: c7f });
  ok('check 7: a clean tree whose last commit only appended passes', r.code === 0, r.out);
  ok('check 7: a clean tree with one commit is skipped (no earlier version)', c0.code === 0);
  // a ledger with CRLF line endings parses, cites and compares like an LF one
  const crlf = tempRepo(d => { const p = path.join(d, 'test', 'fixture', 'DECISIONS.md'); fs.writeFileSync(p, read(p).replace(/\n/g, '\r\n')); });
  r = docket(['check'], { cwd: crlf });
  ok('check: a CRLF ledger passes every check', r.code === 0, r.out + r.err);
  const crlfNear = docket(['near'], { cwd: crlf, input: nearInput(path.join(crlf, 'test', 'fixture', 'app.js'), 'makeToolbar(') });
  ok('near: a CRLF ledger yields the same window text', crlfNear.out === expected('near-41.txt'), crlfNear.out);
  // an empty ledger: nothing governed, nothing fails
  const emptyL = tempRepo(d => fs.writeFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '# Empty\n'));
  r = docket(['check'], { cwd: emptyL });
  ok('check: an empty ledger fails nothing and governs nothing', r.code === 0, r.out + r.err);
  const emptyNear = docket(['near'], { cwd: emptyL, input: nearInput(path.join(emptyL, 'test', 'fixture', 'app.js'), 'makeToolbar(') });
  ok('near: under an empty ledger every file is ungoverned → silent', emptyNear.code === 0 && emptyNear.out === '');
  const json = docket(['check', '--json'], { cwd: c1 });
  ok('check --json reports the same failure', json.code === 1 && JSON.parse(json.out).failures[0].k === 1);
}

// ── spec-check (design pack F1–F2): the planted token disagreement; the contrast row recomputed ──
{
  const r = docket(['spec-check'], { cwd: FIX });
  ok('spec-check (a): the token that disagrees with UIUX.md is caught, both lines named', r.code === 1 && /^test\/fixture\/UIUX\.md:9  spec-check a: --line is #7a8fa6 in the spec but #7a8fa7 at test\/fixture\/styles\.css:5$/m.test(r.out), r.out);
  ok('spec-check (b): the contrast row recomputed from the hexes matches to two decimals (no b failure)', !/spec-check b/.test(r.out), r.out);
  const fixed = tempRepo(d => edit(d, 'test/fixture/styles.css', '--line: #7a8fa7', '--line: #7a8fa6'));
  const r2 = docket(['spec-check'], { cwd: path.join(fixed, 'test', 'fixture') });
  ok('spec-check: with the token corrected the fixture passes, 4 rows', r2.code === 0 && /spec-check: ok \(4 rows\)/.test(r2.out), r2.out);
  const bad = tempRepo(d => edit(d, 'test/fixture/UIUX.md', '15.04:1', '12.00:1'));
  const r3 = docket(['spec-check'], { cwd: path.join(bad, 'test', 'fixture') });
  ok('spec-check (b): a stated ratio the hexes do not give is caught', r3.code === 1 && /spec-check b: --ink on --paper states 12\.00:1 but the hexes give 15\.04:1/.test(r3.out), r3.out);
  const rootRun = docket(['spec-check']);
  ok('spec-check at the repository root checks the project ledger, not the fixture', rootRun.code === 0 && /spec-check: ok \(0 rows\)/.test(rootRun.out), rootRun.out);
  const all = docket(['spec-check', '--all']);
  ok('spec-check --all reaches the fixture', all.code === 1);
}

// ── append (FORMAT.md 11; D4, D8): entry, addendum, baseline; a contract-breaking call refused ──
{
  const d = tempRepo();
  const cwd = path.join(d, 'test', 'fixture');
  let r = docket(['append', '--title', 'Pinned notes keep their size', '--issue', '21', '--principle', 'Positions are permanent', '--edge', 'refines R4', '--body', 'A pinned note keeps its own size inside a fold. Reason: a pinned note is a landmark, and resizing a landmark moves the map.'], { cwd });
  ok('append: a valid entry is written as R9 with the contract shape and check passes', r.code === 0 && /^### R9\. Pinned notes keep their size \(issue #21; refines R4\)\nPrinciple: Positions are permanent\.\n/m.test(r.out) && /check: ok/.test(r.out), r.out + r.err);
  const idx = JSON.parse(docket(['index'], { cwd }).out);
  ok('append: the new entry parses with its edge and principle', idx.rulings.length === 10 && idx.rulings[9].id === 'R9' && idx.rulings[9].edges[0].to === 'R4' && idx.rulings[9].principle === 'Positions are permanent');
  r = docket(['append', '--title', 'No reason given', '--issue', '22', '--principle', 'Positions are permanent', '--body', 'Text without the word.'], { cwd });
  ok('append: a body without Reason: is refused (exit 2) and nothing is written', r.code === 2 && /Reason:/.test(r.err) && JSON.parse(docket(['index'], { cwd }).out).rulings.length === 10, r.err);
  r = docket(['append', '--title', 'Wrong principle', '--issue', '22', '--principle', 'Move fast', '--body', 'Reason: none.'], { cwd });
  ok('append: a principle not in the list is refused by name', r.code === 2 && /principle "Move fast" is not one of/.test(r.err), r.err);
  r = docket(['append', '--title', 'Bad edge', '--issue', '22', '--principle', 'Zero cognitive tax', '--edge', 'touches R4', '--body', 'Reason: none.'], { cwd });
  ok('append: an edge with a verb not in the list is refused', r.code === 2 && /is not "<verb> <id>"/.test(r.err), r.err);
  r = docket(['append', '--title', 'Bad target', '--issue', '22', '--principle', 'Zero cognitive tax', '--edge', 'refines R40', '--body', 'Reason: none.'], { cwd });
  ok('append: an edge to a ruling that does not exist is refused', r.code === 2 && /names R40, which is not in/.test(r.err), r.err);
  r = docket(['append', '--title', 'A title (with a parenthetical)', '--issue', '22', '--principle', 'Zero cognitive tax', '--body', 'Reason: none.'], { cwd });
  ok('append: a title containing " (" is refused', r.code === 2 && /may not contain/.test(r.err), r.err);
  r = docket(['append', '--addendum', 'R5', '--text', 'the lot now has four sections; the count no longer holds.'], { cwd, env: { DOCKET_TODAY: '2026-09-12' } });
  ok('append --addendum writes a dated line as the last line of the entry and check passes', r.code === 0 && /^> Addendum 2026-09-12: the lot now has four sections; the count no longer holds\.$/m.test(r.out) && /check: ok/.test(r.out), r.out + r.err);
  const led = read(path.join(cwd, 'DECISIONS.md'));
  const i5 = led.indexOf('### R5.'), i6 = led.indexOf('### R6.');
  ok('append --addendum: the line sits under R5, before R6', led.slice(i5, i6).includes('> Addendum 2026-09-12:'));
  r = docket(['append', '--addendum', 'R77', '--text', 'x'], { cwd });
  ok('append --addendum to a ruling that does not exist is refused', r.code === 2);
  edit(d, 'test/fixture/app.js', 'const HIT_FLOOR = 44; // ' + SEC + '4 minimum', 'const HIT_FLOOR = 44; // ' + SEC + '4 ' + SEC + '4 minimum');
  r = docket(['check'], { cwd });
  ok('a fourth bare cite fails the ratchet before --baseline', r.code === 1 && /check 4/.test(r.out));
  r = docket(['append', '--baseline'], { cwd });
  ok('append --baseline rewrites the allowance from the counts and check passes', r.code === 0 && /<!-- docket: bare-cites app\.js=4 -->/.test(r.out) && /check: ok/.test(r.out), r.out + r.err);
  const status = docket(['status'], { cwd });
  ok('status lists the pending addenda (R2 then R5) and the new last rulings', /Addenda pending: \n  R2 \(2026-09-11\)[^\n]*\n  R5 \(2026-09-12\): the lot now has four sections/.test(status.out) && /Last rulings:\n  R9  Pinned notes keep their size  · issue #21/.test(status.out) && /Cited nowhere: R9 \(1 of 10\)/.test(status.out), status.out);
  const nop = tempRepo(d2 => edit(d2, 'test/fixture/PRD.md', '## ' + SEC + '1 Principles', '## ' + SEC + '3 Principles'));
  r = docket(['principles'], { cwd: path.join(nop, 'test', 'fixture') });
  ok('principles: a ledger with no list prints that it found none and exits 1', r.code === 1 && /no principles list found/.test(r.out), r.out);
  r = docket(['append', '--title', 'X', '--issue', '1', '--principle', 'Anything', '--body', 'Reason: r.'], { cwd: path.join(nop, 'test', 'fixture') });
  ok('append refuses every entry until a principles list exists', r.code === 2 && /no principles list/.test(r.err), r.err);
}

// ── query, governs, principles, status (D3: an edge list, never a status) ──
{
  const q = docket(['query', 'fold'], { cwd: FIX });
  ok('query lists the rulings whose heading or body match, with edges', q.code === 0 && /^R3  Fold similarity  · issue #4/m.test(q.out) && /← R4 supersedes R3/.test(q.out) && /^R4  Fold similarity: shape held, size uniform/m.test(q.out), q.out);
  const g = docket(['governs', 'R6'], { cwd: FIX });
  ok('governs shows in-edges with their clause text and code cites with file:line', g.code === 0 && /In-edges[^\n]*\n  R7 partially reverses R6 \(relational plane only\)  — "This partially reverses R6/.test(g.out) && /Code cites:\n  test\/fixture\/app\.js:41  function makeToolbar/.test(g.out) && /test\/fixture\/styles\.css:\d+/.test(g.out), g.out);
  ok('governs computes no status: a superseded clause is shown as an edge, nothing more', !/superseded\b.*status|status:/i.test(docket(['governs', 'R3'], { cwd: FIX }).out));
  const g2 = docket(['governs', 'R3'], { cwd: FIX });
  ok('governs excludes ledger documents from code cites', !/history\//.test(g2.out) && /test\/fixture\/app\.js:95/.test(g2.out), g2.out);
  const g99 = docket(['governs', 'R99'], { cwd: FIX });
  ok('governs of an unknown id names the ledger and exits 2', g99.code === 2 && /no ruling R99 in test\/fixture\/DECISIONS\.md/.test(g99.err), g99.err);
  const q0 = docket(['query', 'zzz-nothing-matches'], { cwd: FIX });
  ok('query with no match says so and exits 0', q0.code === 0 && /^no ruling matches "zzz-nothing-matches" in DECISIONS\.md/.test(q0.out), q0.out);
  const p = docket(['principles'], { cwd: FIX });
  ok('principles reads the list from the first section of PRD.md beside the ledger', p.code === 0 && p.out.split('\n').filter(Boolean).length === 3 && /^\- \*\*Capture precedes structure\.\*\*/.test(p.out), p.out);
  const pr = docket(['principles']);
  ok('principles falls back to the ledger preamble when no PRD.md sits beside it', pr.code === 0 && pr.out.split('\n').filter(Boolean).length === 5 && /One home per value/.test(pr.out), pr.out);
  const s = docket(['status'], { cwd: FIX });
  ok('status: the docket names the ledger, the last three rulings, uncited rulings, pending addenda, the last verdict and the witness', /^Docket — test\/fixture\/DECISIONS\.md \(9 rulings; prefixes A, R\)\nLast rulings:\n  R8  /.test(s.out) && /Cited nowhere: none/.test(s.out) && /Addenda pending: \n  R2 \(2026-09-11\)/.test(s.out) && /Last verdict: none/.test(s.out) && /Witness: FAIL \(1\)/.test(s.out), s.out);
  const sj = docket(['status', '--json'], { cwd: FIX });
  ok('status --json carries the same docket', sj.code === 0 && JSON.parse(sj.out).uncited.length === 0);
  const silent = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-s-'));
  const ss = docket(['status'], { cwd: silent });
  ok('status in an ungoverned directory is silent', ss.code === 0 && ss.out === '');
  const usage = docket(['nonsense']);
  ok('an unknown subcommand is a usage error (exit 2)', usage.code === 2);
  const root = docket(['check']);
  ok('the repository passes its own check (D6)', root.code === 0, root.out + root.err);
  const w = docket([]);
  ok('the witness mode at the root: check plus the project spec, ok', w.code === 0 && /^witness: ok/m.test(w.out), w.out);
}

// ── gate and verdict (D10, D11): SKIP / JUDGE / SURFACE with a scripted .docket/ state ──
{
  const d = tempRepo();
  const S = { cwd: d, env: { DOCKET_SESSION: 's1' } };
  let g = docket(['gate', '--session', 's1'], { cwd: d });
  ok('gate: no governed change since HEAD → SKIP', g.code === 0 && g.out === 'SKIP\n', g.out);
  fs.appendFileSync(path.join(d, 'test', 'fixture', 'app.js'), 'const later = 1; // R2\n');
  g = docket(['gate', '--session', 's1'], { cwd: d });
  ok('gate: a governed change → JUDGE <hash> <files>', g.code === 0 && /^JUDGE [0-9a-f]{64} test\/fixture\/app\.js\n$/.test(g.out), g.out);
  const hash = g.out.split(' ')[1];
  let v = docket(['verdict', 'FAIL', '--hash', hash, '--failures', '3', '--session', 's1'], { cwd: d });
  ok('verdict FAIL records and bumps the session block count', v.code === 0 && /verdict recorded: FAIL \(3 located failures\); session s1: 1 block since the last PASS/.test(v.out), v.out);
  const st = JSON.parse(read(path.join(d, '.docket', 'verdict.json')));
  ok('verdict writes .docket/verdict.json with the last verdict and the session', st.last.verdict === 'FAIL' && st.last.hash === hash && st.sessions.s1.blocks === 1 && st.sessions.s1.history[0] === 3, JSON.stringify(st));
  g = docket(['gate', '--session', 's1'], { cwd: d });
  ok('gate after a FAIL with the same diff → JUDGE again', /^JUDGE /.test(g.out), g.out);
  // the hash changes (the maker edits again); the counter must not reset
  fs.appendFileSync(path.join(d, 'test', 'fixture', 'app.js'), 'const later2 = 2; // R2\n');
  g = docket(['gate', '--session', 's1'], { cwd: d });
  const hash2 = g.out.split(' ')[1];
  ok('gate: a changed hash is a new JUDGE, not a reset', /^JUDGE /.test(g.out) && hash2 !== hash, g.out);
  docket(['verdict', 'FAIL', '--hash', hash2, '--failures', '3', '--session', 's1'], { cwd: d });
  const st2 = JSON.parse(read(path.join(d, '.docket', 'verdict.json')));
  ok('the block counter survives a changed hash (2 blocks)', st2.sessions.s1.blocks === 2 && st2.sessions.s1.history.join(',') === '3,3', JSON.stringify(st2.sessions));
  docket(['verdict', 'FAIL', '--hash', hash2, '--failures', '3', '--session', 's1'], { cwd: d });
  g = docket(['gate', '--session', 's1'], { cwd: d });
  ok('gate: after the third block with failures not decreasing → SURFACE with the residue and the relay line', /^SURFACE\nresidue: 3 blocks this session since the last PASS; located failures per verdict: 3 → 3 → 3\n/.test(g.out) && /report this to the user verbatim, then stop again$/m.test(g.out), g.out);
  g = docket(['gate', '--session', 's1'], { cwd: d });
  ok('gate: a surfaced session answers SKIP from then on', g.out === 'SKIP\n', g.out);
  g = docket(['gate', '--session', 's2'], { cwd: d });
  ok('gate: a new session is not surfaced → JUDGE', /^JUDGE /.test(g.out), g.out);
  v = docket(['verdict', 'PASS', '--hash', hash2, '--failures', '0', '--session', 's1'], { cwd: d });
  ok('verdict PASS resets the session and records the pass hash', /session s1: 0 blocks since the last PASS/.test(v.out) && JSON.parse(read(path.join(d, '.docket', 'verdict.json'))).lastPassHash === hash2, v.out);
  g = docket(['gate', '--session', 's1'], { cwd: d });
  ok('gate: the hash of the last PASS → SKIP', g.out === 'SKIP\n', g.out);
  g = docket(['gate', '--session', 's3'], { cwd: d });
  ok('gate: the last PASS hash skips for every session', g.out === 'SKIP\n', g.out);
  // five blocks with decreasing failures still hit the cap
  const d2 = tempRepo();
  fs.appendFileSync(path.join(d2, 'test', 'fixture', 'app.js'), 'const x = 1; // R2\n');
  const h = docket(['gate', '--session', 'c'], { cwd: d2 }).out.split(' ')[1];
  for (const n of [9, 8, 7, 6, 5]) docket(['verdict', 'FAIL', '--hash', h, '--failures', String(n), '--session', 'c'], { cwd: d2 });
  g = docket(['gate', '--session', 'c'], { cwd: d2 });
  ok('gate: five blocks since the last PASS → SURFACE even while failures decrease (the cap binds)', /^SURFACE\nresidue: 5 blocks/.test(g.out), g.out);
  const st3 = JSON.parse(read(path.join(d2, '.docket', 'verdict.json')));
  ok('gate writes the surfaced mark itself', st3.sessions.c.surfaced === true);
  ok('.docket/ is ignored by git', sh('git', ['check-ignore', '.docket/verdict.json'], d2).status === 0 || !fs.existsSync(path.join(d2, '.gitignore')));
  const u = docket(['verdict', 'MAYBE', '--hash', h, '--failures', '0'], { cwd: d2 });
  ok('verdict with an unknown value is a usage error', u.code === 2);
  void S;
}

// ── the grammar's edges (FORMAT.md 2, 3, 8, 13, 15): code spans, stray headings, repeats, removals, the window's bounds ──
{
  const base = docket(['near'], { input: nearInput(APP, 'makeToolbar(') }).out;
  const quoted = tempRepo(d => { fs.appendFileSync(path.join(d, 'test', 'fixture', 'app.js'), 'const doc = 1; // the id `R99` here is quoted, not cited\n'); edit(d, 'test/fixture/app.js', 'function makeToolbar(', 'function makeToolbar( /* `A1` quoted */'); });
  let r = docket(['check'], { cwd: quoted });
  ok('check 1: an id inside a code span is quoted, not cited', r.code === 0, r.out);
  const lz = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'app.js'), 'const lz = 1; // R05 has a leading zero and is not a cite; R0 neither\n'));
  r = docket(['check'], { cwd: lz });
  ok('check 1: an id with a leading zero is not a cite (FORMAT.md 2, 8)', r.code === 0, r.out);
  const fence = tempRepo(d => fs.writeFileSync(path.join(d, 'test', 'fixture', 'NOTES.md'), 'Prose citing R6 makes this file governed.\n\n```text\nQuoted output: R99 and UIUX §9.9 and a bare §7 here are quoted, not cited.\n```\n\nAnd `R98` inline is quoted too.\n'));
  r = docket(['check'], { cwd: fence });
  ok('check: a fenced code block quotes its cites, spec cites and bare cites (FORMAT.md 8)', r.code === 0, r.out);
  const fn = docket(['near'], { cwd: fence, input: nearInput(path.join(fence, 'test', 'fixture', 'NOTES.md'), 'Prose citing') });
  ok('near: a fenced block adds nothing to the window', /^Governed here \(test\/fixture\/DECISIONS\.md, ±20 lines of NOTES\.md:1\):\n  R6  /.test(fn.out) && !/R99|Also cited/.test(fn.out), fn.out);
  const ref = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '\nA stray reference: see R99 in prose, with no verb.\n'));
  r = docket(['check'], { cwd: ref });
  ok('check 1: a reference inside the ledger to a ruling that does not exist fails (FORMAT.md 8)', r.code === 1 && /DECISIONS\.md:\d+  check 1: cite R99 names no ruling/.test(r.out), r.out);
  const qn = docket(['near'], { cwd: quoted, input: nearInput(path.join(quoted, 'test', 'fixture', 'app.js'), 'makeToolbar(') });
  ok('near: an id inside a code span adds nothing to the window', qn.out === base, qn.out);
  const stray = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', 'Notes fold together by shape and by size', 'Notes fold together by shape and by size\n### Decision three, continued\nand the line above ended nothing'));
  const sj = JSON.parse(docket(['index'], { cwd: path.join(stray, 'test', 'fixture') }).out);
  const s3 = sj.rulings.find(x => x.id === 'R3');
  ok('a `### ` line that is not an entry heading is body text of the entry above', sj.rulings.length === 9 && s3.body.includes('### Decision three, continued') && s3.body.includes('ended nothing'), s3 && s3.body);
  r = docket(['check'], { cwd: stray });
  ok('…and check reads it there', r.code === 0, r.out);
  const dup = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', '### R7. The relational plane', '### R6. The relational plane'));
  r = docket(['check'], { cwd: dup });
  ok('check 2: a repeated id fails (each number is its position)', r.code === 1 && /check 2: numbering: R6 follows R6; expected R7/.test(r.out), r.out);
  const rm = tempRepo();
  { const p = path.join(rm, 'test', 'fixture', 'DECISIONS.md'); const t = read(p); fs.writeFileSync(p, t.slice(0, t.indexOf('### R3.')) + t.slice(t.indexOf('### R4.'))); }
  r = docket(['check'], { cwd: rm });
  ok('check 7: an entry removed after commit fails (the committed entries are enumerated)', r.code === 1 && /check 7: R3 was removed \(append only\)/.test(r.out), r.out);
  const t71 = 'word '.repeat(14) + 'x', t72 = 'word '.repeat(14) + 'xy', t73 = 'word '.repeat(14) + 'xyz', t73ns = 'a'.repeat(73);
  const tb = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'),
    ['', `### R9. ${t71} (issue #31)`, 'Principle: Zero cognitive tax.', 'Reason: r.', `### R10. ${t72} (issue #32)`, 'Principle: Zero cognitive tax.', 'Reason: r.',
     `### R11. ${t73} (issue #33)`, 'Principle: Zero cognitive tax.', 'Reason: r.', `### R12. ${t73ns} (issue #34)`, 'Principle: Zero cognitive tax.', 'Reason: r.', ''].join('\n')));
  const tj = JSON.parse(docket(['index'], { cwd: path.join(tb, 'test', 'fixture') }).out);
  const T = id => tj.rulings.find(x => x.id === id).title;
  ok('title rule: 71 code points are kept whole', T('R9') === t71 && Array.from(T('R9')).length === 71, T('R9'));
  ok('title rule: exactly 72 code points are kept whole', T('R10') === t72 && Array.from(T('R10')).length === 72, T('R10'));
  ok('title rule: 73 code points cut back to the last space inside the first 72, with …', T('R11') === 'word '.repeat(13) + 'word…' && Array.from(T('R11')).length <= 72, T('R11'));
  ok('title rule: 73 code points and no space are cut at 71, with … (72 in all)', T('R12') === 'a'.repeat(71) + '…' && Array.from(T('R12')).length === 72, T('R12'));
  r = docket(['check'], { cwd: tb });
  ok('…and the four entries pass check under the contract', r.code === 0, r.out);
  // the window's bounds: 20 before and 20 after, both inclusive; a ruling cited twice ranks by its nearest cite
  const win = tempRepo(d => {
    const L = []; for (let i = 1; i <= 80; i++) L.push(`const a${i} = ${i};`);
    L[49] = 'anchorX();'; L[29] = '// R3 at 20 before'; L[69] = '// R4 at 20 after'; L[28] = '// R5 at 21 before'; L[70] = '// R6 at 21 after';
    L[31] = '// R7 far'; L[44] = '// R7 near'; L[39] = '// R8';
    fs.writeFileSync(path.join(d, 'test', 'fixture', 'edge.js'), L.join('\n') + '\n');
  });
  const wn = docket(['near'], { cwd: win, input: nearInput(path.join(win, 'test', 'fixture', 'edge.js'), 'anchorX()') });
  const ids = wn.out.split('\n').filter(l => /^  [AR]\d+  /.test(l)).map(l => l.trim().split(/\s+/)[0]);
  ok('near: the window is ±20 inclusive — a cite 20 lines away is in, 21 is out', ids.includes('R3') && ids.includes('R4') && !ids.includes('R5') && !ids.includes('R6'), wn.out);
  ok('near: a ruling cited twice ranks by its nearest cite, then the others nearest first, ties by line', ids.join(',') === 'R7,R8,R3,R4', ids.join(','));
  // the union: nine rulings across two windows list eight, the ninth being the least cited and farthest from the first match; nine matches name eight lines and +1 more
  const un = tempRepo(d => {
    const L = []; for (let i = 1; i <= 130; i++) L.push(`const b${i} = ${i};`);
    L[29] = 'anchor();'; L[99] = 'anchor();';
    L[20] = '// R1'; L[21] = '// R1'; L[22] = '// R1'; L[23] = '// R2'; L[24] = '// R2'; L[25] = '// R3'; L[26] = '// R4'; L[27] = '// R5';
    L[90] = '// R6'; L[91] = '// R6'; L[92] = '// R7'; L[93] = '// R8'; L[119] = '// A1';
    fs.writeFileSync(path.join(d, 'test', 'fixture', 'dense.js'), L.join('\n') + '\n');
    const T2 = []; for (let i = 1; i <= 12; i++) T2.push(i <= 9 ? 'tick(); // R2' : `const c${i} = ${i};`);
    fs.writeFileSync(path.join(d, 'test', 'fixture', 'ticks.js'), T2.join('\n') + '\n');
  });
  const uo = docket(['near'], { cwd: un, input: nearInput(path.join(un, 'test', 'fixture', 'dense.js'), 'anchor()', { replace_all: true }) });
  const uids = uo.out.split('\n').filter(l => /^  [AR]\d+  /.test(l)).map(l => l.trim().split(/\s+/)[0]);
  ok('near: a union of nine rulings lists eight — most cited, then nearest to the first match, then the earlier line — and says +1 more', uids.join(',') === 'R1,R2,R6,R5,R4,R3,R7,R8' && uo.out.startsWith('Governed here (test/fixture/DECISIONS.md, ±20 lines of dense.js:30, 100):\n') && uo.out.includes('\n  R8  ' ) && /\n  \+1 more\n/.test(uo.out), uo.out);
  ok('near: eight or fewer rulings carry no +more line', !/\+\d+ more\n/.test(base), base);
  const to = docket(['near'], { cwd: un, input: nearInput(path.join(un, 'test', 'fixture', 'ticks.js'), 'tick()', { replace_all: true }) });
  ok('near: nine matches name the first eight lines and +1 more', to.out.startsWith('Governed here (test/fixture/DECISIONS.md, ±20 lines of ticks.js:1, 2, 3, 4, 5, 6, 7, 8 +1 more):\n  R2  '), to.out);
  const missing = docket(['near'], { input: nearInput(path.join(FIX, 'no-such-file.js'), 'x') });
  ok('near: an edit of a file that does not exist → silent', missing.code === 0 && missing.out === '');
  // status shows a surfaced session (D11)
  const sf = tempRepo();
  fs.appendFileSync(path.join(sf, 'test', 'fixture', 'app.js'), 'const y = 1; // R2\n');
  const hs = docket(['gate', '--session', 'q'], { cwd: sf }).out.split(' ')[1];
  for (const n of [4, 4, 4]) docket(['verdict', 'FAIL', '--hash', hs, '--failures', String(n), '--session', 'q'], { cwd: sf });
  ok('gate: three blocks without a decrease → SURFACE', /^SURFACE\n/.test(docket(['gate', '--session', 'q'], { cwd: sf }).out));
  const so = docket(['status'], { cwd: path.join(sf, 'test', 'fixture') });
  ok('status names the surfaced session beside the last verdict', /Last verdict: FAIL at [^\n]* \(4 located failures\); session q is SURFACED — its residue waits for the human/.test(so.out), so.out);
  ok('status --json carries the surfaced flag', JSON.parse(docket(['status', '--json'], { cwd: path.join(sf, 'test', 'fixture') }).out).surfaced === true);
}

console.log(`witness: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
