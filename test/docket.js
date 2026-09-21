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
  ok('the 900-character heading is cut at the last word boundary before 72, with …: 66 code points, the word before the cut whole', ('### R8. ' + r8.heading).length === 900 && r8.title.endsWith('…') && Array.from(r8.title).length === 66 && r8.title === 'The frame that was never typed into is discarded on blur, and the…' && !r8.title.includes(' ('), r8.title);
  ok('the title is cut at the first " (" before the 72-character rule', r4.title === 'Fold similarity: shape held, size uniform' && r4.meta === 'supersedes R3', r4.title + ' | ' + r4.meta);
  ok('issue is read from the meta', r6.issue === 12 && r4.issue === null);
  // ── edges (FORMAT.md 5) ──
  const r7 = j.rulings.find(r => r.id === 'R7');
  ok('a body edge carries adverb, target and qualifier', r7.edges.length === 1 && r7.edges[0].adverb === 'partially' && r7.edges[0].verb === 'reverses' && r7.edges[0].to === 'R6' && r7.edges[0].qualifier === 'relational plane only', JSON.stringify(r7.edges));
  ok('an edge stated in the heading and again in the body is one edge, and its clause is the first statement — the meta\'s "waives R1", not the body\'s sentence', r8.edges.length === 1 && r8.edges[0].verb === 'waives' && r8.edges[0].to === 'R1' && r8.edges[0].clause === 'waives R1', JSON.stringify(r8.edges));
  const r2a = j.rulings.find(r => r.id === 'R2').addenda;
  ok('R2 carries its one addendum with the date and the text as written (FORMAT.md 6)', r2a.length === 1 && r2a[0].date === '2026-09-11' && r2a[0].text === 'the render pass now rounds to the device pixel for drawing only; reading still writes nothing, and the rule stands as written.', JSON.stringify(r2a));
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
  ok('near: many matches without replace_all → silent', manyNo.code === 0 && manyNo.out === '' && manyNo.err === '', manyNo.out);
  const manyYes = docket(['near'], { input: nearInput(APP, "  el.classList.add('note');", { replace_all: true }) });
  ok('near: many matches with replace_all → the union, cap 8 by count then nearest to the first', manyYes.code === 0 && manyYes.out === expected('near-union.txt'), manyYes.out);
  const zero = docket(['near'], { input: nearInput(APP, 'no such text anywhere') });
  ok('near: zero matches → silent', zero.code === 0 && zero.out === '' && zero.err === '');
  const empty = docket(['near'], { input: nearInput(APP, '') });
  ok('near: an empty old_string → silent', empty.code === 0 && empty.out === '' && empty.err === '');
  const whole = docket(['near'], { input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: APP, content: 'x' } }) });
  ok('near: Write of an existing governed file → whole file, cap 8 by count', whole.code === 0 && whole.out === expected('near-whole.txt'), whole.out);
  const fresh = docket(['near'], { input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: path.join(FIX, 'brand-new.js'), content: 'x' } }) });
  ok('near: Write of a new file → silent', fresh.code === 0 && fresh.out === '' && fresh.err === '');
  const far = docket(['near'], { input: nearInput(APP, '  return JSON.stringify(out);') });
  ok('near: a governed file whose window cites nothing → the one-line notice', far.code === 0 && far.out === expected('near-empty-window.txt'), far.out);
  const ungoverned = docket(['near'], { input: nearInput(path.join(ROOT, 'LICENSE'), 'Permission is hereby granted') });   // one match, so this is the cites-nothing row and not the many-matches row
  ok('near: a file that cites nothing → silent', ungoverned.code === 0 && ungoverned.out === '' && ungoverned.err === '');
  const hook = docket(['near'], { input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: APP, old_string: 'makeToolbar(' } }) });
  const hj = hook.code === 0 ? JSON.parse(hook.out) : null;
  ok('near: with a hook event name the same text is wrapped for injection', hj && hj.hookSpecificOutput.hookEventName === 'PreToolUse' && hj.hookSpecificOutput.additionalContext + '\n' === expected('near-41.txt'), hook.out);
  const garbage = docket(['near'], { input: 'not json' });
  ok('near: unusable stdin never blocks (exit 0, silent)', garbage.code === 0 && garbage.out === '' && garbage.err === '');
  const noLedger = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-nl-'));
  fs.writeFileSync(path.join(noLedger, 'a.js'), 'const x = 1; // R6\n');
  const nl = docket(['near'], { input: nearInput(path.join(noLedger, 'a.js'), 'x = 1') });
  ok('near: a file with no ledger above it → silent', nl.code === 0 && nl.out === '' && nl.err === '');
  // a governed file of 5,000 lines: the window stays ±20 and the answer is immediate
  const big = tempRepo(dir => {
    const lines = [];
    for (let i = 1; i <= 5000; i++) lines.push(i % 250 === 0 ? `const v${i} = ${i}; // R2` : `const v${i} = ${i};`);
    lines[2499] = 'function anchorHere() {} // R6';
    lines[2509] = 'const nearTheAnchor = 1; // R2';
    lines[2520] = 'const justOutside = 1; // R7'; // line 2521: one past the window's last line, 2520
    lines[2478] = 'const alsoOutside = 1; // R5'; // line 2479: one before its first, 2480
    fs.writeFileSync(path.join(dir, 'test', 'fixture', 'big.js'), lines.join('\n') + '\n');
  });
  // 5000 ms is the hook's own timeout in the host binding: an answer slower than that never reaches the maker, so the
  // bound is the property, not a guess (FORMAT.md 15). One sample on a shared machine measures the machine; the fastest
  // of three measures the core, and still fails if the window's computation ever stops being linear in the file.
  let bigOut = null, bigMs = Infinity;
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    bigOut = docket(['near'], { cwd: big, input: nearInput(path.join(big, 'test', 'fixture', 'big.js'), 'anchorHere') });
    bigMs = Math.min(bigMs, Date.now() - t0);
  }
  ok('near: a 5,000-line governed file answers with the ±20 window, inside the hook timeout', bigOut.code === 0 && bigOut.out.startsWith('Governed here (test/fixture/DECISIONS.md, ±20 lines of big.js:2500):\n  R6  ') && bigOut.out.includes('\n  R2  ') && !/\n  R[57]  /.test(bigOut.out) && bigMs < 5000, bigOut.out);
  ok('near: the window is 41 lines — a cite one line past either edge is not listed', !/\n  R[57]  /.test(bigOut.out) && bigOut.out.split('\n').filter(l => /^  R\d+  /.test(l)).length === 2, bigOut.out);
}

// ── check (FORMAT.md 13): the seven checks, each with a planted failure in a temp copy ──
{
  const clean = tempRepo();
  const c0 = docket(['check'], { cwd: clean });
  ok('check: the clean fixture passes', c0.code === 0 && /^check: ok/m.test(c0.out), c0.out + c0.err);
  const c1 = tempRepo(d => edit(d, 'test/fixture/app.js', '// R6: the toolbar replaces the long-press menu', '// R9: the toolbar replaces the long-press menu'));
  let r = docket(['check'], { cwd: c1 });
  ok('check 1: a cite to a ruling that does not exist fails at its line, naming the ledger', r.code === 1 && /^test\/fixture\/app\.js:41  check 1: cite R9 names no ruling in test\/fixture\/DECISIONS\.md$/m.test(r.out), r.out);
  const c2b = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', '### R7. The relational plane', '### R9. The relational plane'));
  r = docket(['check'], { cwd: c2b });
  ok('check 2: numbering that skips fails at the heading', r.code === 1 && /DECISIONS\.md:\d+  check 2: numbering: R9 is entry 7 of the R entries; expected R7/.test(r.out), r.out);
  const c3 = tempRepo(d => edit(d, 'test/fixture/app.js', 'UIUX ' + SEC + '4.5 the minimum', 'UIUX ' + SEC + '4.6 the minimum'));
  r = docket(['check'], { cwd: c3 });
  ok('check 3: a spec cite that names no heading fails at its line', r.code === 1 && new RegExp('^test/fixture/app\\.js:55  check 3: UIUX ' + SEC + '4\\.6 names no heading', 'm').test(r.out), r.out);
  const c4 = tempRepo(d => edit(d, 'test/fixture/app.js', 'const HIT_FLOOR = 44; // ' + SEC + '4 minimum', 'const HIT_FLOOR = 44; // ' + SEC + '4 ' + SEC + '4 minimum'));
  r = docket(['check'], { cwd: c4 });
  ok('check 4: a bare-§ count above its allowance fails', r.code === 1 && /^test\/fixture\/app\.js:18  check 4: bare-§ cites: 4 > allowance 3 for app\.js/m.test(r.out), r.out);
  const c4b = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', '<!-- docket: bare-cites app.js=3 -->\n', ''));
  r = docket(['check'], { cwd: c4b });
  ok('check 4: with no baseline the count is reported, not failed — the whole info line', r.code === 0 && /^info  test\/fixture\/app\.js: 3 bare-§ cites \(no baseline in test\/fixture\/DECISIONS\.md; reported, not failed\)$/m.test(r.out), r.out);
  const c5 = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', '(issue #16; waives R1)', '(issue #16; waives R8)'));
  r = docket(['check'], { cwd: c5 });
  ok('check 5: an edge from a ruling to itself fails', r.code === 1 && /^test\/fixture\/DECISIONS\.md:\d+  check 5: edge R8 waives R8: a ruling may not name itself$/m.test(r.out), r.out);
  const c5b = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', 'Fold similarity: shape held, size uniform (supersedes R3)', 'Fold similarity: shape held, size uniform (supersedes R7)'));
  r = docket(['check'], { cwd: c5b });
  ok('check 5: an edge to a later ruling fails', r.code === 1 && /^test\/fixture\/DECISIONS\.md:\d+  check 5: edge R4 supersedes R7: R7 is defined later \(line \d+\) than R4 \(line \d+\)$/m.test(r.out), r.out);
  const c6 = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', 'Principle: Capture precedes structure.\n', ''));
  r = docket(['check'], { cwd: c6 });
  ok('check 6: a contract-bound entry without a Principle: line fails', r.code === 1 && /check 6: R8: no "Principle:" line/.test(r.out), r.out);
  const c6b = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', '(issue #16; waives R1)', '(waives R1; issue #16)'));
  r = docket(['check'], { cwd: c6b });
  ok('check 6: a meta that opens with an edge fails', r.code === 1 && /check 6: R8: meta must open with a grounding/.test(r.out), r.out);
  const c6c = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', 'Reason: a blank frame costs a read', 'Because a blank frame costs a read'));
  r = docket(['check'], { cwd: c6c });
  ok('check 6: a contract-bound entry without Reason: fails', r.code === 1 && /check 6: R8: body has no "Reason:"/.test(r.out), r.out);
  const looseR3 = JSON.parse(docket(['index'], { cwd: path.join(clean, 'test', 'fixture') }).out).rulings.find(x => x.id === 'R3');
  ok('check 6 binds only from the contract line: R3, loose, has no Principle: line and the clean fixture still passes', looseR3 && looseR3.principle === null && c0.code === 0, JSON.stringify(looseR3 && looseR3.principle));
  const c7 = tempRepo();
  edit(c7, 'test/fixture/DECISIONS.md', 'Notes fold together by shape and by size', 'Notes fold together by shape');
  r = docket(['check'], { cwd: c7 });
  ok('check 7: an existing body changed after commit fails (append only)', r.code === 1 && /^test\/fixture\/DECISIONS\.md:\d+  check 7: R3: body changed other than by appended addendum lines \(append only\)$/m.test(r.out), r.out);
  const c7b = tempRepo();
  edit(c7b, 'test/fixture/DECISIONS.md', '### R3. Fold similarity (issue #4)', '### R3. Fold similarity and size (issue #4)');
  r = docket(['check'], { cwd: c7b });
  ok('check 7: an existing heading changed after commit fails', r.code === 1 && /^test\/fixture\/DECISIONS\.md:\d+  check 7: R3: heading changed \(append only\): "Fold similarity \(issue #4\)" → "Fold similarity and size \(issue #4\)"$/m.test(r.out), r.out);
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
  ok('check 7: a clean tree is judged against HEAD~1, so a committed edit still fails', r.code === 1 && /^test\/fixture\/DECISIONS\.md:\d+  check 7: R3: body changed other than by appended addendum lines \(append only\)$/m.test(r.out), r.out);
  const c7f = tempRepo();
  fs.appendFileSync(path.join(c7f, 'test', 'fixture', 'DECISIONS.md'), '\n### R9. A new ruling (issue #20)\nPrinciple: Zero cognitive tax.\nText. Reason: r.\n');
  sh('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'append'], c7f);
  r = docket(['check'], { cwd: c7f });
  ok('check 7: a clean tree whose last commit only appended passes', r.code === 0, r.out);
  ok('check 7: a clean tree with one commit is skipped (no earlier version), and the skip is said', c0.code === 0 && /^info  test\/fixture\/DECISIONS\.md: check 7 skipped — no committed version to compare/m.test(c0.out), c0.out);
  ok('check 7: with an earlier version the skip line is absent', !/check 7 skipped/.test(docket(['check'], { cwd: c7f }).out));
  // a ledger with CRLF line endings parses, cites and compares like an LF one
  const crlf = tempRepo(d => { const p = path.join(d, 'test', 'fixture', 'DECISIONS.md'); fs.writeFileSync(p, read(p).replace(/\n/g, '\r\n')); });
  r = docket(['check'], { cwd: crlf });
  const crlfIx = JSON.parse(docket(['index'], { cwd: path.join(crlf, 'test', 'fixture') }).out);
  ok('check: a CRLF ledger passes every check, and the check had entries to run on — an empty ledger also exits 0', r.code === 0 && crlfIx.rulings.length === 9 && /governed-tree file/.test(r.out), r.out + r.err + JSON.stringify(crlfIx.rulings.length));
  const crlfNear = docket(['near'], { cwd: crlf, input: nearInput(path.join(crlf, 'test', 'fixture', 'app.js'), 'makeToolbar(') });
  ok('near: a CRLF ledger yields the same window text', crlfNear.out === expected('near-41.txt'), crlfNear.out);
  // an empty ledger: nothing governed, nothing fails
  const emptyL = tempRepo(d => { fs.writeFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '# Empty\n'); edit(d, 'test/fixture/app.js', 'UIUX ' + SEC + '4.5 the minimum', 'UIUX ' + SEC + '9.9 the minimum'); });
  r = docket(['check'], { cwd: emptyL });
  ok('check: an empty ledger fails nothing and governs nothing — none of the seven checks runs on its files, and an info line says so (FORMAT.md 1)', r.code === 0 && /^info  test\/fixture\/DECISIONS\.md: no entries; its subtree is ungoverned and no check runs on its 10 files$/m.test(r.out) && !/check 3/.test(r.out), r.out + r.err);
  const emptied = tempRepo();
  fs.writeFileSync(path.join(emptied, 'test', 'fixture', 'DECISIONS.md'), '# Emptied after the commit\n');
  r = docket(['check'], { cwd: emptied });
  ok('check 7: a committed ledger emptied in the working tree is nine removals, beside the info line', r.code === 1 && /^test\/fixture\/DECISIONS\.md:\d+  check 7: A1 was removed \(append only\)$/m.test(r.out) && /^test\/fixture\/DECISIONS\.md:\d+  check 7: R8 was removed \(append only\)$/m.test(r.out) && /^info  test\/fixture\/DECISIONS\.md: no entries/m.test(r.out), r.out);
  const cr = tempRepo(d => { const p = path.join(d, 'test', 'fixture', 'DECISIONS.md'); fs.writeFileSync(p, read(p).replace(/\n/g, '\r')); });
  r = docket(['check'], { cwd: cr });
  ok('check: a ledger with bare CR endings is one line with no entries, and the info line names it (FORMAT.md 1)', r.code === 0 && /^info  test\/fixture\/DECISIONS\.md: no entries/m.test(r.out), r.out + r.err);
  const emptyNear = docket(['near'], { cwd: emptyL, input: nearInput(path.join(emptyL, 'test', 'fixture', 'app.js'), 'makeToolbar(') });
  ok('near: under an empty ledger every file is ungoverned → silent', emptyNear.code === 0 && emptyNear.out === '' && emptyNear.err === '');
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
  const ledgerAfterR9 = read(path.join(cwd, 'DECISIONS.md'));
  ok('append: a principle not in the list is refused by name, and nothing is written', r.code === 2 && /principle "Move fast" is not one of/.test(r.err) && read(path.join(cwd, 'DECISIONS.md')) === ledgerAfterR9, r.err);
  r = docket(['append', '--title', 'Bad edge', '--issue', '22', '--principle', 'Zero cognitive tax', '--edge', 'touches R4', '--body', 'Reason: none.'], { cwd });
  ok('append: an edge with a verb not in the list is refused, and nothing is written', r.code === 2 && /is not "<verb> <id>"/.test(r.err) && read(path.join(cwd, 'DECISIONS.md')) === ledgerAfterR9, r.err);
  r = docket(['append', '--title', 'Bad target', '--issue', '22', '--principle', 'Zero cognitive tax', '--edge', 'refines R40', '--body', 'Reason: none.'], { cwd });
  ok('append: an edge to a ruling that does not exist is refused, and nothing is written', r.code === 2 && /names R40, which is not in/.test(r.err) && read(path.join(cwd, 'DECISIONS.md')) === ledgerAfterR9, r.err);
  r = docket(['append', '--title', 'A title (with a parenthetical)', '--issue', '22', '--principle', 'Zero cognitive tax', '--body', 'Reason: none.'], { cwd });
  ok('append: a title containing " (" is refused, and nothing is written', r.code === 2 && /may not contain/.test(r.err) && read(path.join(cwd, 'DECISIONS.md')) === ledgerAfterR9, r.err);
  r = docket(['append', '--title', 'Read `fn (x)` before the call', '--issue', '23', '--principle', 'Zero cognitive tax', '--body', 'Reason: r.'], { cwd });
  ok('append: a " (" inside a code span is code, not the meta — the title is accepted and parses whole (FORMAT.md 3)', r.code === 0 && /^### R10\. Read `fn \(x\)` before the call \(issue #23\)$/m.test(r.out) && JSON.parse(docket(['index'], { cwd }).out).rulings.find(x => x.id === 'R10').title === 'Read fn (x) before the call', r.err + r.out);
  r = docket(['append', '--addendum', 'R5', '--text', 'the lot now has four sections; the count no longer holds.'], { cwd, env: { DOCKET_TODAY: '2026-09-12' } });
  ok('append --addendum writes a dated line as the last line of the entry and check passes', r.code === 0 && /^> Addendum 2026-09-12: the lot now has four sections; the count no longer holds\.$/m.test(r.out) && /check: ok/.test(r.out), r.out + r.err);
  const led = read(path.join(cwd, 'DECISIONS.md'));
  const i5 = led.indexOf('### R5.'), i6 = led.indexOf('### R6.');
  ok('append --addendum: the line sits under R5, before R6', led.slice(i5, i6).includes('> Addendum 2026-09-12:'));
  r = docket(['append', '--addendum', 'R77', '--text', 'x'], { cwd });
  ok('append --addendum to a ruling that does not exist is refused, naming the id and the ledger', r.code === 2 && /^append: --addendum R77 names no ruling in test\/fixture\/DECISIONS\.md$/m.test(r.err), r.err);
  edit(d, 'test/fixture/app.js', 'const HIT_FLOOR = 44; // ' + SEC + '4 minimum', 'const HIT_FLOOR = 44; // ' + SEC + '4 ' + SEC + '4 minimum');
  r = docket(['check'], { cwd });
  ok('a fourth bare cite fails the ratchet before --baseline, with the count and the allowance', r.code === 1 && /check 4: bare-§ cites: 4 > allowance 3 for app\.js/.test(r.out), r.out);
  r = docket(['append', '--baseline'], { cwd });
  ok('append --baseline rewrites the allowance from the counts and check passes', r.code === 0 && /<!-- docket: bare-cites app\.js=4 -->/.test(r.out) && /check: ok/.test(r.out), r.out + r.err);
  const status = docket(['status'], { cwd });
  ok('status lists the pending addenda (R2 then R5) and the new last rulings', /Addenda pending: \n  R2 \(2026-09-11\)[^\n]*\n  R5 \(2026-09-12\): the lot now has four sections/.test(status.out) && /Last rulings:\n  R10  Read fn \(x\) before the call  · issue #23\n  R9  Pinned notes keep their size  · issue #21/.test(status.out) && /Cited nowhere: R9, R10 \(2 of 11\)/.test(status.out), status.out);
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
  const gStat = docket(['governs', 'R3'], { cwd: FIX }).out, gHeads = gStat.split('\n').filter(l => /^\S.*:$/.test(l));
  ok('governs computes no status (D3): its only sections are the four it prints, and no line names a state, a label or a verdict for the ruling', gHeads.join('|') === 'Out-edges (what R3 does to earlier rulings):|In-edges (what later rulings do to R3):|Addenda:|Code cites:' && gStat.split('\n').filter(Boolean).every((l, i) => i === 0 ? /^R3  .+  \(.+:\d+\)$/.test(l) : (gHeads.includes(l) || /^  \S/.test(l))), gStat);
  const g4 = docket(['governs', 'R4'], { cwd: FIX });
  ok('governs R4 renders a populated out-edge list: the header with no issue, then the edge with its clause text, and an empty in-edge section', g4.code === 0 && /^R4  Fold similarity: shape held, size uniform  \(test\/fixture\/DECISIONS\.md:\d+\)\nOut-edges \(what R4 does to earlier rulings\):\n  R4 supersedes R3  — "supersedes R3"\nIn-edges \(what later rulings do to R4\):\n  none\n/.test(g4.out), g4.out);
  const g2 = docket(['governs', 'R3'], { cwd: FIX });
  ok('governs excludes ledger documents from code cites', !/history\//.test(g2.out) && /test\/fixture\/app\.js:95/.test(g2.out), g2.out);
  const g99 = docket(['governs', 'R99'], { cwd: FIX });
  ok('governs of an unknown id names the ledger and exits 2', g99.code === 2 && /no ruling R99 in test\/fixture\/DECISIONS\.md/.test(g99.err), g99.err);
  const gR2 = docket(['governs', 'R2'], { cwd: FIX });
  ok('governs renders a populated Addenda section: the date and the text as written, under the heading, above the code cites', gR2.code === 0 && /\nAddenda:\n  2026-09-11: the render pass now rounds to the device pixel for drawing only; reading still writes nothing, and the rule stands as written\.\nCode cites:\n/.test(gR2.out), gR2.out);
  const qR2 = docket(['query', 'positions'], { cwd: FIX });
  ok('query renders an addendum in its own form — "> Addendum <date>: <text>" indented under the ruling — not the form governs uses', qR2.code === 0 && /^R2  Positions are never mutated on read  \(DECISIONS\.md:\d+\)\n  > Addendum 2026-09-11: the render pass now rounds to the device pixel for drawing only; reading still writes nothing, and the rule stands as written\.$/m.test(qR2.out), qR2.out);
  const q0 = docket(['query', 'zzz-nothing-matches'], { cwd: FIX });
  ok('query with no match says so and exits 0', q0.code === 0 && /^no ruling matches "zzz-nothing-matches" in DECISIONS\.md/.test(q0.out), q0.out);
  const p = docket(['principles'], { cwd: FIX });
  ok('principles reads the list from the first section of PRD.md beside the ledger: three bullets, each whole and in order', p.code === 0 && p.out.split('\n').filter(Boolean).join('\n') === [
    '- **Capture precedes structure.** A thought is framed the instant it is typed; where it goes and what it is next to are asserted afterwards.',
    '- **Positions are permanent.** Nothing the person placed moves unless the person moves it.',
    '- **Zero cognitive tax.** If the page has to be thought about, it failed.',
  ].join('\n'), p.out);
  const pr = docket(['principles']);
  ok('principles falls back to the ledger preamble when no PRD.md sits beside it', pr.code === 0 && pr.out.split('\n').filter(Boolean).length === 5 && /One home per value/.test(pr.out), pr.out);
  const sRepo = tempRepo();                                            // hermetic: the checkout's own state directory is not read
  const s = docket(['status'], { cwd: path.join(sRepo, 'test', 'fixture') });
  ok('status: the docket names the ledger, the last three rulings, uncited rulings, pending addenda, the last verdict and the witness', /^Docket — test\/fixture\/DECISIONS\.md \(9 rulings; prefixes A, R\)\nLast rulings:\n  R8  /.test(s.out) && /Cited nowhere: none/.test(s.out) && /Addenda pending: \n  R2 \(2026-09-11\)/.test(s.out) && /Last verdict: none/.test(s.out) && /Witness: FAIL \(1\)/.test(s.out), s.out);
  const sj = docket(['status', '--json'], { cwd: path.join(sRepo, 'test', 'fixture') });
  const sjo = sj.code === 0 ? JSON.parse(sj.out) : {};
  ok('status --json carries the whole docket: ledger, rulings, prefixes, last, uncited, pendingAddenda, lastVerdict, surfaced, witness', Object.keys(sjo).join(',') === 'ledger,rulings,prefixes,last,uncited,pendingAddenda,lastVerdict,surfaced,witness' && sjo.rulings === 9 && sjo.uncited.length === 0 && sjo.pendingAddenda.length === 1 && sjo.pendingAddenda[0].id === 'R2' && sjo.lastVerdict === null && sjo.witness.ok === false && sjo.witness.failures.length === 1, sj.out);
  const pfull = docket(['principles'], { cwd: FIX });
  ok('principles prints each bullet whole, and the count is the list', pfull.out.split('\n').filter(Boolean).length === 3 && pfull.out.split('\n')[0] === '- **Capture precedes structure.** A thought is framed the instant it is typed; where it goes and what it is next to are asserted afterwards.', pfull.out);
  const cj = docket(['check', '--json'], { cwd: FIX });
  const cjo = cj.code === 0 ? JSON.parse(cj.out) : {};
  ok('check --json has the shape ok, failures, info', Object.keys(cjo).join(',') === 'ok,failures,info' && cjo.ok === true && cjo.failures.length === 0 && Array.isArray(cjo.info), cj.out);
  const cj1 = JSON.parse(docket(['check', '--json'], { cwd: tempRepo(d => edit(d, 'test/fixture/app.js', '// R6: the toolbar replaces', '// R9: the toolbar replaces')) }).out);
  ok('check --json: a failure carries file, line, k, message', cj1.ok === false && Object.keys(cj1.failures[0]).join(',') === 'file,line,k,message' && cj1.failures[0].file === 'test/fixture/app.js' && cj1.failures[0].line === 41 && cj1.failures[0].k === 1, JSON.stringify(cj1));
  const silent = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-s-'));
  const ss = docket(['status'], { cwd: silent });
  ok('status in an ungoverned directory is silent', ss.code === 0 && ss.out === '' && ss.err === '');
  const usage = docket(['nonsense']);
  ok('an unknown subcommand is a usage error (exit 2)', usage.code === 2);
  const root = docket(['check']);
  ok('the repository passes its own check (D6)', root.code === 0, root.out + root.err);
  const w = docket([]);
  ok('the witness mode at the root: check plus the project spec, ok', w.code === 0 && /^witness: ok/m.test(w.out), w.out);
}

// ── the grammar's edges (FORMAT.md 2, 3, 8, 13, 15): code spans, stray headings, repeats, removals, the window's bounds ──
{
  const base = docket(['near'], { input: nearInput(APP, 'makeToolbar(') }).out;
  const quoted = tempRepo(d => { fs.appendFileSync(path.join(d, 'test', 'fixture', 'app.js'), 'const doc = 1; // the id `R99` here is quoted, not cited\n'); edit(d, 'test/fixture/app.js', 'function makeToolbar(', 'function makeToolbar( /* `A1` quoted */'); });
  let r = docket(['check'], { cwd: quoted });
  ok('check 1: an id inside a code span is quoted, not cited', r.code === 0, r.out);
  const lz = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'app.js'), 'const lz = 1; // R05 has a leading zero and is not a cite; R0 neither\n'));
  r = docket(['check'], { cwd: lz });
  ok('check 1: an id with a leading zero is not a cite (FORMAT.md 2, 8)', r.code === 0 && /check: ok \(1 ledger, /.test(r.out), r.out);
  const lzLine = read(path.join(lz, 'test', 'fixture', 'app.js')).split('\n').length - 1, lzG = docket(['governs', 'R5'], { cwd: path.join(lz, 'test', 'fixture') });
  ok('…and governs R5 does not list the R05 line among its code cites', lzG.code === 0 && !new RegExp('app\\.js:' + lzLine + '  ').test(lzG.out) && /Code cites:/.test(lzG.out), lzG.out);
  const fence = tempRepo(d => fs.writeFileSync(path.join(d, 'test', 'fixture', 'NOTES.md'), 'Prose citing R6 makes this file governed.\n\n```text\nQuoted output: R99 and UIUX §9.9 and a bare §7 here are quoted, not cited.\n```\n\nAnd `R98` inline is quoted too.\n'));
  r = docket(['check'], { cwd: fence });
  ok('check: a fenced code block quotes its cites, spec cites and bare cites (FORMAT.md 8)', r.code === 0, r.out);
  const fn = docket(['near'], { cwd: fence, input: nearInput(path.join(fence, 'test', 'fixture', 'NOTES.md'), 'Prose citing') });
  ok('near: a fenced block adds nothing to the window', /^Governed here \(test\/fixture\/DECISIONS\.md, ±20 lines of NOTES\.md:1\):\n  R6  /.test(fn.out) && !/R99|Also cited/.test(fn.out), fn.out);
  const ref = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '\nA stray reference: see R99 in prose, with no verb.\n'));
  r = docket(['check'], { cwd: ref });
  ok('check 1: a reference inside the ledger to a ruling that does not exist fails (FORMAT.md 8)', r.code === 1 && /^test\/fixture\/DECISIONS\.md:\d+  check 1: cite R99 names no ruling in test\/fixture\/DECISIONS\.md$/m.test(r.out), r.out);
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
  ok('check 2: a repeated id fails (each number is its position)', r.code === 1 && /check 2: numbering: R6 is entry 7 of the R entries; expected R7/.test(r.out), r.out);
  const rm = tempRepo();
  { const p = path.join(rm, 'test', 'fixture', 'DECISIONS.md'); const t = read(p); fs.writeFileSync(p, t.slice(0, t.indexOf('### R3.')) + t.slice(t.indexOf('### R4.'))); }
  r = docket(['check'], { cwd: rm });
  ok('check 7: an entry removed after commit fails (the committed entries are enumerated)', r.code === 1 && /^test\/fixture\/DECISIONS\.md:\d+  check 7: R3 was removed \(append only\)$/m.test(r.out), r.out);
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
  ok('near: a union of nine rulings lists eight — most cited, then nearest to the first match, then the earlier line — and says +1 more', uids.join(',') === 'R1,R2,R6,R5,R4,R3,R7,R8' && /\n  R8  The frame that was never typed into is discarded on blur, and the…  · issue #16\n/.test(uo.out) && uo.out.startsWith('Governed here (test/fixture/DECISIONS.md, ±20 lines of dense.js:30, 100):\n') && uo.out.includes('\n  R8  ' ) && /\n  \+1 more\n/.test(uo.out), uo.out);
  ok('near: a three-ruling window carries no +more line', !/\+\d+ more\n/.test(base), base);
  // the cap itself: eight distinct rulings are all listed and nothing is elided; nine list eight and say +1 more (FORMAT.md 15)
  const capIds = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'];
  const capFile = (dir, name, ids) => fs.writeFileSync(path.join(dir, 'test', 'fixture', name), ids.map((id, i) => 'const c' + i + ' = ' + i + '; // ' + id).join('\n') + '\n');
  const cap8 = tempRepo(d => { capFile(d, 'eight.js', capIds); capFile(d, 'nine.js', capIds.concat('A1')); });
  const wholeOf = name => docket(['near'], { cwd: cap8, input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: path.join(cap8, 'test', 'fixture', name), content: 'x' } }) });
  const idsOf = r => r.out.split('\n').filter(l => /^  [AR]\d+  /.test(l)).map(l => l.trim().split(/\s+/)[0]);
  const c8 = wholeOf('eight.js'), c8ids = idsOf(c8);
  ok('near: exactly eight distinct rulings — the cap itself — are all listed, in the file\'s own order, and no +more line appears', c8.code === 0 && c8ids.join(',') === capIds.join(',') && !/\+\d+ more/.test(c8.out), c8.out);
  const c9 = wholeOf('nine.js'), c9ids = idsOf(c9);
  ok('near: one above the cap lists the eight cited earliest, in that order, and says +1 more — the ninth, cited last, is the one dropped', c9.code === 0 && c9ids.join(',') === capIds.join(',') && /\n  \+1 more\n/.test(c9.out) && !/\bA1\b/.test(c9.out), c9.out);
  const c7 = tempRepo(d => capFile(d, 'seven.js', capIds.slice(0, 7)));
  const c7o = docket(['near'], { cwd: c7, input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: path.join(c7, 'test', 'fixture', 'seven.js'), content: 'x' } }) });
  ok('near: one below the cap lists seven and says nothing more', c7o.code === 0 && c7o.out.split('\n').filter(l => /^  [AR]\d+  /.test(l)).length === 7 && !/\+\d+ more/.test(c7o.out), c7o.out);
  const to = docket(['near'], { cwd: un, input: nearInput(path.join(un, 'test', 'fixture', 'ticks.js'), 'tick()', { replace_all: true }) });
  ok('near: nine matches name the first eight lines and +1 more', to.out.startsWith('Governed here (test/fixture/DECISIONS.md, ±20 lines of ticks.js:1, 2, 3, 4, 5, 6, 7, 8 +1 more):\n  R2  '), to.out);
  const missing = docket(['near'], { input: nearInput(path.join(FIX, 'no-such-file.js'), 'x') });
  ok('near: an edit of a file that does not exist → silent', missing.code === 0 && missing.out === '' && missing.err === '');
}

// ── boundaries, line endings, the ledger's own edits, --json, discovery, shapes (Phase 1 fix; FORMAT.md 1, 8, 15) ──
{
  // word boundaries are letters, digits and underscore in any script: an accented letter does not end a word
  const uni = tempRepo(d => { fs.appendFileSync(path.join(d, 'test', 'fixture', 'app.js'), 'const styléR99 = 1; // one word, not a cite\nconst saveRéR6 = 2; // not a cite either\nconst arrow = 3; //→R7 is a cite: an arrow ends a word\n'); });
  let r = docket(['check'], { cwd: uni });
  ok('check 1: styléR99 is one word, not a cite of R99', r.code === 0, r.out);
  const ug = docket(['governs', 'R6'], { cwd: path.join(uni, 'test', 'fixture') });
  ok('governs: saveRéR6 is not a code cite of R6', !/saveRéR6/.test(ug.out), ug.out);
  const ug7 = docket(['governs', 'R7'], { cwd: path.join(uni, 'test', 'fixture') });
  ok('governs: →R7 is a code cite (an arrow is not a word character)', /app\.js:\d+  const arrow = 3; \/\/→R7/.test(ug7.out), ug7.out);
  const uedge = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '\n### R9. Accents (issue #40)\nPrinciple: Zero cognitive tax.\nThe word Résupersedes R3 makes no edge; a spec cite in prose UIUX ' + SEC + '2 resolves; éUIUX ' + SEC + '2 does not name the spec and its ' + SEC + ' is bare. Reason: r.\n'));
  const uj = JSON.parse(docket(['index'], { cwd: path.join(uedge, 'test', 'fixture') }).out);
  const u9 = uj.rulings.find(x => x.id === 'R9');
  ok('an edge verb glued to an accented letter is not an edge', u9 && u9.edges.length === 0, u9 && JSON.stringify(u9.edges));
  r = docket(['check'], { cwd: uedge });
  ok('a spec cite glued to a letter is not a spec cite, and its ' + SEC + ' is bare: the ratchet fails it at the ledger\'s allowance of zero, and check 3 has nothing to say', r.code === 1 && /check 4: bare-§ cites: 1 > allowance 0 for DECISIONS\.md/.test(r.out) && !/check 3/.test(r.out), r.out);
  // a non-ASCII heading keeps its code points through the title rule and prints in the window
  const acc = tempRepo(d => { fs.appendFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '\n### R9. Ré-tune the déjà-vu fold (issue #35)\nPrinciple: Zero cognitive tax.\nReason: r.\n'); fs.writeFileSync(path.join(d, 'test', 'fixture', 'acc.js'), 'const déjà = 1; // R9 — déjà\n'); });
  const aj = JSON.parse(docket(['index'], { cwd: path.join(acc, 'test', 'fixture') }).out).rulings.find(x => x.id === 'R9');
  ok('a non-ASCII heading parses whole', aj && aj.title === 'Ré-tune the déjà-vu fold' && aj.issue === 35, aj && aj.title);
  const an = docket(['near'], { cwd: acc, input: nearInput(path.join(acc, 'test', 'fixture', 'acc.js'), 'déjà = 1') });
  ok('near: the non-ASCII title prints, and the cite after a non-ASCII identifier resolves', an.out === 'Governed here (test/fixture/DECISIONS.md, ±20 lines of acc.js:1):\n  R9  Ré-tune the déjà-vu fold  · issue #35\nName the ruling you rely on before you edit.\n', an.out);
  // a CRLF ledger stays CRLF through every write
  const crlfW = tempRepo(d => { const p = path.join(d, 'test', 'fixture', 'DECISIONS.md'); fs.writeFileSync(p, read(p).replace(/\n/g, '\r\n')); });
  const cw = path.join(crlfW, 'test', 'fixture');
  const allCrlf = t => !/(^|[^\r])\n/.test(t) && /\r\n/.test(t);
  r = docket(['append', '--title', 'Written with the file\'s own line ending', '--issue', '41', '--principle', 'Zero cognitive tax', '--body', 'Text. Reason: r.'], { cwd: cw });
  ok('append: a new entry keeps a CRLF ledger CRLF and check passes', r.code === 0 && /check: ok/.test(r.out) && allCrlf(read(path.join(cw, 'DECISIONS.md'))), r.out + r.err);
  r = docket(['append', '--addendum', 'R5', '--text', 'noted.'], { cwd: cw, env: { DOCKET_TODAY: '2026-09-13' } });
  ok('append --addendum keeps CRLF', r.code === 0 && /check: ok/.test(r.out) && allCrlf(read(path.join(cw, 'DECISIONS.md'))), r.out + r.err);
  r = docket(['append', '--baseline'], { cwd: cw });
  ok('append --baseline keeps CRLF', r.code === 0 && /check: ok/.test(r.out) && allCrlf(read(path.join(cw, 'DECISIONS.md'))), r.out + r.err);
  const cjx = JSON.parse(docket(['index'], { cwd: cw }).out);
  ok('…and the CRLF ledger parses to ten rulings with the addendum under R5', cjx.rulings.length === 10 && cjx.rulings.find(x => x.id === 'R5').addenda.length === 1 && cjx.baseline['app.js'] === 3, JSON.stringify(cjx.baseline));
  // the ledger is amended through append: near is silent for an edit of a ledger document
  const ln = docket(['near'], { input: nearInput(path.join(FIX, 'DECISIONS.md'), '### R6.') });
  ok('near: an edit inside the ledger itself → silent (FORMAT.md 8)', ln.code === 0 && ln.out === '' && ln.err === '', ln.out);
  const lh = docket(['near'], { input: nearInput(path.join(FIX, 'history', 'DECISIONS.v1.md'), '### R1.') });
  ok('near: an edit of a frozen ledger copy → silent', lh.code === 0 && lh.out === '' && lh.err === '', lh.out);
  // --json on near: the window as an object; silence stays silence
  const nj = docket(['near', '--json'], { input: nearInput(APP, 'makeToolbar(') });
  const njo = nj.code === 0 && nj.out ? JSON.parse(nj.out) : null;
  ok('near --json: the one-match window as an object', njo && njo.ledger === 'test/fixture/DECISIONS.md' && njo.file === 'app.js' && njo.mode === 'one' && njo.anchors.join(',') === '41' && njo.rulings[0].id === 'R6' && njo.rulings[0].title === 'The toolbar replaces the long-press menu' && njo.rulings[0].issue === 12 && njo.more === 0 && Array.isArray(njo.edges) && njo.edges.some(e => /^R7 partially reverses R6/.test(e)) && njo.notice === null, nj.out);
  ok('near --json: the text and the object list the same rulings in the same order', njo && njo.rulings.map(x => x.id).join(',') === expected('near-41.txt').split('\n').filter(l => /^  [AR]\d+  /.test(l)).map(l => l.trim().split(/\s+/)[0]).join(','), nj.out);
  const njw = JSON.parse(docket(['near', '--json'], { input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: APP, content: 'x' } }) }).out);
  ok('near --json: a whole-file write says so and carries the +more count', njw.mode === 'whole' && njw.region === 'whole file app.js' && njw.rulings.length === 8 && njw.more === 1, JSON.stringify(njw.region) + ' ' + njw.more);
  const nje = JSON.parse(docket(['near', '--json'], { input: nearInput(APP, '  return JSON.stringify(out);') }).out);
  ok('near --json: the empty-window notice is the notice field with no rulings', nje.rulings.length === 0 && /^no ruling is cited in this window/.test(nje.notice), JSON.stringify(nje));
  const njs = docket(['near', '--json'], { input: nearInput(APP, 'no such text anywhere') });
  ok('near --json: silence is silence', njs.code === 0 && njs.out === '' && njs.err === '');
  // --json on query, governs, append, principles
  const qj = JSON.parse(docket(['query', 'fold', '--json'], { cwd: FIX }).out);
  ok('query --json: the matching rulings with their edges in and out', Array.isArray(qj) && qj.map(x => x.id).join(',') === 'R3,R4' && qj[0].inEdges.length === 1 && qj[0].inEdges[0].from === 'R4' && qj[1].edges[0].to === 'R3', JSON.stringify(qj.map(x => x.id)));
  const gj = JSON.parse(docket(['governs', 'R6', '--json'], { cwd: FIX }).out);
  ok('governs --json: ruling, outEdges, inEdges, addenda, cites', Object.keys(gj).join(',') === 'ruling,outEdges,inEdges,addenda,cites' && gj.ruling.id === 'R6' && gj.inEdges[0].from === 'R7' && gj.cites.some(c => c.file === 'test/fixture/app.js' && c.line === 41), JSON.stringify(Object.keys(gj)));
  const pj = JSON.parse(docket(['principles', '--json'], { cwd: FIX }).out);
  ok('principles --json: the source (root-relative) and the list with names and lines', pj.source === 'test/fixture/PRD.md' && pj.list.length === 3 && pj.list[0].name === 'Capture precedes structure' && pj.list[0].line === 5, JSON.stringify(pj.list.map(x => x.name)));
  const apj = tempRepo();
  const apjr = docket(['append', '--json', '--title', 'Json entry', '--issue', '42', '--principle', 'Zero cognitive tax', '--body', 'Text. Reason: r.'], { cwd: path.join(apj, 'test', 'fixture') });
  const apjo = apjr.code === 0 ? JSON.parse(apjr.out) : null;
  ok('append --json: written, ok, failures', apjo && Object.keys(apjo).join(',') === 'written,ok,failures' && /^### R9\. Json entry \(issue #42\)\n/.test(apjo.written) && apjo.ok === true && apjo.failures.length === 0, apjr.out + apjr.err);
  // an empty ledger: --prefix is required, then names the first entry; status says "no prefix"
  const emp = tempRepo(d => fs.writeFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '# Empty\n'));
  const ecwd = path.join(emp, 'test', 'fixture');
  const es = docket(['status'], { cwd: ecwd });
  ok('status: an empty ledger has no prefix', /^Docket — test\/fixture\/DECISIONS\.md \(0 rulings; no prefix\)\n/.test(es.out), es.out);
  r = docket(['append', '--title', 'First', '--issue', '1', '--principle', 'Zero cognitive tax', '--body', 'Text. Reason: r.'], { cwd: ecwd });
  ok('append: an empty ledger refuses an entry without --prefix (exit 2)', r.code === 2 && /--prefix is required for an empty ledger/.test(r.err), r.err);
  r = docket(['append', '--prefix', 'Q', '--title', 'First', '--issue', '1', '--principle', 'Zero cognitive tax', '--body', 'Text. Reason: r.'], { cwd: ecwd });
  ok('append --prefix Q on an empty ledger writes Q1', r.code === 0 && /^### Q1\. First \(issue #1\)\n/m.test(r.out) && /check: ok/.test(r.out), r.out + r.err);
  ok('…and the next entry follows the last prefix without --prefix', /^### Q2\. Second/m.test(docket(['append', '--title', 'Second', '--issue', '2', '--principle', 'Zero cognitive tax', '--body', 'Text. Reason: r.'], { cwd: ecwd }).out));
  // an empty baseline comment is an allowance of zero
  const zb = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', '<!-- docket: bare-cites app.js=3 -->', '<!-- docket: bare-cites -->'));
  r = docket(['check'], { cwd: zb });
  ok('check 4: a baseline comment with no counts allows nothing', r.code === 1 && /check 4: bare-§ cites: 3 > allowance 0 for app\.js/.test(r.out), r.out);
  // check 5: an edge to a ruling that does not exist; check 3: a spec cite with no document beside the ledger
  const e5 = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '\n### R9. Points nowhere (issue #43; refines R40)\nPrinciple: Zero cognitive tax.\nReason: r.\n'));
  r = docket(['check'], { cwd: e5 });
  ok('check 5: an edge to a ruling that does not exist fails, and check 1 fails on the same reference', r.code === 1 && /^test\/fixture\/DECISIONS\.md:\d+  check 5: edge R9 refines R40: R40 does not exist$/m.test(r.out) && /^test\/fixture\/DECISIONS\.md:\d+  check 1: cite R40 names no ruling in test\/fixture\/DECISIONS\.md$/m.test(r.out), r.out);
  const nd = tempRepo(d => { fs.mkdirSync(path.join(d, 'test', 'fixture', 'sub')); fs.writeFileSync(path.join(d, 'test', 'fixture', 'sub', 'DECISIONS.md'), '# Sub\n\n### S1. One (issue #1)\nReason: r.\n'); fs.writeFileSync(path.join(d, 'test', 'fixture', 'sub', 'a.js'), 'const a = 1; // S1, per UIUX ' + SEC + '2\n'); });
  r = docket(['check'], { cwd: nd });
  ok('check 3: a spec cite under a ledger with no spec document beside it fails, naming that ledger', r.code === 1 && new RegExp('^test/fixture/sub/a\\.js:1  check 3: UIUX ' + SEC + '2 cited but no UIUX\\.md sits beside test/fixture/sub/DECISIONS\\.md', 'm').test(r.out), r.out);
  ok('…and the file resolves to the nearer ledger, not the fixture\'s', !/cite S1 names no ruling/.test(r.out), r.out);
  // spec-check's other branches, and the hex grammar
  const sa = tempRepo(d => edit(d, 'test/fixture/UIUX.md', '| `--line` | `#7a8fa6` | frames and rules |', '| `--line` | `#7a8fa6` | frames and rules |\n| `--gap` | `#0000ff` | nowhere |'));
  r = docket(['spec-check'], { cwd: path.join(sa, 'test', 'fixture') });
  ok('spec-check (a): a token the CSS never declares is named', r.code === 1 && /spec-check a: --gap is #0000ff in the spec but is declared in no CSS file/.test(r.out), r.out);
  const sb = tempRepo(d => edit(d, 'test/fixture/UIUX.md', '| `--ink` on `--paper` | 15.04:1 |', '| `--ink` on `--paper` | 15.04:1 |\n| `--ink` on `--ghost` | 4.50:1 |'));
  r = docket(['spec-check'], { cwd: path.join(sb, 'test', 'fixture') });
  ok('spec-check (b): a contrast row over an unknown token says which hex it lacks', r.code === 1 && /spec-check b: contrast row: no hex known for --ghost/.test(r.out), r.out);
  const h5 = tempRepo(d => edit(d, 'test/fixture/UIUX.md', '`#7a8fa6`', '`#7a8fa`'));
  r = docket(['spec-check'], { cwd: path.join(h5, 'test', 'fixture') });
  ok('spec-check (a): a five-digit hex in a token-shaped row is named as no CSS hex, not skipped (3, 4, 6 or 8 digits)', r.code === 1 && /^test\/fixture\/UIUX\.md:\d+  spec-check a: --line is #7a8fa in the spec, which is not a CSS hex colour \(3, 4, 6 or 8 digits\)$/m.test(r.out) && !/#7a8fa6/.test(r.out), r.out);
  const h5both = tempRepo(d => { edit(d, 'test/fixture/UIUX.md', '`#7a8fa6`', '`#7a8fa`'); edit(d, 'test/fixture/styles.css', '#7a8fa7', '#7a8fa'); });
  r = docket(['spec-check'], { cwd: path.join(h5both, 'test', 'fixture') });
  ok('spec-check (a): the same five-digit typo on both sides is still a failure — a malformed value is never a match', r.code === 1 && /spec-check a: --line is #7a8fa in the spec, which is not a CSS hex colour/.test(r.out), r.out);
  // discovery under CLAUDE_PROJECT_DIR (FORMAT.md 1): the same ledger, and the header's path
  const pdRepo = tempRepo();
  const pdFile = path.join(pdRepo, 'test', 'fixture', 'app.js');
  const pdPlain = docket(['near'], { cwd: pdRepo, input: nearInput(pdFile, 'makeToolbar(') });
  const pdRoot = docket(['near'], { cwd: pdRepo, input: nearInput(pdFile, 'makeToolbar('), env: { CLAUDE_PROJECT_DIR: pdRepo } });
  ok('near: CLAUDE_PROJECT_DIR at the git root changes nothing', pdRoot.out === pdPlain.out && pdPlain.out === expected('near-41.txt'), pdRoot.out);
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-pd-'));
  const pdFar = docket(['near'], { cwd: pdRepo, input: nearInput(pdFile, 'makeToolbar('), env: { CLAUDE_PROJECT_DIR: elsewhere } });
  ok('near: a CLAUDE_PROJECT_DIR that is not an ancestor still finds the ledger, and the header names it from the git root', pdFar.out === expected('near-41.txt'), pdFar.out);
  const pdCheck = docket(['check'], { cwd: path.join(pdRepo, 'test', 'fixture'), env: { CLAUDE_PROJECT_DIR: pdRepo } });
  ok('check: CLAUDE_PROJECT_DIR is the enumeration root', pdCheck.code === 0 && /check: ok \(1 ledger, /.test(pdCheck.out), pdCheck.out);
  // every tracked file resolves to its own ledger, per file (FORMAT.md 1)
  const core = require(CORE);
  const tracked = sh('git', ['ls-files', '-z'], ROOT).stdout.split('\0').filter(Boolean);
  const wrong = tracked.filter(f => { const lp = core.findLedger(path.join(ROOT, f), ROOT); const want = f.startsWith('test/fixture/sub/') ? null : f.startsWith('test/fixture/') ? path.join(FIX, 'DECISIONS.md') : path.join(ROOT, 'docs', 'DECISIONS.md'); return lp !== want; });
  ok('every tracked file resolves to the fixture ledger under test/fixture and to docs/DECISIONS.md elsewhere', tracked.length > 10 && wrong.length === 0, wrong.join(', '));
}

// ── the grammar's less-travelled paths (FORMAT.md 1, 2, 3, 5, 8, 10): the walk, prefixes, verbs, binary, frozen copies, --issue, spec-check --json ──
{
  // the walk: two ledger-less directories between the file and its ledger; a directory holding both forms tries DECISIONS.md first
  const deep = tempRepo(d => { fs.mkdirSync(path.join(d, 'test', 'fixture', 'a', 'b'), { recursive: true }); fs.writeFileSync(path.join(d, 'test', 'fixture', 'a', 'b', 'deep.js'), 'const deep = 1; // R6\n'); });
  const dn = docket(['near'], { cwd: deep, input: nearInput(path.join(deep, 'test', 'fixture', 'a', 'b', 'deep.js'), 'deep = 1') });
  ok('discovery: a file two ledger-less directories below its ledger resolves to it, and the header names the file from the home', dn.out.startsWith('Governed here (test/fixture/DECISIONS.md, ±20 lines of a/b/deep.js:1):\n  R6  '), dn.out);
  const both = tempRepo(d => { fs.mkdirSync(path.join(d, 'test', 'fixture', 'docs')); fs.writeFileSync(path.join(d, 'test', 'fixture', 'docs', 'DECISIONS.md'), '# Other\n\n### Z1. Shadow (issue #1)\nReason: r.\n'); });
  const core = require(CORE);
  ok('discovery: where a directory holds DECISIONS.md and docs/DECISIONS.md, DECISIONS.md is tried first', core.findLedger(path.join(both, 'test', 'fixture', 'app.js'), both) === path.join(both, 'test', 'fixture', 'DECISIONS.md'));
  // an empty ledger ends the walk even with a real ledger above it
  const stop = tempRepo(d => { fs.mkdirSync(path.join(d, 'test', 'fixture', 'sub')); fs.writeFileSync(path.join(d, 'test', 'fixture', 'sub', 'DECISIONS.md'), '# Empty\n'); fs.writeFileSync(path.join(d, 'test', 'fixture', 'sub', 'a.js'), 'const a = 1; // R6 is not a cite here: the empty ledger ends the walk\n'); });
  const sn = docket(['near'], { cwd: stop, input: nearInput(path.join(stop, 'test', 'fixture', 'sub', 'a.js'), 'a = 1') });
  ok('discovery: an empty ledger ends the walk — a file under it is ungoverned though a real ledger sits above (FORMAT.md 1)', sn.code === 0 && sn.out === '' && sn.err === '', sn.out);
  let r = docket(['check'], { cwd: stop });
  ok('…and check reports the empty ledger with the info line, failing nothing', r.code === 0 && /^info  test\/fixture\/sub\/DECISIONS\.md: no entries; its subtree is ungoverned and no check runs on its 1 file$/m.test(r.out), r.out);
  // a file with a NUL byte in its first 8000 bytes is not text and is skipped
  const bin = tempRepo(d => fs.writeFileSync(path.join(d, 'test', 'fixture', 'blob.dat'), Buffer.concat([Buffer.from('R99 cited in a binary\0'), Buffer.alloc(16, 7)])));
  r = docket(['check'], { cwd: bin });
  ok('check: a file with a NUL byte is not a text file and is skipped (FORMAT.md 1)', r.code === 0 && /check: ok \(1 ledger, 11 governed-tree files\)/.test(r.out), r.out);
  // prefixes: several letters, lower case; a digit inside the prefix ends nothing
  const px = tempRepo(d => fs.writeFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), read(path.join(d, 'test', 'fixture', 'DECISIONS.md')) + '\n## X. More prefixes\n\n### ab1. Lower case, two letters (issue #50)\nReason: r.\n### R2X1. Not a heading: a digit inside the prefix\nStill body text of ab1. Reason: none.\n### Ab1. Mixed case is another prefix (issue #51)\nReason: r.\n'));
  const pj = JSON.parse(docket(['index'], { cwd: path.join(px, 'test', 'fixture') }).out);
  ok('prefixes: one or more ASCII letters in either case, each its own sequence; a digit inside the prefix is body text (FORMAT.md 2)', pj.prefixes.join(',') === 'A,R,ab,Ab' && pj.rulings.map(x => x.id).slice(-2).join(',') === 'ab1,Ab1' && pj.rulings.find(x => x.id === 'ab1').body.includes('### R2X1.'), JSON.stringify(pj.prefixes) + ' ' + pj.rulings.map(x => x.id).join(','));
  r = docket(['check'], { cwd: px });
  ok('…and check accepts them', r.code === 0, r.out);
  // every verb in the list makes an edge, in one form each
  const verbs = ['supersedes', 'overrides', 'retires', 'reverses', 'waives', 'extends', 'keeps', 're-tunes', 'refines', 'replaces', 'corrects', 'revises'];
  const vb = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '\n### R9. Every verb (issue #52)\nPrinciple: Zero cognitive tax.\n' + verbs.map((v, i) => 'This ' + v + ' R' + ((i % 8) + 1) + '.').join('\n') + '\nReason: r.\n'));
  const vj = JSON.parse(docket(['index'], { cwd: path.join(vb, 'test', 'fixture') }).out).rulings.find(x => x.id === 'R9');
  ok('edges: each of the twelve verbs makes an edge, re-tunes included (FORMAT.md 5)', vj && vj.edges.map(e => e.verb).join(',') === verbs.join(','), vj && JSON.stringify(vj.edges.map(e => e.verb)));
  ok('…and the module exports the same list', JSON.stringify(core.VERBS) === JSON.stringify(verbs));
  r = docket(['check'], { cwd: vb });
  ok('…and check 5 accepts twelve edges to earlier rulings', r.code === 0, r.out);
  // check 1 reaches a frozen ledger copy
  const fz = tempRepo(d => edit(d, 'test/fixture/history/DECISIONS.v2.md', 'waives R1', 'waives R77'));
  r = docket(['check'], { cwd: fz });
  ok('check 1: a bad cite inside a frozen ledger copy fails there (FORMAT.md 8)', r.code === 1 && /^test\/fixture\/history\/DECISIONS\.v2\.md:\d+  check 1: cite R77 names no ruling/m.test(r.out), r.out);
  // a heading that is only its parenthetical: an empty title, and the meta still read
  const tl = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '\n### R9. (issue #40; refines R4)\nPrinciple: Zero cognitive tax.\nReason: r.\n'));
  const tlj = JSON.parse(docket(['index'], { cwd: path.join(tl, 'test', 'fixture') }).out).rulings.find(x => x.id === 'R9');
  ok('a heading that is only its parenthetical has an empty title and keeps its issue and edge (FORMAT.md 3, 4)', tlj && tlj.title === '' && tlj.issue === 40 && tlj.edges.length === 1 && tlj.edges[0].to === 'R4' && tlj.grounding === 'issue #40', JSON.stringify(tlj && [tlj.title, tlj.issue, tlj.edges]));
  r = docket(['check'], { cwd: tl });
  ok('…and check reads the edge and the meta: check 5 accepts the edge, and the one thing check 6 fails is the missing title (FORMAT.md 11)', r.code === 1 && !/check 5/.test(r.out) && r.out.split('\n').filter(l => /check 6: R9/.test(l)).length === 1 && /^test\/fixture\/DECISIONS\.md:\d+  check 6: R9: title is empty — a bound entry is named in words \(FORMAT\.md 3, 11\)$/m.test(r.out), r.out);
  const gtl = docket(['governs', 'R4'], { cwd: path.join(tl, 'test', 'fixture') });
  ok('…and governs R4 shows the in-edge from it', /R9 refines R4/.test(gtl.out), gtl.out);
  // spec-check (b): a contrast row that names one or three tokens is a failure and a counted row
  const c3 = tempRepo(d => edit(d, 'test/fixture/UIUX.md', '| `--ink` on `--paper` | 15.04:1 |', '| `--ink` on `--paper` | 15.04:1 |\n| `--ink` on `--paper` on `--line` | 2.00:1 |'));
  r = docket(['spec-check'], { cwd: path.join(c3, 'test', 'fixture') });
  ok('spec-check (b): a contrast row naming three tokens fails and is counted', r.code === 1 && /spec-check b: contrast row names 3 tokens; a contrast row names exactly two/.test(r.out) && /UIUX\.md:14  spec-check b/.test(r.out), r.out);
  const c3j = JSON.parse(docket(['spec-check', '--json'], { cwd: path.join(c3, 'test', 'fixture') }).out);
  ok('…and the row count includes it', c3j.rows === 5, JSON.stringify(c3j.rows));
  // append refuses an entry that names a ruling that does not exist, before writing; the entry's own id is allowed
  const ab = tempRepo();
  const abc = path.join(ab, 'test', 'fixture');
  r = docket(['append', '--title', 'Names a phantom', '--issue', '60', '--principle', 'Zero cognitive tax', '--body', 'This follows R99. Reason: r.'], { cwd: abc });
  ok('append: a body naming a ruling that does not exist is refused before the write (exit 2)', r.code === 2 && /the entry names R99, which is not in test\/fixture\/DECISIONS\.md/.test(r.err) && JSON.parse(docket(['index'], { cwd: abc }).out).rulings.length === 9, r.err + r.out);
  r = docket(['append', '--title', 'Names itself', '--issue', '61', '--principle', 'Zero cognitive tax', '--body', 'R9 holds where R4 holds. Reason: r.'], { cwd: abc });
  ok('append: the entry may name its own id and existing rulings', r.code === 0 && /^### R9\. Names itself/m.test(r.out) && /check: ok/.test(r.out), r.err + r.out);
  r = docket(['append', '--issue', '62', '--principle', 'Zero cognitive tax', '--body', 'Reason: r.'], { cwd: abc });
  ok('append without --title is a usage error', r.code === 2 && /--title is required/.test(r.err), r.err);
  r = docket(['append', '--title', 'No body', '--issue', '62', '--principle', 'Zero cognitive tax'], { cwd: abc });
  ok('append without --body is a usage error', r.code === 2 && /--body is required/.test(r.err), r.err);
  // Reason: and Principle: quoted in code are not stated (FORMAT.md 5, 11)
  const qr = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', 'Reason: a blank frame costs a read', 'An example reads `Reason: I liked it`; the frame costs a read'));
  r = docket(['check'], { cwd: qr });
  ok('check 6: a Reason: inside a code span is quoted, not stated — the entry has no Reason:', r.code === 1 && /check 6: R8: body has no "Reason:"/.test(r.out), r.out);
  const fr = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', 'Reason: a blank frame costs a read', 'The frame costs a read.\n```\nReason: quoted in a fence\n```\nAnd the reason is stated nowhere else'));
  r = docket(['check'], { cwd: fr });
  ok('check 6: a Reason: inside a fenced block is quoted, not stated', r.code === 1 && /check 6: R8: body has no "Reason:"/.test(r.out), r.out);
  const fp = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', 'Principle: Capture precedes structure.\n', '```\nPrinciple: Capture precedes structure.\n```\n'));
  r = docket(['check'], { cwd: fp });
  ok('check 6: a Principle: line inside a fenced block is not the principle line', r.code === 1 && /check 6: R8: no "Principle:" line/.test(r.out), r.out);
  r = docket(['append', '--title', 'Quoted reason', '--issue', '63', '--principle', 'Zero cognitive tax', '--body', 'Text with `Reason: quoted` only.'], { cwd: abc });
  ok('append: a Reason: only inside a code span is refused', r.code === 2 && /must state the reason/.test(r.err), r.err);
  // a reader that closes stdout early: no stack trace, exit 0 (D1)
  const many = tempRepo(d => fs.writeFileSync(path.join(d, 'test', 'fixture', 'noisy.js'), Array.from({ length: 3000 }, (_, i) => `// R${90 + i} cited nowhere`).join('\n') + '\n')); // above the pipe's buffer: the reader's exit meets a blocked write
  const ep = cp.spawnSync('bash', ['-c', 'node "$1" check | head -1; echo "status=${PIPESTATUS[0]}"', 'x', CORE], { cwd: many, encoding: 'utf8' });
  ok('check with its reader gone after one line ends quietly: no stderr, exit 0', ep.status === 0 && ep.stderr === '' && /status=0$/m.test(ep.stdout) && /check 1: cite R90/.test(ep.stdout), ep.stdout + ep.stderr);
  // a baseline pair that is not <file>=<count> is a check 4 failure at the comment's line, and gives no allowance (FORMAT.md 9)
  const nanb = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', '<!-- docket: bare-cites app.js=3 -->', '<!-- docket: bare-cites app.js=abc -->'));
  r = docket(['check'], { cwd: nanb });
  ok('check 4: a baseline pair whose value is not a count fails at the comment, quoted, and the file it named has allowance 0', r.code === 1 && /^test\/fixture\/DECISIONS\.md:\d+  check 4: bare-cites baseline: "app\.js=abc" is not <file>=<count> \(FORMAT\.md 9\)$/m.test(r.out) && /check 4: bare-§ cites: 3 > allowance 0 for app\.js/.test(r.out) && JSON.parse(docket(['index'], { cwd: path.join(nanb, 'test', 'fixture') }).out).baseline['app.js'] === undefined, r.out);
  const noeq = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', '<!-- docket: bare-cites app.js=3 -->', '<!-- docket: bare-cites app.js=3 styles.css -->'));
  r = docket(['check'], { cwd: noeq });
  ok('check 4: a bare word in the baseline is a malformed pair, and the well-formed pair beside it still counts', r.code === 1 && /check 4: bare-cites baseline: "styles\.css" is not <file>=<count>/.test(r.out) && !/allowance 0 for app\.js/.test(r.out), r.out);
  // check 2's message when a prefix does not open at 1
  const op = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', '### A1. Long-press menu order', '### A2. Long-press menu order'));
  r = docket(['check'], { cwd: op });
  ok('check 2: a prefix whose first entry is not 1 is named by its position', r.code === 1 && /check 2: numbering: A2 is entry 1 of the A entries; expected A1/.test(r.out), r.out);
  // a swapped pair is exactly two lines: the expectation is the position, so the entries after the swap are untouched
  const sw = tempRepo(d => { const p = path.join(d, 'test', 'fixture', 'DECISIONS.md'); const t = read(p); const a = t.indexOf('### R3.'), b = t.indexOf('### R4.'), c = t.indexOf('### R5.'); fs.writeFileSync(p, t.slice(0, a) + t.slice(b, c) + t.slice(a, b) + t.slice(c)); });
  r = docket(['check'], { cwd: sw });
  const twoLines = r.out.split('\n').filter(l => /check 2:/.test(l));
  ok('check 2: two entries swapped fail as exactly two lines, and the entries after them do not (FORMAT.md 12)', r.code === 1 && twoLines.length === 2 && /R4 is entry 3 of the R entries; expected R3/.test(twoLines[0]) && /R3 is entry 4 of the R entries; expected R4/.test(twoLines[1]) && !/R5 is entry/.test(r.out), r.out);
  // a jump followed by its successor: both are off their position (previous+1 would pass the second)
  const jump = tempRepo(d => fs.writeFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '# Q\n\n### Q1. One\nReason: r.\n### Q2. Two\nReason: r.\n### Q3. Three\nReason: r.\n### Q10. Ten\nReason: r.\n### Q11. Eleven\nReason: r.\n'));
  r = docket(['check'], { cwd: jump });
  ok('check 2: Q1, Q2, Q3, Q10, Q11 fails at Q10 and at Q11 — each number is its position, not the previous plus one', r.code === 1 && /Q10 is entry 4 of the Q entries; expected Q4/.test(r.out) && /Q11 is entry 5 of the Q entries; expected Q5/.test(r.out), r.out);
  // --issue as a phrase
  const ph = tempRepo();
  r = docket(['append', '--title', 'Named by a phrase', '--issue', 'the fold question', '--principle', 'Zero cognitive tax', '--body', 'Text. Reason: r.'], { cwd: path.join(ph, 'test', 'fixture') });
  ok('append --issue takes a phrase naming the context, written as the grounding (FORMAT.md 4)', r.code === 0 && /^### R9\. Named by a phrase \(the fold question\)\n/m.test(r.out) && /check: ok/.test(r.out), r.out + r.err);
  const phj = JSON.parse(docket(['index'], { cwd: path.join(ph, 'test', 'fixture') }).out).rulings.find(x => x.id === 'R9');
  ok('…and it parses as the grounding with no issue number', phj && phj.grounding === 'the fold question' && phj.issue === null, JSON.stringify(phj && [phj.grounding, phj.issue]));
  // spec-check --json
  const scj = docket(['spec-check', '--json'], { cwd: FIX });
  const scjo = scj.out ? JSON.parse(scj.out) : {};
  ok('spec-check --json has the shape ok, rows, failures, and the same finding as the text', scj.code === 1 && Object.keys(scjo).join(',') === 'ok,rows,info,failures' && scjo.ok === false && scjo.rows === 4 && scjo.failures.length === 1 && scjo.failures[0].k === 'a' && scjo.failures[0].line === 9, scj.out);
  // the title rule counts code points: astral-plane characters are one each, and the cut never splits a surrogate pair
  const star = String.fromCodePoint(0x1f700), star2 = String.fromCodePoint(0x1f701);
  const as = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '\n### R9. ' + 'a'.repeat(70) + star + star2 + 'zz (issue #53)\nPrinciple: Zero cognitive tax.\nReason: r.\n### R10. ' + 'b'.repeat(70) + star + ' (issue #54)\nPrinciple: Zero cognitive tax.\nReason: r.\n### R11. ' + 'c'.repeat(70) + star + star2 + ' (issue #55)\nPrinciple: Zero cognitive tax.\nReason: r.\n'));
  const asj = JSON.parse(docket(['index'], { cwd: path.join(as, 'test', 'fixture') }).out);
  const t9 = asj.rulings.find(x => x.id === 'R9').title, t10 = asj.rulings.find(x => x.id === 'R10').title, t11 = asj.rulings.find(x => x.id === 'R11').title;
  ok('title rule: 74 code points with two astral characters inside the first 72 are cut after a whole one — 72 code points, 73 code units, no split surrogate (FORMAT.md 3)', t9 === 'a'.repeat(70) + star + '…' && Array.from(t9).length === 72 && t9.length === 73, JSON.stringify(t9));
  ok('title rule: 71 code points ending in an astral character are kept whole', t10 === 'b'.repeat(70) + star && Array.from(t10).length === 71, JSON.stringify(t10));
  ok('title rule: exactly 72 code points, two of them astral, are kept whole (74 code units)', t11 === 'c'.repeat(70) + star + star2 && Array.from(t11).length === 72 && t11.length === 74, JSON.stringify(t11));
  // sections are indexed with letter, title and line (FORMAT.md 7)
  const secs = JSON.parse(docket(['index'], { cwd: FIX }).out).sections;
  ok('index: sections[] carries each `## X.` heading with its letter, title and line', secs.length === 2 && secs[0].letter === 'A' && secs[0].title === 'Resolved conflict' && secs[1].letter === 'R' && secs[1].title === 'Rulings' && secs[0].line < secs[1].line, JSON.stringify(secs));
  // a principle name matches ignoring case and a trailing period (FORMAT.md 10)
  const pn = tempRepo();
  r = docket(['append', '--title', 'Case and period', '--issue', '56', '--principle', 'positions are permanent.', '--body', 'Text. Reason: r.'], { cwd: path.join(pn, 'test', 'fixture') });
  ok('append --principle matches ignoring case and a trailing period, and writes the canonical name', r.code === 0 && /^Principle: Positions are permanent\.$/m.test(r.out) && /check: ok/.test(r.out), r.err + r.out);
  // a digit-led prefix is not an entry (FORMAT.md 2)
  const dl = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', 'Notes fold together by shape and by size', 'Notes fold together by shape and by size\n### 5R9. Not an entry: the prefix begins with a digit'));
  const dlj = JSON.parse(docket(['index'], { cwd: path.join(dl, 'test', 'fixture') }).out);
  ok('a `### ` line whose prefix begins with a digit is body text (FORMAT.md 2)', dlj.rulings.length === 9 && dlj.rulings.find(x => x.id === 'R3').body.includes('### 5R9.'), dlj.rulings.map(x => x.id).join(','));
  // silence inside the hook envelope is silence (FORMAT.md 15)
  const hz = docket(['near'], { input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: APP, old_string: 'no such text anywhere' } }) });
  const hm = docket(['near'], { input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: APP, old_string: "  el.classList.add('note');" } }) });
  ok('near: a silent case stays silent with a hook event name — no empty envelope', hz.code === 0 && hz.out === '' && hz.err === '' && hm.code === 0 && hm.out === '' && hm.err === '', hz.out + hm.out);
  // principles from the preamble: every line is a bullet of the list that follows "Principles", and the fifth is the last
  const pr5 = docket(['principles']).out.split('\n').filter(Boolean);
  ok('principles from the preamble: five bullets, each bold-led, the first and the last as written', pr5.length === 5 && pr5.every(l => /^- \*\*[^*]+\*\* /.test(l)) && /^- \*\*A rule carries its reason\.\*\*/.test(pr5[0]) && /^- \*\*Claim no more than you measured\.\*\*/.test(pr5[4]), pr5.join('\n'));
}

// ── the root, the scope, the guards, the union (FORMAT.md 1, 4, 6, 12, 13, 15) ──
{
  let r;
  // the project directory bounds only the tree it holds: a foreign value empties nothing (FORMAT.md 1)
  const fr = tempRepo(), foreign = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-foreign-'));
  const plainCheck = docket(['check'], { cwd: fr }), foreignCheck = docket(['check'], { cwd: fr, env: { CLAUDE_PROJECT_DIR: foreign } });
  ok('check: a CLAUDE_PROJECT_DIR the working directory does not lie under is not the root — the git root is, and the same ledger is checked', foreignCheck.code === plainCheck.code && foreignCheck.out === plainCheck.out && /check: ok \(1 ledger, /.test(foreignCheck.out), foreignCheck.out);
  const foreignSpec = docket(['spec-check', '--all'], { cwd: fr, env: { CLAUDE_PROJECT_DIR: foreign } });
  ok('spec-check: under a foreign CLAUDE_PROJECT_DIR the fixture is still reached', foreignSpec.code === 1 && /^test\/fixture\/UIUX\.md:\d+  spec-check a: /m.test(foreignSpec.out), foreignSpec.out);
  const foreignWitness = docket([], { cwd: path.join(fr, 'test', 'fixture'), env: { CLAUDE_PROJECT_DIR: foreign } });
  ok('the witness under a foreign CLAUDE_PROJECT_DIR still reads the tree: 1 ledger, the fixture rows', /witness: 1 failure$/m.test(foreignWitness.out) && foreignWitness.code === 1, foreignWitness.out);
  const subDir = fs.mkdtempSync(path.join(fr, 'test', 'fixture', 'pd-'));
  const underCheck = docket(['check'], { cwd: fr, env: { CLAUDE_PROJECT_DIR: subDir } });
  ok('check: a CLAUDE_PROJECT_DIR below the working directory is not an ancestor either — the git root stays the root', underCheck.out === plainCheck.out, underCheck.out);
  const fileCheck = docket(['check'], { cwd: path.join(fr, 'test', 'fixture'), env: { CLAUDE_PROJECT_DIR: path.join(fr, 'test', 'fixture', 'app.js') } });
  ok('check: a CLAUDE_PROJECT_DIR that names a plain file is no root — the git root is, the ledger is found and checked', fileCheck.code === plainCheck.code && fileCheck.out === plainCheck.out && /check: ok \(1 ledger, /.test(fileCheck.out), fileCheck.out);
  const fileNear = docket(['near'], { cwd: fr, input: nearInput(path.join(fr, 'test', 'fixture', 'app.js'), 'makeToolbar('), env: { CLAUDE_PROJECT_DIR: path.join(fr, 'test', 'fixture', 'app.js') } });
  ok('near: under a CLAUDE_PROJECT_DIR that names a plain file the header path is from the git root, as with no variable', fileNear.out === expected('near-41.txt'), fileNear.out);
  // --ledger carries the root: the check after an append covers the ledger's tree, not the working directory's (FORMAT.md 1, 11)
  const la = tempRepo(), elsewhere2 = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-elsewhere-'));
  r = docket(['append', '--ledger', path.join(la, 'test', 'fixture', 'DECISIONS.md'), '--title', 'Written from elsewhere', '--issue', '60', '--principle', 'Capture precedes structure', '--body', 'Cites nothing in prose; `R99` in code is quoted. Reason: r.'], { cwd: elsewhere2 });
  ok('append --ledger from outside the repository: the entry is written and the check that follows runs on the ledger\'s tree (its files are enumerated)', r.code === 0 && /^### R9\. Written from elsewhere \(issue #60\)$/m.test(r.out) && /^check: ok$/m.test(r.out), r.err + r.out);
  const laCheck = docket(['check'], { cwd: la });
  ok('…and the repository\'s own check agrees', laCheck.code === 0, laCheck.out);
  r = docket(['append', '--ledger', path.join(la, 'test', 'fixture', 'DECISIONS.md'), '--title', 'Names a phantom', '--issue', '61', '--principle', 'Capture precedes structure', '--body', 'This relies on R77. Reason: r.'], { cwd: elsewhere2 });
  ok('append --ledger from outside: the phantom-name refusal reads the named ledger, not the working directory', r.code === 2 && /names R77, which is not in test\/fixture\/DECISIONS\.md/.test(r.err), r.err);
  r = docket(['status', '--ledger', path.join(la, 'test', 'fixture', 'DECISIONS.md')], { cwd: elsewhere2 });
  ok('status --ledger from outside the repository reads the ledger\'s tree: its cites are found, so nothing is "cited nowhere" but the new entry', r.code === 0 && /^Docket — test\/fixture\/DECISIONS\.md \(10 rulings; prefixes A, R\)$/m.test(r.out) && /^Cited nowhere: R9 \(1 of 10\)$/m.test(r.out), r.out);
  r = docket(['spec-check', '--ledger', path.join(la, 'test', 'fixture', 'DECISIONS.md')], { cwd: elsewhere2 });
  ok('spec-check --ledger from outside the repository reaches the fixture rows', r.code === 1 && /^test\/fixture\/UIUX\.md:\d+  spec-check a: /m.test(r.out), r.out);
  r = docket(['query', 'R9', '--ledger', 'no/such/DECISIONS.md'], { cwd: la });
  ok('--ledger naming no file is a usage error that says so', r.code === 2 && /^no ledger: --ledger no\/such\/DECISIONS\.md is not a file$/m.test(r.err), r.err);
  // check and the witness take no --ledger (FORMAT.md 1)
  r = docket(['check', '--ledger', 'test/fixture/DECISIONS.md'], { cwd: la });
  ok('check --ledger is a usage error: check covers every ledger under the root', r.code === 2 && /^check: no --ledger option/.test(r.err) && r.out === '', r.err);
  r = docket(['--ledger', 'test/fixture/DECISIONS.md'], { cwd: la });
  ok('the bare witness with --ledger is a usage error', r.code === 2 && /^docket: the witness takes no --ledger/.test(r.err) && r.out === '', r.err);
  // a ledger below the working directory is named, not found (FORMAT.md 1)
  const lb = tempRepo(d => { fs.rmSync(path.join(d, 'test', 'fixture', 'expected'), { recursive: true }); });
  r = docket(['status'], { cwd: lb });
  ok('status at a root no ledger governs names the ledgers below it', r.code === 0 && r.out === 'Docket — no ledger governs . (under ' + lb + '); below it: test/fixture/DECISIONS.md — pass --ledger <path>, or run from inside\n', r.out);
  r = docket(['status', '--json'], { cwd: lb });
  ok('status --json at such a root: ledger null, below[] names them', r.code === 0 && JSON.stringify(JSON.parse(r.out)) === '{"ledger":null,"below":["test/fixture/DECISIONS.md"]}', r.out);
  r = docket(['status'], { cwd: path.join(lb, 'test') });
  ok('…from a directory between the root and the ledger, the path is relative to the working directory', r.code === 0 && / below it: fixture\/DECISIONS\.md /.test(r.out), r.out);
  r = docket(['query', 'fold'], { cwd: lb });
  ok('query at a root no ledger governs: the error names the ledgers below', r.code === 2 && /^no ledger: no DECISIONS\.md or docs\/DECISIONS\.md between .* and .*; below the working directory: test\/fixture\/DECISIONS\.md — pass --ledger <path>, or run from inside$/m.test(r.err), r.err);
  r = docket(['governs', 'R6'], { cwd: lb });
  ok('governs at such a root: the same error', r.code === 2 && /below the working directory: test\/fixture\/DECISIONS\.md/.test(r.err), r.err);
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-bare-'));
  fs.mkdirSync(path.join(bare, 'sub')); fs.writeFileSync(path.join(bare, 'sub', 'DECISIONS.md'), '# L\n\n### Q1. One (issue #1)\nReason: r.\n');
  r = docket(['status'], { cwd: bare });
  ok('status in a bare directory (no git, no project variable) stays silent: a directory the host does not name is not searched', r.code === 0 && r.out === '' && r.err === '', r.out);
  r = docket(['status'], { cwd: bare, env: { CLAUDE_PROJECT_DIR: bare } });
  ok('…and named by the host, its ledgers below are listed', r.code === 0 && / below it: sub\/DECISIONS\.md /.test(r.out), r.out);
  r = docket(['status'], { cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'docket-none-')) });
  ok('status with no ledger anywhere is silent, exit 0', r.code === 0 && r.out === '' && r.err === '');
  // append's guards (FORMAT.md 4): a meta-breaking --issue or qualifier is refused before the write; a repeated --edge is written once
  const ag = tempRepo(), agCwd = path.join(ag, 'test', 'fixture'), agLedger = path.join(agCwd, 'DECISIONS.md'), before = read(agLedger);
  r = docket(['append', '--title', 'Split meta', '--issue', 'context; supersedes R1', '--principle', 'Capture precedes structure', '--body', 'x. Reason: r.'], { cwd: agCwd });
  ok('append refuses an --issue holding ";" before writing', r.code === 2 && /^append: --issue may not contain ";", "\(" or "\)"/.test(r.err) && read(agLedger) === before, r.err);
  r = docket(['append', '--title', 'Closed meta', '--issue', 'ends early) extends R1', '--principle', 'Capture precedes structure', '--body', 'x. Reason: r.'], { cwd: agCwd });
  ok('append refuses an --issue holding ")" before writing', r.code === 2 && /^append: --issue may not contain/.test(r.err) && read(agLedger) === before, r.err);
  r = docket(['append', '--title', 'Split qualifier', '--issue', '62', '--principle', 'Capture precedes structure', '--edge', 'extends R1 (mobile; desktop)', '--body', 'x. Reason: r.'], { cwd: agCwd });
  ok('append refuses an edge qualifier holding ";" before writing', r.code === 2 && /^append: --edge "extends R1 \(mobile; desktop\)": a qualifier may not contain ";"/.test(r.err) && read(agLedger) === before, r.err);
  r = docket(['append', '--title', 'Once', '--issue', '63', '--principle', 'Capture precedes structure', '--edge', 'extends R1', '--edge', 'extends R1', '--edge', 'extends R1 (desktop)', '--body', 'x. Reason: r.'], { cwd: agCwd });
  ok('the same --edge given twice is written once; a qualifier makes a different edge', r.code === 0 && /^### R9\. Once \(issue #63; extends R1; extends R1 \(desktop\)\)$/m.test(r.out) && /check: ok/.test(r.out), r.err + r.out);
  const onceJ = JSON.parse(docket(['index'], { cwd: agCwd }).out).rulings.find(x => x.id === 'R9');
  ok('…and the deduped edge\'s clause is the heading\'s own text', onceJ.edges.length === 2 && onceJ.edges[0].clause === 'extends R1' && onceJ.edges[1].clause === 'extends R1 (desktop)' && onceJ.edges[1].qualifier === 'desktop', JSON.stringify(onceJ.edges));
  r = docket(['append', '--title', 'No principle', '--issue', '64', '--body', 'x. Reason: r.'], { cwd: agCwd });
  ok('append without --principle is refused', r.code === 2 && /^append: --principle is required/.test(r.err), r.err);
  r = docket(['append', '--title', 'Digit prefix', '--issue', '65', '--principle', 'Capture precedes structure', '--prefix', 'R9', '--body', 'x. Reason: r.'], { cwd: agCwd });
  ok('append --prefix must be letters: "R9" is refused', r.code === 2 && /^append: --prefix must be letters$/m.test(r.err), r.err);
  // check 6, every branch, through check (FORMAT.md 11): no meta; a later clause that is not an edge; no principles list; a principle not in the list
  const c6a = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '\n### R9. No meta at all\nPrinciple: Capture precedes structure.\nReason: r.\n'));
  r = docket(['check'], { cwd: c6a });
  ok('check 6: an entry after the contract line with no parenthetical meta fails at its line', r.code === 1 && /^test\/fixture\/DECISIONS\.md:\d+  check 6: R9: heading does not end with a parenthetical meta$/m.test(r.out), r.out);
  const c6b = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '\n### R9. A clause that is not an edge (issue #66; see also R1)\nPrinciple: Capture precedes structure.\nReason: r.\n'));
  r = docket(['check'], { cwd: c6b });
  ok('check 6: a clause after the grounding that is not an edge fails, quoting the clause', r.code === 1 && /^test\/fixture\/DECISIONS\.md:\d+  check 6: R9: meta clause is not an edge: "see also R1"$/m.test(r.out), r.out);
  const c6c = tempRepo(d => { fs.mkdirSync(path.join(d, 'test', 'fixture', 'nolist')); fs.writeFileSync(path.join(d, 'test', 'fixture', 'nolist', 'DECISIONS.md'), '# Bare ledger\n\n<!-- docket: contract from L1 -->\n\n### L1. Bound without a list (issue #67)\nPrinciple: Capture precedes structure.\nReason: r.\n'); });
  r = docket(['check'], { cwd: c6c });
  ok('check 6: a Principle: line with no principles list to check it against fails', r.code === 1 && /^test\/fixture\/nolist\/DECISIONS\.md:\d+  check 6: L1: names a principle but no principles list was found$/m.test(r.out), r.out);
  const c6d = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '\n### R9. Wrong list (issue #68)\nPrinciple: Move fast.\nReason: r.\n'));
  r = docket(['check'], { cwd: c6d });
  ok('check 6: a principle that is not in the list fails through check, naming the list', r.code === 1 && /^test\/fixture\/DECISIONS\.md:\d+  check 6: R9: principle "Move fast" is not in the list \(Capture precedes structure · Positions are permanent · Zero cognitive tax\)$/m.test(r.out), r.out);
  // verb forms are exact (FORMAT.md 5): "superseded" and "superseding" make no edge, so the clause is not an edge and check 6 says so
  for (const form of ['superseded R3', 'superseding R3']) {
    const vf = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '\n### R9. Verb form (issue #69; ' + form + ')\nPrinciple: Capture precedes structure.\nReason: r.\n'));
    const vj = JSON.parse(docket(['index'], { cwd: path.join(vf, 'test', 'fixture') }).out).rulings.find(x => x.id === 'R9');
    r = docket(['check'], { cwd: vf });
    ok('"' + form + '" is no edge: index reads none, check 6 names the clause', vj.edges.length === 0 && r.code === 1 && new RegExp('check 6: R9: meta clause is not an edge: "' + form + '"$', 'm').test(r.out), JSON.stringify(vj.edges) + r.out);
  }
  // a non-ASCII prefix is body text, not an entry (FORMAT.md 2: ASCII letters)
  const om = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', 'Notes fold together by shape and by size', 'Notes fold together by shape and by size\n### ' + String.fromCharCode(0x3a9) + '1. Not an entry: the prefix is not ASCII'));
  const omj = JSON.parse(docket(['index'], { cwd: path.join(om, 'test', 'fixture') }).out);
  ok('a `### ` line whose prefix is a non-ASCII letter is body text', omj.rulings.length === 9 && omj.prefixes.join(',') === 'A,R' && omj.rulings.find(x => x.id === 'R3').body.includes(String.fromCharCode(0x3a9) + '1.'), omj.prefixes.join(','));
  // a repeated id resolves to its first entry (FORMAT.md 12)
  const rep = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '\n### R9. The first bearer (issue #70)\nPrinciple: Capture precedes structure.\nReason: r.\n### R9. The second bearer (issue #71)\nPrinciple: Capture precedes structure.\nReason: r.\n'));
  const repCwd = path.join(rep, 'test', 'fixture');
  r = docket(['query', 'R9'], { cwd: repCwd });
  ok('query of a repeated id lists both entries, the first first', /^R9  The first bearer  · issue #70  \(DECISIONS\.md:\d+\)\nR9  The second bearer/m.test(r.out), r.out);
  r = docket(['governs', 'R9'], { cwd: repCwd });
  ok('governs of a repeated id resolves to the first entry, the one at its position', r.code === 0 && /^R9  The first bearer  · issue #70/.test(r.out), r.out);
  fs.writeFileSync(path.join(repCwd, 'twice.js'), 'const a = 1; // R9\n');
  r = docket(['near'], { cwd: rep, input: nearInput(path.join(repCwd, 'twice.js'), 'a = 1') });
  ok('near lists a repeated id with the first entry\'s title', /\n  R9  The first bearer  · issue #70\n/.test(r.out), r.out);
  r = docket(['check'], { cwd: rep });
  ok('…and check 2 fails the second: it is the tenth R entry, so R10 was expected', r.code === 1 && /^test\/fixture\/DECISIONS\.md:\d+  check 2: numbering: R9 is entry 10 of the R entries; expected R10$/m.test(r.out), r.out);
  // the union of overlapping windows reads a line once (FORMAT.md 15; D7)
  const ov = tempRepo(d => {
    const L = []; for (let i = 1; i <= 80; i++) L.push('const l' + i + ' = ' + i + ';');
    L[29] = 'anchor(); // line 30'; L[49] = 'anchor(); // line 50'; // windows [10,50] and [30,70] overlap on 30–50
    L[39] = 'const both = 1; // R6'; // in both windows: one cite
    L[14] = 'const first = 1; // R7'; L[64] = 'const second = 1; // R7'; // one in each window: two cites
    fs.writeFileSync(path.join(d, 'test', 'fixture', 'overlap.js'), L.join('\n') + '\n');
  });
  const ovOut = docket(['near', '--json'], { cwd: ov, input: nearInput(path.join(ov, 'test', 'fixture', 'overlap.js'), 'anchor();', { replace_all: true }) });
  const ovj = ovOut.code === 0 && ovOut.out ? JSON.parse(ovOut.out) : null;
  ok('near: a cite on a line two overlapping windows share counts once — R7 (two cites) outranks R6 (one, in the overlap)', ovj && ovj.mode === 'many' && ovj.rulings.map(x => x.id + ':' + x.count).join(',') === 'R7:2,R6:1', ovOut.out);
  ok('…and the region names each anchor once', ovj && ovj.region === '±20 lines of overlap.js:30, 50' && ovj.anchors.join(',') === '30,50', ovOut.out);
  // the union's third tie-break: equal counts, equal distance to the first match, the earlier line first
  const tie = (a, b) => tempRepo(d => {
    const L = []; for (let i = 1; i <= 80; i++) L.push('const l' + i + ' = ' + i + ';');
    L[29] = 'anchor(); // line 30'; L[69] = 'anchor(); // line 70';
    L[24] = 'const above = 1; // ' + a; L[34] = 'const below = 1; // ' + b; // lines 25 and 35: both five from the first anchor
    fs.writeFileSync(path.join(d, 'test', 'fixture', 'tie.js'), L.join('\n') + '\n');
  });
  const tieOrder = d => JSON.parse(docket(['near', '--json'], { cwd: d, input: nearInput(path.join(d, 'test', 'fixture', 'tie.js'), 'anchor();', { replace_all: true }) }).out).rulings.map(x => x.id + ':' + x.count + ':' + x.line).join(',');
  ok('near: with counts and distances to the first match equal, the earlier line lists first', tieOrder(tie('R6', 'R7')) === 'R6:1:25,R7:1:35' && tieOrder(tie('R7', 'R6')) === 'R7:1:25,R6:1:35', tieOrder(tie('R6', 'R7')) + ' / ' + tieOrder(tie('R7', 'R6')));
  // two matches on one line are one anchor
  const sl = tempRepo(d => fs.writeFileSync(path.join(d, 'test', 'fixture', 'sameline.js'), 'const a = 1; // R6\nconst b = f(x) + f(x);\n'));
  r = docket(['near'], { cwd: sl, input: nearInput(path.join(sl, 'test', 'fixture', 'sameline.js'), 'f(x)', { replace_all: true }) });
  ok('near: two matches on one line name the line once', r.out.startsWith('Governed here (test/fixture/DECISIONS.md, ±20 lines of sameline.js:2):\n  R6  '), r.out);
  const slNo = docket(['near'], { cwd: sl, input: nearInput(path.join(sl, 'test', 'fixture', 'sameline.js'), 'f(x)') });
  ok('…and without replace_all they are still many: silent', slNo.code === 0 && slNo.out === '' && slNo.err === '', slNo.out);
  // the code-span near test against the golden file, not the live base
  const csp = tempRepo(d => edit(d, 'test/fixture/app.js', 'function makeToolbar(', 'const quoted = "`R2`"; // a span, not a cite\nfunction makeToolbar('));
  r = docket(['near'], { cwd: csp, input: nearInput(path.join(csp, 'test', 'fixture', 'app.js'), 'makeToolbar(') });
  ok('near: an id inside a code span within the window is not listed — the window is the golden one, shifted a line', r.out === expected('near-41.txt').replace('app.js:41', 'app.js:42'), r.out);
  // spec-check --all names the fixture document in its failure line; (b) proven positively at the digit boundary (FORMAT.md 13)
  const allOut = docket(['spec-check', '--all']);
  ok('spec-check --all: the failure line names test/fixture/UIUX.md and the token', allOut.code === 1 && /^test\/fixture\/UIUX\.md:\d+  spec-check a: --line is #7a8fa6 in the spec but #7a8fa7 at test\/fixture\/styles\.css:5$/m.test(allOut.out), allOut.out);
  const ratio = v => { const t = tempRepo(d => edit(d, 'test/fixture/UIUX.md', '15.04:1', v + ':1')); return docket(['spec-check'], { cwd: path.join(t, 'test', 'fixture') }); };
  ok('spec-check (b): 15.04 is the two-decimal value of the hexes (the (a) failure alone remains)', ratio('15.04').out.split('\n').filter(l => /spec-check b/.test(l)).length === 0, ratio('15.04').out);
  ok('spec-check (b): a third digit below five rounds down on the digits — 15.044 states 15.04', ratio('15.044').out.split('\n').filter(l => /spec-check b/.test(l)).length === 0, ratio('15.044').out);
  ok('spec-check (b): a third digit of five rounds up on the digits — 15.045 states 15.05 and fails', /^test\/fixture\/UIUX\.md:\d+  spec-check b: --ink on --paper states 15\.05:1 but the hexes give 15\.04:1$/m.test(ratio('15.045').out), ratio('15.045').out);
  ok('spec-check (b): one hundredth above fails', /spec-check b: --ink on --paper states 15\.05:1 but the hexes give 15\.04:1$/m.test(ratio('15.05').out), ratio('15.05').out);
  ok('spec-check (b): one hundredth below fails', /spec-check b: --ink on --paper states 15\.03:1 but the hexes give 15\.04:1$/m.test(ratio('15.03').out), ratio('15.03').out);
  const fl = tempRepo(d => { edit(d, 'test/fixture/UIUX.md', '| `--paper` | `#f4efe6` | the page |', '| `--paper` | `#f4efe6` | the page |\n| `--paper-2` | `#f4efe6` | its twin |'); edit(d, 'test/fixture/UIUX.md', '| `--ink` on `--paper` | 15.04:1 |', '| `--ink` on `--paper` | 15.04:1 |\n| `--paper-2` on `--paper` | 1.005:1 |'); edit(d, 'test/fixture/styles.css', '  --paper: #f4efe6;', '  --paper: #f4efe6;\n  --paper-2: #f4efe6;'); });
  r = docket(['spec-check'], { cwd: path.join(fl, 'test', 'fixture') });
  ok('spec-check (b): 1.005 is read as 1.01 on its digits, not 1.00 by float arithmetic (1.005 × 100 is 100.49999… as a float)', /^test\/fixture\/UIUX\.md:\d+  spec-check b: --paper-2 on --paper states 1\.01:1 but the hexes give 1\.00:1$/m.test(r.out), r.out);
  // status: the last-three list is bounded, and a one-ruling ledger lists one (FORMAT.md 13)
  const sb3 = docket(['status'], { cwd: FIX }).out.split('\n');
  const lastIdx = sb3.indexOf('Last rulings:');
  ok('status lists exactly three rulings under "Last rulings:" for a nine-ruling ledger', lastIdx >= 0 && sb3.slice(lastIdx + 1, lastIdx + 5).filter(l => /^  [AR]\d+  /.test(l)).length === 3 && /^Cited nowhere/.test(sb3[lastIdx + 4]), sb3.join('\n'));
  const one1 = tempRepo(d => { fs.mkdirSync(path.join(d, 'test', 'fixture', 'one')); fs.writeFileSync(path.join(d, 'test', 'fixture', 'one', 'DECISIONS.md'), '# One\n\n### Q1. Only (issue #1)\nReason: r.\n'); });
  r = docket(['status'], { cwd: path.join(one1, 'test', 'fixture', 'one') });
  ok('status of a one-ruling ledger lists that one', /^Docket — test\/fixture\/one\/DECISIONS\.md \(1 ruling; prefix Q\)\nLast rulings:\n  Q1  Only  · issue #1\nCited nowhere: Q1 \(1 of 1\)$/m.test(r.out), r.out);
  // governs excludes the live ledger from code cites, not only frozen copies
  const g3 = docket(['governs', 'R3'], { cwd: FIX });
  ok('governs R3: the ledger\'s own references to R3 (R4\'s heading, its body) are not code cites', !/DECISIONS\.md:\d+/.test(g3.out.split('Code cites:')[1] || ''), g3.out);
  // a verb or adverb may open a sentence with a capital and is recorded in lowercase; any other casing is no edge (FORMAT.md 5)
  const vc = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '\n### R9. Capital verbs (issue #72; Partially reverses R6)\nPrinciple: Capture precedes structure.\nSupersedes R1 because the frame is the note. In part waives R2. SUPERSEDES R3 is shouting, not an edge. Reason: r.\n'));
  const vcj = JSON.parse(docket(['index'], { cwd: path.join(vc, 'test', 'fixture') }).out).rulings.find(x => x.id === 'R9');
  ok('a sentence-initial "Supersedes R1" is an edge, recorded as supersedes, with the sentence as its clause', vcj.edges.some(e => e.verb === 'supersedes' && e.to === 'R1' && e.clause === 'Supersedes R1 because the frame is the note.'), JSON.stringify(vcj.edges));
  ok('a capitalised adverb — "Partially reverses R6" in the meta, "In part waives R2" in the body — is recorded in lowercase', vcj.edges.some(e => e.adverb === 'partially' && e.verb === 'reverses' && e.to === 'R6') && vcj.edges.some(e => e.adverb === 'in part' && e.verb === 'waives' && e.to === 'R2'), JSON.stringify(vcj.edges));
  ok('an all-caps verb is no edge', !vcj.edges.some(e => e.to === 'R3') && vcj.edges.length === 3, JSON.stringify(vcj.edges));
  r = docket(['check'], { cwd: vc });
  ok('…and check accepts the capitalised meta clause as an edge (check 6) to an earlier ruling (check 5)', r.code === 0, r.out);
  r = docket(['governs', 'R6'], { cwd: path.join(vc, 'test', 'fixture') });
  ok('governs renders the edge in lowercase and quotes the clause as written', /^  R9 partially reverses R6  — "Partially reverses R6"$/m.test(r.out), r.out);
  const ce = tempRepo();
  r = docket(['append', '--title', 'Capital edge', '--issue', '73', '--principle', 'Capture precedes structure', '--edge', 'Extends R1', '--body', 'x. Reason: r.'], { cwd: path.join(ce, 'test', 'fixture') });
  ok('append --edge accepts a capitalised verb and writes it in lowercase', r.code === 0 && /^### R9\. Capital edge \(issue #73; extends R1\)$/m.test(r.out) && /check: ok/.test(r.out), r.err + r.out);
  // the repository's own lines, exactly: check, the witness, status — the counts recomputed here from git and findLedger
  const trackedAll = sh('git', ['ls-files', '-z'], ROOT).stdout.split('\0').filter(Boolean).map(f => path.join(ROOT, f));
  const isText = f => { const b = fs.readFileSync(f); const n = Math.min(b.length, 8000); for (let i = 0; i < n; i++) if (b[i] === 0) return false; return true; };
  // the walk of FORMAT.md 1, written here from the prose and not borrowed from the core: nearest DECISIONS.md
  // or docs/DECISIONS.md from the file's own directory up to the root. A count the core computes for itself
  // agrees with itself whatever it does; this one does not.
  const walkUp = f => {
    for (let dir = path.dirname(path.resolve(f)); ; dir = path.dirname(dir)) {
      for (const cand of [path.join(dir, 'DECISIONS.md'), path.join(dir, 'docs', 'DECISIONS.md')])
        if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
      if (dir === ROOT || dir === path.dirname(dir)) return null;
    }
  };
  const governedTree = trackedAll.filter(f => fs.statSync(f).isFile() && isText(f) && walkUp(f));
  const ledgerSet = new Set(governedTree.map(walkUp));
  const rootCheck = docket(['check']);
  ok('check at the root ends with its exact summary line — the ledger count and the governed-tree file count, both recomputed here', rootCheck.code === 0 && rootCheck.out.trimEnd().split('\n').pop() === 'check: ok (' + ledgerSet.size + ' ledgers, ' + governedTree.length + ' governed-tree files)' && ledgerSet.size === 2 && governedTree.length > 10, rootCheck.out);
  const rootWitness = docket([]);
  ok('the witness at the root ends with its exact summary line: two ledgers, no spec rows beside docs/DECISIONS.md', rootWitness.code === 0 && rootWitness.out.trimEnd().split('\n').pop() === 'witness: ok (2 ledgers, 0 spec rows)', rootWitness.out);
  const rootIdx = JSON.parse(docket(['index']).out);
  const rootStatus = docket(['status']).out.split('\n');
  ok('status at the root: the ledger line with its count, the last three rulings newest first, nothing cited nowhere', rootStatus[0] === 'Docket — docs/DECISIONS.md (' + rootIdx.rulings.length + ' rulings; prefix D)' && rootStatus[1] === 'Last rulings:' && rootStatus.slice(2, 5).map(l => l.trim().split(/\s+/)[0]).join(',') === rootIdx.rulings.slice(-3).reverse().map(x => x.id).join(',') && rootStatus[5] === 'Cited nowhere: none', rootStatus.join('\n'));
  // governs R6 lists every fixture line that cites R6 outside code and nothing else: an independent count over the tracked fixture files
  const fixFiles = sh('git', ['ls-files', '-z', 'test/fixture'], ROOT).stdout.split('\0').filter(Boolean).filter(f => !/^DECISIONS.*\.md$/i.test(path.basename(f)));
  const want = [];
  for (const f of fixFiles) { let fence = false; read(path.join(ROOT, f)).split(/\r?\n/).forEach((l, i) => { if (/^\s*```/.test(l)) { fence = !fence; return; } if (fence) return; if (/(?<![\p{L}\p{N}_])R6(?![\p{L}\p{N}_])/u.test(l.replace(/`[^`\n]*`/g, ''))) want.push(f + ':' + (i + 1)); }); }
  const gR6 = docket(['governs', 'R6'], { cwd: FIX }).out;
  const gotCites = (gR6.split('Code cites:\n')[1] || '').split('\n').filter(l => /^  \S+:\d+  /.test(l)).map(l => l.trim().split('  ')[0]);
  ok('governs R6: the code cites are exactly the tracked fixture lines that cite R6 outside code (' + want.length + '), in file then line order', want.length >= 5 && gotCites.join(',') === want.join(','), 'want ' + want.join(',') + '\n got  ' + gotCites.join(','));
  // one planted defect is exactly one failure, in the text and in --json, and the two agree field for field
  const one9 = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'app.js'), 'const planted = 1; // R9\n'));
  const oneT = docket(['check'], { cwd: one9 }), oneJ = JSON.parse(docket(['check', '--json'], { cwd: one9 }).out);
  const oneLines = oneT.out.split('\n').filter(l => /  check \d: /.test(l));
  ok('one planted bad cite is exactly one failure line in the text and one object in --json', oneT.code === 1 && oneLines.length === 1 && oneJ.ok === false && oneJ.failures.length === 1, oneT.out);
  ok('…and the --json failure is the text line, field for field: file:line  check k: message', oneJ.failures.length === 1 && oneLines[0] === oneJ.failures[0].file + ':' + oneJ.failures[0].line + '  check ' + oneJ.failures[0].k + ': ' + oneJ.failures[0].message && oneJ.failures[0].file === 'test/fixture/app.js' && oneJ.failures[0].k === 1 && oneJ.failures[0].message === 'cite R9 names no ruling in test/fixture/DECISIONS.md', JSON.stringify(oneJ) + '\n' + oneT.out);
  // check 3 for a PRD cite, like a UIUX one
  const prd9 = tempRepo(d => edit(d, 'test/fixture/app.js', 'PRD ' + SEC + '1', 'PRD ' + SEC + '9'));
  r = docket(['check'], { cwd: prd9 });
  ok('check 3: a PRD cite that names no heading fails at its line, like a UIUX one', r.code === 1 && new RegExp('^test\\/fixture\\/app\\.js:\\d+  check 3: PRD ' + SEC + '9 names no heading in test\\/fixture\\/PRD\\.md$', 'm').test(r.out) && r.out.split('\n').filter(l => /  check \d: /.test(l)).length === 1, r.out);
  // check 4's message carries the count and the allowance
  const bare4 = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'app.js'), 'const fourth = 1; // ' + SEC + '2 alone, a fourth bare cite\n'));
  r = docket(['check'], { cwd: bare4 });
  ok('check 4: the fourth bare cite fails with the count and the allowance, at the file\'s first bare cite', r.code === 1 && new RegExp('^test\\/fixture\\/app\\.js:\\d+  check 4: bare-' + SEC + ' cites: 4 > allowance 3 for app\\.js$', 'm').test(r.out) && r.out.split('\n').filter(l => /  check \d: /.test(l)).length === 1, r.out);
  // the cross-prefix rule in isolation (D5): an R6 under a ledger whose prefixes lack R is not a cite
  ok('the repository\'s own judge/PROTOCOL.md carries an R6 as a worked example', /(?<![\p{L}\p{N}_])R6(?![\p{L}\p{N}_])/u.test(read(path.join(ROOT, 'judge', 'PROTOCOL.md'))));
  r = docket(['governs', 'R6']);
  ok('…and at the root R6 is no ruling: the prefix is not the ledger\'s', r.code === 2 && /^no ruling R6 in docs\/DECISIONS\.md$/m.test(r.err), r.err);
  const xq = tempRepo(d => { fs.mkdirSync(path.join(d, 'test', 'fixture', 'q')); fs.writeFileSync(path.join(d, 'test', 'fixture', 'q', 'DECISIONS.md'), '# Q\n\n### Q1. One (issue #1)\nReason: r.\n'); fs.writeFileSync(path.join(d, 'test', 'fixture', 'q', 'x.js'), 'const a = 1; // R6 is a worked example here; Q1 is the ruling\n'); });
  r = docket(['check'], { cwd: xq });
  ok('an R6 in a file whose ledger has the prefix Q alone is not a cite: check passes', r.code === 0, r.out);
  r = docket(['governs', 'Q1'], { cwd: path.join(xq, 'test', 'fixture', 'q') });
  ok('…while Q1 there is: governs Q1 lists the line', r.code === 0 && /^  test\/fixture\/q\/x\.js:1  /m.test(r.out), r.out);
  r = docket(['governs', 'R6'], { cwd: path.join(xq, 'test', 'fixture', 'q') });
  ok('…and governs R6 under the Q ledger is a usage error', r.code === 2 && /^no ruling R6 in test\/fixture\/q\/DECISIONS\.md$/m.test(r.err), r.err);
  // whole outputs, where matching a prefix would not prove the text: the 5,000-line window, governs R3, nine matches
  const big2 = tempRepo(d => { const L = []; for (let i = 1; i <= 5000; i++) L.push(i % 250 === 0 ? 'const v' + i + ' = ' + i + '; // R2' : 'const v' + i + ' = ' + i + ';'); L[2499] = 'function anchorHere() {} // R6'; L[2509] = 'const nearTheAnchor = 1; // R2'; fs.writeFileSync(path.join(d, 'test', 'fixture', 'big.js'), L.join('\n') + '\n'); });
  r = docket(['near'], { cwd: big2, input: nearInput(path.join(big2, 'test', 'fixture', 'big.js'), 'anchorHere') });
  ok('near: the 5,000-line window, whole — two rulings, the edge into R6, the addendum on R2, the instruction line', r.out === 'Governed here (test/fixture/DECISIONS.md, ±20 lines of big.js:2500):\n  R6  The toolbar replaces the long-press menu  · issue #12\n  R2  Positions are never mutated on read\nEdges among these: R7 partially reverses R6 (relational plane only).\nAddenda: R2 (2026-09-11).\nName the ruling you rely on before you edit.\n', r.out);
  const g3lines = docket(['governs', 'R3'], { cwd: FIX }).out.split('\n');
  ok('governs R3, whole above the code cites: the header, no out-edges, one in-edge with its clause, no addenda — no computed label anywhere (D3)', /^R3  Fold similarity  · issue #4  \(test\/fixture\/DECISIONS\.md:\d+\)$/.test(g3lines[0]) && g3lines.slice(1, 8).join('\n') === 'Out-edges (what R3 does to earlier rulings):\n  none\nIn-edges (what later rulings do to R3):\n  R4 supersedes R3  — "supersedes R3"\nAddenda:\n  none\nCode cites:' && g3lines.slice(8).every(l => l === '' || /^  test\/fixture\/[^ ]+:\d+  /.test(l)), g3lines.join('\n'));
  const tk = tempRepo(d => { const T = []; for (let i = 1; i <= 12; i++) T.push(i <= 9 ? 'tick(); // R2' : 'const c' + i + ' = ' + i + ';'); fs.writeFileSync(path.join(d, 'test', 'fixture', 'ticks.js'), T.join('\n') + '\n'); });
  r = docket(['near'], { cwd: tk, input: nearInput(path.join(tk, 'test', 'fixture', 'ticks.js'), 'tick()', { replace_all: true }) });
  ok('near: nine matches, whole — the header names eight lines and +1 more, one ruling, its addendum, the instruction line; exit 0', r.code === 0 && r.out === 'Governed here (test/fixture/DECISIONS.md, ±20 lines of ticks.js:1, 2, 3, 4, 5, 6, 7, 8 +1 more):\n  R2  Positions are never mutated on read\nAddenda: R2 (2026-09-11).\nName the ruling you rely on before you edit.\n', r.out);
  // an entry's numeral has at most fifteen digits, so n is exact and append's max+1 increments (FORMAT.md 2)
  const big15 = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '\n### R9007199254740993. Past the safe integer (issue #90)\nPrinciple: Capture precedes structure.\nReason: r.\n### R999999999999999. Fifteen digits (issue #91)\nPrinciple: Capture precedes structure.\nReason: r.\n'));
  const b15 = JSON.parse(docket(['index'], { cwd: path.join(big15, 'test', 'fixture') }).out);
  ok('a sixteen-digit numeral is not an entry heading; a fifteen-digit one is, with an exact n', !b15.rulings.some(x => x.id === 'R9007199254740993') && b15.rulings.some(x => x.id === 'R999999999999999' && x.n === 999999999999999), b15.rulings.map(x => x.id).join(','));
  r = docket(['append', '--title', 'The next number', '--issue', '92', '--principle', 'Capture precedes structure', '--body', 'x. Reason: r.'], { cwd: path.join(big15, 'test', 'fixture') });
  const b15Cwd = path.join(big15, 'test', 'fixture'), b15Before = read(path.join(b15Cwd, 'DECISIONS.md'));
  ok('append at the largest number the grammar allows is refused, naming the ceiling and the way out, and writes nothing', r.code === 2 && /^append: the R entries end at 999999999999999, the largest number the grammar allows \(15 digits\); a further ruling needs a new prefix — pass --prefix \(FORMAT\.md 2, 12\)$/m.test(r.err) && r.out === '' && read(path.join(b15Cwd, 'DECISIONS.md')) === b15Before, r.err + r.out);
  r = docket(['append', '--prefix', 'S', '--title', 'The next number', '--issue', '92', '--principle', 'Capture precedes structure', '--body', 'x. Reason: r.'], { cwd: b15Cwd });
  ok('…and the way out works: a new prefix starts at 1, and nothing check reports is about it', /^### S1\. The next number \(issue #92\)$/m.test(r.out) && !/check \d+: .*\bS1\b/.test(r.out), r.err + r.out);
  // the project ledger by discovery: governs and query on a D ruling from the root
  const gD8 = docket(['governs', 'D8']);
  ok('governs D8 at the root resolves docs/DECISIONS.md by discovery and lists code cites in bin/docket.js', gD8.code === 0 && /^D8  .+  \(docs\/DECISIONS\.md:\d+\)$/m.test(gD8.out) && /^  bin\/docket\.js:\d+  /m.test(gD8.out), gD8.out);
  const qD = docket(['query', 'D14']);
  ok('query D14 at the root finds the ruling by id', qD.code === 0 && /^D14  A number and the property it preserves are both rulings/m.test(qD.out), qD.out);
  // check walks git-tracked files only: a stray file with a bad cite is invisible until it is added
  const stray = tempRepo();
  fs.writeFileSync(path.join(stray, 'test', 'fixture', 'stray.js'), 'const s = 1; // R99\n');
  r = docket(['check'], { cwd: stray });
  ok('check: an untracked file with a bad cite is not read', r.code === 0 && !/stray\.js/.test(r.out), r.out);
  sh('git', ['add', '-A'], stray);
  r = docket(['check'], { cwd: stray });
  ok('…and once tracked its bad cite fails check 1', r.code === 1 && /^test\/fixture\/stray\.js:1  check 1: cite R99 names no ruling in test\/fixture\/DECISIONS\.md$/m.test(r.out), r.out);
  // the nearest of two ledgers above a file wins; a ledger above the git root is never reached
  const two = tempRepo(d => { fs.writeFileSync(path.join(d, 'test', 'DECISIONS.md'), '# Outer\n\n### Q1. Outer rule (issue #1)\nReason: r.\n'); fs.writeFileSync(path.join(d, 'test', 'between.js'), 'const b = 1; // Q1\n'); });
  const coreJ = require(CORE);
  ok('discovery: a file under test/fixture resolves to the fixture ledger, its sibling under test/ to the nearer test/DECISIONS.md', coreJ.findLedger(path.join(two, 'test', 'fixture', 'app.js'), two) === path.join(two, 'test', 'fixture', 'DECISIONS.md') && coreJ.findLedger(path.join(two, 'test', 'between.js'), two) === path.join(two, 'test', 'DECISIONS.md'));
  r = docket(['check'], { cwd: two });
  ok('…and check resolves each file to its own: both ledgers pass', r.code === 0 && /check: ok \(2 ledgers, /.test(r.out), r.out);
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-outer-'));
  fs.writeFileSync(path.join(outer, 'DECISIONS.md'), '# Above the root\n\n### Q1. Unreachable (issue #1)\nReason: r.\n');
  const innerRepo = path.join(outer, 'inner'); fs.mkdirSync(innerRepo);
  fs.writeFileSync(path.join(innerRepo, 'lone.js'), 'const l = 1; // Q1\n');
  sh('git', ['init', '-q', '-b', 'main'], innerRepo); sh('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A'], innerRepo); sh('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'inner'], innerRepo);
  const loneNear = docket(['near'], { cwd: innerRepo, input: nearInput(path.join(innerRepo, 'lone.js'), 'l = 1') });
  ok('a ledger above the git root is not reached: near is silent for a file whose only ledger lies outside the repository', loneNear.code === 0 && loneNear.out === '' && loneNear.err === '', loneNear.out);
  r = docket(['check'], { cwd: innerRepo });
  ok('…and check at that root finds no ledger and nothing governed', r.code === 0 && /^check: ok \(0 ledgers, 0 governed-tree files\)$/m.test(r.out), r.out);
  // spec-check reports every disagreement, not the first
  const twoBad = tempRepo(d => edit(d, 'test/fixture/UIUX.md', '| `--paper` | `#f4efe6` |', '| `--paper` | `#f4efe7` |'));
  r = docket(['spec-check'], { cwd: path.join(twoBad, 'test', 'fixture') });
  ok('spec-check (a): two token rows that disagree are two lines, each naming its token and both hexes', r.code === 1 && /^test\/fixture\/UIUX\.md:7  spec-check a: --paper is #f4efe7 in the spec but #f4efe6 at test\/fixture\/styles\.css:3$/m.test(r.out) && /^test\/fixture\/UIUX\.md:9  spec-check a: --line is #7a8fa6 in the spec but #7a8fa7 at test\/fixture\/styles\.css:5$/m.test(r.out) && r.out.split('\n').filter(l => /spec-check a:/.test(l)).length === 2, r.out);
  // check 6 binds from the contract line: R3, before it, carries no Principle: line and passes (R3's own evidence, not the clean flag alone)
  const fixIdx = JSON.parse(docket(['index'], { cwd: FIX }).out);
  ok('R3 lies before the contract line, has no Principle: line, and the fixture passes check: the contract binds from R8 only', fixIdx.contractFrom.R === 8 && fixIdx.rulings.find(x => x.id === 'R3').principle === null && fixIdx.rulings.find(x => x.id === 'R8').principle !== null && docket(['check'], { cwd: FIX }).code === 0, JSON.stringify(fixIdx.contractFrom));
  // the empty-window notice is one line, as D7's addendum and FORMAT.md 15 say
  const oneLine = docket(['near'], { input: nearInput(APP, '  return JSON.stringify(out);') });
  ok('near: the empty-window notice is exactly one line — the header and the sentence together — and equals the golden file', oneLine.code === 0 && oneLine.out === expected('near-empty-window.txt') && oneLine.out.split('\n').filter(Boolean).length === 1 && /^Governed here \(test\/fixture\/DECISIONS\.md, ±20 lines of app\.js:\d+\): no ruling is cited in this window; run docket governs <id> for the one you rely on\.\n$/.test(oneLine.out), oneLine.out);
  // every silent case is silent on stderr too
  const silentCases = [
    ['zero matches', nearInput(APP, 'no such text anywhere')],
    ['an empty old_string', nearInput(APP, '')],
    ['many matches without replace_all', nearInput(APP, "  el.classList.add('note');")],
    ['a Write of a new file', JSON.stringify({ tool_name: 'Write', tool_input: { file_path: path.join(FIX, 'brand-new.js'), content: 'x' } })],
    ['a file that cites nothing', JSON.stringify({ tool_name: 'Write', tool_input: { file_path: path.join(ROOT, 'LICENSE'), content: 'x' } })],
    ['an edit inside the ledger', nearInput(path.join(FIX, 'DECISIONS.md'), 'Fold similarity')],
    ['unparseable stdin', 'not json'],
  ];
  for (const [name, input] of silentCases) { const sr = docket(['near'], { input }); ok('near: ' + name + ' → nothing on stdout or stderr, exit 0', sr.code === 0 && sr.out === '' && sr.err === '', JSON.stringify([sr.out, sr.err])); }
  // append refuses a body that carries an addendum line (FORMAT.md 6)
  const smug = tempRepo(), smugCwd = path.join(smug, 'test', 'fixture'), smugBefore = read(path.join(smugCwd, 'DECISIONS.md'));
  r = docket(['append', '--title', 'Smuggled addendum', '--issue', '99', '--principle', 'Capture precedes structure', '--body', 'Reason: r.\n> Addendum 1999-01-01: born amended.'], { cwd: smugCwd });
  ok('append refuses a --body carrying an addendum line, before writing', r.code === 2 && /^append: --body may not carry an addendum line/.test(r.err) && read(path.join(smugCwd, 'DECISIONS.md')) === smugBefore, r.err);
  // a `## ` line that is not a section heading is body text, like a stray `### ` (FORMAT.md 7)
  const om2 = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', 'Notes fold together by shape and by size', 'Notes fold together by shape and by size\n## ' + String.fromCharCode(0x3a9) + '. Not a section: the letter is not ASCII, citing R2 for context'));
  const om2j = JSON.parse(docket(['index'], { cwd: path.join(om2, 'test', 'fixture') }).out);
  ok('a `## ` line whose letter is not ASCII is not a section: it stays in the entry above as body text, and query finds it there', om2j.sections.length === 2 && om2j.rulings.length === 9 && om2j.rulings.find(x => x.id === 'R3').body.includes('Not a section') && /^R3  /m.test(docket(['query', 'Not a section'], { cwd: path.join(om2, 'test', 'fixture') }).out), JSON.stringify(om2j.sections));
  r = docket(['check'], { cwd: om2 });
  ok('…and check reads the R2 there as a cite of R2, passing', r.code === 0, r.out);
  const pre = tempRepo(d => { fs.mkdirSync(path.join(d, 'test', 'fixture', 'pre')); fs.writeFileSync(path.join(d, 'test', 'fixture', 'pre', 'DECISIONS.md'), '# L\n\n## Notes\n\nA note in the preamble.\n\n<!-- docket: contract from Q1 -->\n\nPrinciples\n- **Only principle.** x.\n\n### Q1. One (issue #1)\nPrinciple: Only principle.\nReason: r.\n'); });
  const prej = JSON.parse(docket(['index'], { cwd: path.join(pre, 'test', 'fixture', 'pre') }).out);
  ok('a `## Notes` line in the preamble does not end it: the contract comment and the principles list after it are read', prej.contractFrom.Q === 1 && prej.sections.length === 0 && prej.rulings.length === 1 && docket(['check'], { cwd: pre }).code === 0, JSON.stringify([prej.contractFrom, prej.sections]));
  // an unpaired backtick is a literal character, not a span; text after the meta is neither title nor meta (FORMAT.md 3, 4; D4)
  const upb = '### R9. Notes fold by shape only, not by `size (context) (supersedes R1)\nPrinciple: Capture precedes structure.\nReason: r.\n';
  const bound = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '\n' + upb));
  const bj = JSON.parse(docket(['index'], { cwd: path.join(bound, 'test', 'fixture') }).out).rulings.find(x => x.id === 'R9');
  ok('an unpaired backtick opens no span: the first " (" is the meta, the title is what precedes it with the backtick stripped, and no edge is read from the text after the meta', bj.title === 'Notes fold by shape only, not by size' && bj.meta === 'context' && bj.edges.length === 0, JSON.stringify([bj.title, bj.meta, bj.edges]));
  r = docket(['check'], { cwd: bound });
  ok('…a bound entry whose heading goes on after its meta fails check 6', r.code === 1 && /^test\/fixture\/DECISIONS\.md:\d+  check 6: R9: heading does not end with a parenthetical meta$/m.test(r.out), r.out);
  const loose = tempRepo(d => { fs.mkdirSync(path.join(d, 'test', 'fixture', 'loose')); fs.writeFileSync(path.join(d, 'test', 'fixture', 'loose', 'DECISIONS.md'), '# Loose\n\n### R1. Notes fold by shape\nReason: r.\n' + upb.replace('R9', 'R2')); });
  r = docket(['check'], { cwd: loose });
  ok('…a loose entry (no contract line) is held to nothing: check passes and the edge stays unread — D4\'s cost, stated in FORMAT.md 4', r.code === 0 && JSON.parse(docket(['index'], { cwd: path.join(loose, 'test', 'fixture', 'loose') }).out).rulings.find(x => x.id === 'R2').edges.length === 0, r.out);
  // usage errors for a bare query or governs, and append's other required flags
  r = docket(['query'], { cwd: FIX });
  ok('query without a term is a usage error, exit 2', r.code === 2 && r.err.trim() === 'usage: docket query <term>', r.err);
  r = docket(['governs'], { cwd: FIX });
  ok('governs without an id is a usage error, exit 2', r.code === 2 && r.err.trim() === 'usage: docket governs <id>', r.err);
  const rq = tempRepo(), rqCwd = path.join(rq, 'test', 'fixture');
  r = docket(['append', '--issue', '1', '--principle', 'Capture precedes structure', '--body', 'x. Reason: r.'], { cwd: rqCwd });
  ok('append without --title is refused, exit 2', r.code === 2 && /^append: --title is required/.test(r.err), r.err);
  r = docket(['append', '--title', 'No body', '--issue', '1', '--principle', 'Capture precedes structure'], { cwd: rqCwd });
  ok('append without --body is refused, exit 2', r.code === 2 && /^append: --body is required/.test(r.err), r.err);
  // a second contract line for a prefix, or a second bare-cites comment, is a check failure; the first is read (FORMAT.md 9, 11)
  const dupC = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', '<!-- docket: contract from R8 -->', '<!-- docket: contract from R8 -->\n<!-- docket: contract from R2 -->'));
  r = docket(['check'], { cwd: dupC });
  const dupCj = JSON.parse(docket(['index'], { cwd: path.join(dupC, 'test', 'fixture') }).out);
  ok('check 6: a second contract line for prefix R fails at its own line, naming the line that binds; the first is the one read (R8, so R2–R7 stay loose)', r.code === 1 && /^test\/fixture\/DECISIONS\.md:\d+  check 6: a second contract line for prefix R \(line \d+ binds\); the preamble carries one per prefix \(FORMAT\.md 11\)$/m.test(r.out) && dupCj.contractFrom.R === 8 && !/check 6: R[2-7]:/.test(r.out), r.out);
  const dupB = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', '<!-- docket: bare-cites app.js=3 -->', '<!-- docket: bare-cites app.js=3 -->\n<!-- docket: bare-cites app.js=0 -->'));
  r = docket(['check'], { cwd: dupB });
  ok('check 4: a second bare-cites comment fails at its own line, and the first is the baseline (app.js keeps its allowance of 3)', r.code === 1 && /^test\/fixture\/DECISIONS\.md:\d+  check 4: a second bare-cites comment \(line \d+ is the baseline\); the preamble carries one \(FORMAT\.md 9\)$/m.test(r.out) && !/allowance 0 for app\.js/.test(r.out) && JSON.parse(docket(['index'], { cwd: path.join(dupB, 'test', 'fixture') }).out).baseline['app.js'] === 3, r.out);
  // a wrapped principle bullet is one bullet: the indented line continues it (FORMAT.md 10)
  const wrapped = tempRepo(d => {
    edit(d, 'test/fixture/PRD.md', 'A thought is framed the instant it is typed; where it goes', 'A thought is framed the instant it is\n  typed; where it goes');
    edit(d, 'test/fixture/PRD.md', 'Nothing the person placed moves unless', 'Nothing the person placed moves\n  unless');
  });
  const wCwd = path.join(wrapped, 'test', 'fixture');
  const wp = docket(['principles'], { cwd: wCwd }), wpj = JSON.parse(docket(['principles', '--json'], { cwd: wCwd }).out);
  ok('principles: wrapped bullets are three bullets, each printed whole on one line, the continuation joined by one space', wp.code === 0 && wp.out.split('\n').filter(Boolean).length === 3 && wp.out.split('\n')[0] === '- **Capture precedes structure.** A thought is framed the instant it is typed; where it goes and what it is next to are asserted afterwards.' && wpj.list.map(x => x.name).join('|') === 'Capture precedes structure|Positions are permanent|Zero cognitive tax', wp.out);
  r = docket(['append', '--title', 'Pinned notes keep their size', '--issue', '21', '--principle', 'Positions are permanent', '--body', 'Reason: a landmark should not move.'], { cwd: wCwd });
  ok('append accepts a principle whose bullet wraps, and check passes', r.code === 0 && /check: ok/.test(r.out), r.out + r.err);
  // a title that renders empty is refused by append and failed by check 6 (FORMAT.md 3, 11)
  const et = tempRepo(), etCwd = path.join(et, 'test', 'fixture'), etBefore = read(path.join(etCwd, 'DECISIONS.md'));
  r = docket(['append', '--title', '``', '--issue', '30', '--principle', 'Zero cognitive tax', '--body', 'Reason: test empty title.'], { cwd: etCwd });
  ok('append refuses a --title of marks alone (two backticks render empty), before writing', r.code === 2 && /^append: --title renders empty/.test(r.err) && read(path.join(etCwd, 'DECISIONS.md')) === etBefore, r.err);
  r = docket(['append', '--title', '**', '--issue', '30', '--principle', 'Zero cognitive tax', '--body', 'Reason: test empty title.'], { cwd: etCwd });
  ok('append refuses a --title of two asterisks the same way', r.code === 2 && /^append: --title renders empty/.test(r.err), r.err);
  const et2 = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '\n### R9. `` (issue #30)\nPrinciple: Zero cognitive tax.\nReason: a nameless entry.\n'));
  r = docket(['check'], { cwd: et2 });
  ok('check 6: a bound entry whose title renders empty fails at its heading, and nothing else about it fails', r.code === 1 && /^test\/fixture\/DECISIONS\.md:\d+  check 6: R9: title is empty — a bound entry is named in words \(FORMAT\.md 3, 11\)$/m.test(r.out) && r.out.split('\n').filter(l => /check 6: R9/.test(l)).length === 1, r.out);
  // one match with replace_all: true is the one-match row all the same (FORMAT.md 15: one | any | window ±20)
  const oneAll = docket(['near'], { input: nearInput(APP, 'makeToolbar(', { replace_all: true }) });
  ok('near: one match with replace_all set is the ±20 window, byte for byte the golden file', oneAll.code === 0 && oneAll.out === expected('near-41.txt'), oneAll.out);
  // a governed code file with CRLF line endings: the same window, the same checks (FORMAT.md 1 normalises every text file)
  const crlfCode = tempRepo(d => { const p = path.join(d, 'test', 'fixture', 'app.js'); fs.writeFileSync(p, read(p).replace(/\n/g, '\r\n')); });
  const crlfCodeNear = docket(['near'], { cwd: crlfCode, input: nearInput(path.join(crlfCode, 'test', 'fixture', 'app.js'), 'makeToolbar(') });
  ok('near: a CRLF code file yields the same window text as the LF one', crlfCodeNear.out === expected('near-41.txt'), crlfCodeNear.out);
  r = docket(['check'], { cwd: crlfCode });
  ok('check: a CRLF code file passes every check like the LF one', r.code === 0 && /check: ok \(1 ledger, /.test(r.out), r.out + r.err);
  // append --baseline with no bare cites anywhere writes the empty comment — every allowance 0 (FORMAT.md 9)
  const nb = tempRepo(d => {
    edit(d, 'test/fixture/app.js', '// ' + SEC + '4 minimum hit target', '// minimum hit target');
    edit(d, 'test/fixture/app.js', '// ' + SEC + '4 the line is a hit target too', '// the line is a hit target too');
    edit(d, 'test/fixture/app.js', '// ' + SEC + '4 minimum frame width', '// minimum frame width');
  });
  const nbCwd = path.join(nb, 'test', 'fixture');
  r = docket(['append', '--baseline'], { cwd: nbCwd });
  ok('append --baseline on a tree with no bare cites writes the empty comment and check passes', r.code === 0 && /^<!-- docket: bare-cites -->$/m.test(r.out) && /check: ok/.test(r.out) && read(path.join(nbCwd, 'DECISIONS.md')).includes('<!-- docket: bare-cites -->\n') && !/bare-cites app/.test(read(path.join(nbCwd, 'DECISIONS.md'))), r.out + r.err);
  // the working-directory commands two ledger-less directories below the ledger (FORMAT.md 1: the walk)
  const deepCwd = tempRepo(d => fs.mkdirSync(path.join(d, 'test', 'fixture', 'a', 'b'), { recursive: true }));
  const dCwd = path.join(deepCwd, 'test', 'fixture', 'a', 'b');
  const dStatus = docket(['status'], { cwd: dCwd }), dQuery = docket(['query', 'toolbar'], { cwd: dCwd }), dIndex = docket(['index'], { cwd: dCwd });
  ok('status, query and index from two directories below the ledger resolve to it', /^Docket — test\/fixture\/DECISIONS\.md \(9 rulings; prefixes A, R\)/.test(dStatus.out) && /^R6  /m.test(dQuery.out) && JSON.parse(dIndex.out).ledger === 'test/fixture/DECISIONS.md', dStatus.out + dQuery.out);
  // the same-directory order: dir/DECISIONS.md before dir/docs/DECISIONS.md, and the nearer one wins from below (FORMAT.md 1)
  const tieL = tempRepo(d => { fs.mkdirSync(path.join(d, 'test', 'fixture', 'docs')); fs.writeFileSync(path.join(d, 'test', 'fixture', 'docs', 'DECISIONS.md'), '# T\n\n### T1. The docs ledger (issue #1)\nReason: r.\n'); });
  const tieLTop = JSON.parse(docket(['index'], { cwd: path.join(tieL, 'test', 'fixture') }).out), tieLDocs = JSON.parse(docket(['index'], { cwd: path.join(tieL, 'test', 'fixture', 'docs') }).out);
  ok('discovery: from a directory holding both, dir/DECISIONS.md is the ledger; from docs/ itself, docs/DECISIONS.md is', tieLTop.ledger === 'test/fixture/DECISIONS.md' && tieLDocs.ledger === 'test/fixture/docs/DECISIONS.md' && tieLDocs.prefixes.join() === 'T', tieLTop.ledger + ' ' + tieLDocs.ledger);
  // UIUX.md and PRD.md beside the ledger are not counted by the ratchet: a bare section mark inside them is the document's own (FORMAT.md 9)
  const sx = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'UIUX.md'), '\nSee ' + SEC + '2 above for the ladder.\n'));
  r = docket(['check'], { cwd: sx });
  ok('check 4: a bare section mark inside UIUX.md is not a bare cite — the spec documents are exempt from the ratchet', r.code === 0 && /check: ok \(1 ledger, /.test(r.out) && !/UIUX\.md:\d+  check 4/.test(r.out), r.out);
  // append writes one heading: a line break in --title, --issue or an --edge, or a heading line in --body, is refused before writing (FORMAT.md 2, 4, 11)
  const nl = tempRepo(), nlCwd = path.join(nl, 'test', 'fixture'), nlBefore = read(path.join(nlCwd, 'DECISIONS.md'));
  r = docket(['append', '--title', 'Legit-looking title\n### R66. Injected heading\nPrinciple: Zero cognitive tax.\nInjected. Reason: injected.', '--issue', '70', '--principle', 'Zero cognitive tax', '--body', 'Reason: r.'], { cwd: nlCwd });
  ok('append refuses a --title carrying a line break, before writing', r.code === 2 && /^append: --title is one line/.test(r.err) && read(path.join(nlCwd, 'DECISIONS.md')) === nlBefore, r.err);
  r = docket(['append', '--title', 'Plain title', '--issue', '70\n### R66. Injected (issue #1)', '--principle', 'Zero cognitive tax', '--body', 'Reason: r.'], { cwd: nlCwd });
  ok('append refuses an --issue carrying a line break', r.code === 2 && /^append: --issue is one line/.test(r.err) && read(path.join(nlCwd, 'DECISIONS.md')) === nlBefore, r.err);
  r = docket(['append', '--title', 'Plain title', '--issue', '70', '--principle', 'Zero cognitive tax', '--edge', 'refines R2 (x\n### R66. Injected (issue #1))', '--body', 'Reason: r.'], { cwd: nlCwd });
  ok('append refuses an --edge whose qualifier carries a line break', r.code === 2 && /^append: --edge ".*" is one line/.test(r.err) && read(path.join(nlCwd, 'DECISIONS.md')) === nlBefore, r.err);
  r = docket(['append', '--title', 'Plain title', '--issue', '70', '--principle', 'Zero cognitive tax', '--body', 'Reason: r.\n### R3. A second R3 (issue #1)\nPrinciple: Zero cognitive tax.\nReason: spliced.'], { cwd: nlCwd });
  ok('append refuses a --body line that is an entry heading (an existing id, so the phantom guard is not what refuses it)', r.code === 2 && /^append: --body may not carry an entry or section heading line/.test(r.err) && read(path.join(nlCwd, 'DECISIONS.md')) === nlBefore, r.err);
  r = docket(['append', '--title', 'Plain title', '--issue', '70', '--principle', 'Zero cognitive tax', '--body', 'Reason: r.\n## B. A section opened from a body'], { cwd: nlCwd });
  ok('append refuses a --body line that is a section heading', r.code === 2 && /^append: --body may not carry an entry or section heading line/.test(r.err) && read(path.join(nlCwd, 'DECISIONS.md')) === nlBefore, r.err);
  r = docket(['append', '--title', 'Plain title', '--issue', '70', '--principle', 'Zero cognitive tax', '--body', 'Reason: r.\n### not an entry heading, a stray line\nmore.'], { cwd: nlCwd });
  ok('…while a `### ` line that is not an entry heading is body text and is accepted (FORMAT.md 2)', r.code === 0 && /check: ok/.test(r.out) && read(path.join(nlCwd, 'DECISIONS.md')).includes('\n### not an entry heading, a stray line\n'), r.out + r.err);
  // a file the baseline does not list has an allowance of 0 while the comment is present (FORMAT.md 9): the ratchet is per ledger, not per file
  const unl = tempRepo(d => fs.writeFileSync(path.join(d, 'test', 'fixture', 'second.js'), '// R6 governs this file; a bare ' + SEC + '9 here is a bare cite\n'));
  r = docket(['check'], { cwd: unl });
  ok('check 4: a governed file absent from a present baseline fails at its first bare cite with allowance 0, and app.js keeps its own allowance', r.code === 1 && /^test\/fixture\/second\.js:1  check 4: bare-§ cites: 1 > allowance 0 for second\.js$/m.test(r.out) && !/allowance \d+ for app\.js/.test(r.out), r.out);
  r = docket(['append', '--baseline'], { cwd: path.join(unl, 'test', 'fixture') });
  ok('…and append --baseline lists it beside app.js, after which check passes', r.code === 0 && /^<!-- docket: bare-cites app\.js=3 second\.js=1 -->$/m.test(r.out) && /check: ok/.test(r.out), r.out + r.err);
  // three appends at once: each writes its own entry with its own id — before the lock, one was silently carried away
  // while every caller was told "check: ok" (D4: a record that can be rewritten proves nothing about what was tried)
  // Six at once, three rounds: one round of three let the loss through about one run in six, because the
  // caller that loses is the one whose lock a *finishing* append unlinked, and that ordering is not every run's.
  const RACERS = 6, ROUNDS = 3;
  let raceWhy = '', raceOk = true, raceLast = null;
  for (let round = 1; round <= ROUNDS && raceOk; round++) {
    const race1 = tempRepo(), race1Cwd = path.join(race1, 'test', 'fixture');
    raceLast = race1;
    const raceSh = cp.spawnSync('bash', ['-c',
      'pids=""; for n in $(seq 1 ' + RACERS + '); do node "$1" append --title "Racer $n" --issue "6$n" --principle "Zero cognitive tax" --body "Reason: r$n." >/dev/null 2>&1 & pids="$pids $!"; done; for p in $pids; do wait $p; echo "exit=$?"; done',
      'x', CORE], { cwd: race1Cwd, encoding: 'utf8' });
    const raceCodes = raceSh.stdout.split('\n').filter(Boolean).map(l => Number(l.replace('exit=', '')));
    const raceIdx = JSON.parse(docket(['index'], { cwd: race1Cwd }).out);
    const raceTitles = raceIdx.rulings.filter(r => /^Racer /.test(r.title)).map(r => r.title).sort().join(',');
    const want = Array.from({ length: RACERS }, (_, k) => 'Racer ' + (k + 1)).sort().join(',');
    const lockLeft = fs.readdirSync(race1Cwd).filter(f => /\.lock$/.test(f));
    if (!(raceCodes.length === RACERS && raceCodes.every(c => c === 0) && raceIdx.rulings.length === 9 + RACERS
          && raceTitles === want && new Set(raceIdx.rulings.map(x => x.id)).size === 9 + RACERS && !lockLeft.length)) {
      raceOk = false;
      raceWhy = 'round ' + round + ': ' + JSON.stringify([raceCodes, raceTitles, raceIdx.rulings.length, lockLeft]);
    }
  }
  ok('six appends at once, three rounds: every one succeeds, every entry is in the ledger with its own id, and no lock is left behind — none carried away', raceOk, raceWhy);
  r = docket(['check'], { cwd: raceLast });
  ok('…and the ledger they wrote together passes check', r.code === 0 && /check: ok/.test(r.out), r.out + r.err);
  // --edge writes the slash-joined form the grammar reads (FORMAT.md 5)
  const sl2 = tempRepo(), sl2Cwd = path.join(sl2, 'test', 'fixture');
  r = docket(['append', '--title', 'Two targets at once', '--issue', '64', '--principle', 'Zero cognitive tax', '--edge', 'keeps R1/R2', '--body', 'Reason: r.'], { cwd: sl2Cwd });
  const sl2j = JSON.parse(docket(['index'], { cwd: sl2Cwd }).out).rulings.find(x => x.id === 'R9');
  ok('append --edge "keeps R1/R2" writes the slash-joined form and parses back as one edge per target, sharing the clause', r.code === 0 && /^### R9\. Two targets at once \(issue #64; keeps R1\/R2\)$/m.test(read(path.join(sl2Cwd, 'DECISIONS.md'))) && sl2j.edges.length === 2 && sl2j.edges.map(e => e.to).join(',') === 'R1,R2' && sl2j.edges.every(e => e.verb === 'keeps') && /check: ok/.test(r.out), r.out + r.err);
  r = docket(['append', '--title', 'A target that is not there', '--issue', '64', '--principle', 'Zero cognitive tax', '--edge', 'keeps R1/R40', '--body', 'Reason: r.'], { cwd: sl2Cwd });
  ok('…and a slash-joined edge naming a ruling that does not exist is refused by that id', r.code === 2 && /names R40, which is not in/.test(r.err), r.err);
  // the contract line's numeral is a ruling number: `contract from R0` names no entry, so it binds none (FORMAT.md 2, 11)
  const c0l = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', '<!-- docket: contract from R8 -->', '<!-- docket: contract from R0 -->'));
  const c0j = JSON.parse(docket(['index'], { cwd: path.join(c0l, 'test', 'fixture') }).out);
  r = docket(['check'], { cwd: c0l });
  ok('a contract line numbered 0 is no contract line: it binds nothing, and the loose entries stay loose', c0j.contractFrom.R === undefined && r.code === 0 && !/check 6:/.test(r.out), JSON.stringify(c0j.contractFrom) + r.out);
  // no principles list, asked for JSON: one exit code for both branches (FORMAT.md 10)
  const npText = docket(['principles', '--ledger', path.join(ROOT, 'test', 'fixture', 'history', 'DECISIONS.v1.md')]);
  const npJson = docket(['principles', '--json', '--ledger', path.join(ROOT, 'test', 'fixture', 'history', 'DECISIONS.v1.md')]);
  ok('principles: a ledger with no list exits 1 in text and 1 in JSON — the two branches never disagree about whether it found one', npText.code === 1 && /no principles list found/.test(npText.out) && npJson.code === 1 && JSON.parse(npJson.out).list.length === 0 && JSON.parse(npJson.out).source === null, JSON.stringify([npText.code, npJson.code, npJson.out]));
  const pText = docket(['principles'], { cwd: FIX }), pJson = docket(['principles', '--json'], { cwd: FIX });
  ok('…and a ledger with a list exits 0 in both', pText.code === 0 && pJson.code === 0 && JSON.parse(pJson.out).list.length === 3, JSON.stringify([pText.code, pJson.code]));
  // a usage error is the command not being understood, so it answers in text on stderr whatever the flags say (FORMAT.md 13)
  for (const [name, args] of [['an unknown id', ['governs', 'Z999', '--json']], ['an option the subcommand does not take', ['check', '--ledger', 'docs/DECISIONS.md', '--json']], ['a missing required flag', ['append', '--issue', '1', '--principle', 'Zero cognitive tax', '--body', 'x. Reason: r.', '--json']]]) {
    const ue = docket(args);
    ok('usage error (' + name + ') is plain text on stderr with exit 2, and prints nothing on stdout, with --json as without it', ue.code === 2 && ue.out === '' && ue.err.trim().length > 0 && !/^[[{]/.test(ue.err.trim()), JSON.stringify([ue.code, ue.out, ue.err.slice(0, 60)]));
  }
  // no ledger and asked for JSON, and the shape of the whole parse (FORMAT.md 15)
  const njKeys = Object.keys(JSON.parse(docket(['near', '--json'], { input: nearInput(APP, 'makeToolbar(') }).out));
  ok('near --json prints exactly the eleven fields the grammar names, in order, and no others', njKeys.join(',') === 'ledger,file,mode,anchors,region,rulings,more,edges,addenda,specCites,notice', njKeys.join(','));
  const njOne = JSON.parse(docket(['near', '--json'], { input: nearInput(APP, 'makeToolbar(') }).out);
  ok('…and its addenda and specCites carry what the text mode prints, not just a key', njOne.addenda.length === 1 && njOne.addenda[0].id === 'R2' && njOne.addenda[0].dates.join() === '2026-09-11' && njOne.specCites.length === 1 && njOne.specCites[0].doc === 'UIUX' && njOne.specCites[0].num === '4.5' && njOne.specCites[0].title === 'The minimum', JSON.stringify([njOne.addenda, njOne.specCites]));
  // the witness answers in JSON too — --json on every subcommand, the one with no subcommand included
  const wj = docket(['--json'], { cwd: FIX }), wjo = JSON.parse(wj.out);
  ok('the witness prints its whole result as one object and nothing else, with the same exit code as its text', wj.code === 1 && Object.keys(wjo).join(',') === 'ok,ledgers,specRows,info,failures' && wjo.ok === false && wjo.failures.length === 1 && wjo.failures[0].check === 'spec-check' && wjo.failures[0].k === 'a', wj.out);
  const wjRoot = docket(['--json']), wjr = JSON.parse(wjRoot.out);
  ok('…and at the root it is ok, over both ledgers, with no failures', wjRoot.code === 0 && wjr.ok === true && wjr.ledgers === 2 && wjr.failures.length === 0, wjRoot.out);
  // a project directory genuinely narrower than the git root bounds the walk (FORMAT.md 1): the ledger above it is not reached
  const pb = tempRepo(d => fs.mkdirSync(path.join(d, 'test', 'fixture', 'a', 'b'), { recursive: true }));
  const pbDeep = path.join(pb, 'test', 'fixture', 'a', 'b');
  fs.writeFileSync(path.join(pbDeep, 'deep.js'), 'const d = 1; // R6 governs this line\n');
  const pbPlain = docket(['near'], { cwd: pb, input: nearInput(path.join(pbDeep, 'deep.js'), 'const d = 1') });
  const pbBound = docket(['near'], { cwd: pb, input: nearInput(path.join(pbDeep, 'deep.js'), 'const d = 1'), env: { CLAUDE_PROJECT_DIR: pbDeep } });
  ok('near: a project directory narrower than the git root bounds the walk — the ledger two directories above it is not reached, and without it the same edit finds R6', /^  R6  /m.test(pbPlain.out) && pbBound.code === 0 && pbBound.out === '' && pbBound.err === '', pbPlain.out + '|' + pbBound.out);
  const pbCheck = docket(['check'], { cwd: pbDeep, env: { CLAUDE_PROJECT_DIR: pbDeep } });
  ok('…and check under that bound enumerates the tree it was given, not the one above it', pbCheck.code === 0 && /check: ok \(0 ledgers, \d+ governed-tree files\)/.test(pbCheck.out), pbCheck.out);
  // status surfaces a verdict that is on disk, not only the absence of one (D11)
  const sv = tempRepo(), svCwd = path.join(sv, 'test', 'fixture');
  fs.mkdirSync(path.join(sv, '.docket'), { recursive: true });
  fs.writeFileSync(path.join(sv, '.docket', 'verdict.json'), JSON.stringify({ last: { verdict: 'FAIL', hash: 'abc', failures: 3, at: '2026-09-14T12:00:00.000Z', session: 'sv' }, sessions: { sv: { blocks: 2, history: [4, 3], surfaced: false } } }));
  const svOut = docket(['status'], { cwd: svCwd }), svJson = JSON.parse(docket(['status', '--json'], { cwd: svCwd }).out);
  ok('status names the verdict on disk with its word, its time and its count — not just "none"', /^Last verdict: FAIL at 2026-09-14T12:00:00\.000Z \(3 located failures\)$/m.test(svOut.out) && svJson.lastVerdict.verdict === 'FAIL' && svJson.lastVerdict.failures === 3 && svJson.surfaced === false, svOut.out);
  // an empty ledger's subtree is ungoverned for every check, not only the one the earlier test planted
  const eb = tempRepo(d => { fs.writeFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '# Empty\n'); fs.appendFileSync(path.join(d, 'test', 'fixture', 'app.js'), 'const bare = 1; // ' + SEC + '9 a bare cite under an empty ledger\nconst spec = 2; // UIUX ' + SEC + '9.9 names no heading\n'); });
  r = docket(['check'], { cwd: eb });
  ok('check: under an empty ledger neither the bare-cite ratchet nor the spec-cite check runs — no check runs at all', r.code === 0 && !/  check [1-7]:/.test(r.out) && /no entries; its subtree is ungoverned/.test(r.out), r.out);
  // the frozen versions are what the fixture says they are, so a later phase's diff has the ground it was promised
  const cur = read(path.join(FIX, 'DECISIONS.md')), v1 = read(path.join(FIX, 'history', 'DECISIONS.v1.md')), v2 = read(path.join(FIX, 'history', 'DECISIONS.v2.md'));
  const heads = t => t.split('\n').filter(l => /^### /.test(l));
  ok('history/DECISIONS.v1.md is the current ledger without R8 and without R2\'s addendum, and nothing else', heads(v1).length === heads(cur).length - 1 && !/^### R8\./m.test(v1) && !/^> Addendum /m.test(v1) && /^> Addendum /m.test(cur), heads(v1).length + ' vs ' + heads(cur).length);
  ok('history/DECISIONS.v2.md is the current ledger with R3\'s heading changed, and nothing else', heads(v2).length === heads(cur).length && /^### R3\. Fold similarity, by shape and by size \(issue #4\)$/m.test(v2) && heads(v2).filter((h, i) => h !== heads(cur)[i]).length === 1, JSON.stringify(heads(v2).filter((h, i) => h !== heads(cur)[i])));
  // CI runs the witness and the docket, on a pinned runtime, for a push and a pull request
  const ci = read(path.join(ROOT, '.github', 'workflows', 'ci.yml'));
  ok('CI runs the witness and then the docket itself, on both a push and a pull request, with the runtime pinned and no step allowed to pass while failing', /^on:\n  push:\n  pull_request:$/m.test(ci) && /node-version: 20/.test(ci) && /run: node test\/docket\.js/.test(ci) && /run: node bin\/docket\.js/.test(ci) && !/continue-on-error/.test(ci), ci);
  // a multi-line edit finds its window whichever newline the file and the host use (FORMAT.md 1)
  const ml = tempRepo(), mlApp = path.join(ml, 'test', 'fixture', 'app.js');
  const mlTwo = read(mlApp).split('\n').slice(40, 42).join('\n');      // lines 41 and 42, joined the way a host writes them
  const mlLf = docket(['near'], { cwd: ml, input: nearInput(mlApp, mlTwo) });
  const crFile = tempRepo(d => { const q = path.join(d, 'test', 'fixture', 'app.js'); fs.writeFileSync(q, read(q).replace(/\n/g, '\r\n')); });
  const crApp = path.join(crFile, 'test', 'fixture', 'app.js');
  const mlCr = docket(['near'], { cwd: crFile, input: nearInput(crApp, mlTwo) });
  ok('near: a multi-line edit whose old_string is joined with LF finds the same window in a CRLF file as in an LF one', mlLf.code === 0 && /^  R6  /m.test(mlLf.out) && mlCr.out === mlLf.out, mlLf.out + '|' + mlCr.out);
  const mlCrNeedle = docket(['near'], { cwd: crFile, input: nearInput(crApp, mlTwo.replace(/\n/g, '\r\n')) });
  ok('…and an old_string carrying the file\'s own CRLF finds it too: both sides are normalised, not one', mlCrNeedle.out === mlLf.out, mlCrNeedle.out);
  // near reads what check can read: a binary file is not a governed file (FORMAT.md 1, 15)
  const binDir = tempRepo(d => fs.writeFileSync(path.join(d, 'test', 'fixture', 'blob.dat'),
    Buffer.concat([Buffer.from('R6 lives here\n'), Buffer.from([0]), Buffer.from('\nand R2 too\n')])));
  const blob = path.join(binDir, 'test', 'fixture', 'blob.dat');
  const binNear = docket(['near'], { cwd: binDir, input: nearInput(blob, 'R6 lives') });
  const binCheck = docket(['check'], { cwd: binDir });
  ok('near: a file holding a NUL byte is not governed — near is silent on it, as check is', binNear.code === 0 && binNear.out === '' && binNear.err === '' && !/blob\.dat/.test(binCheck.out), binNear.out + '|' + binNear.err + '|' + binCheck.out);
  ok('…and the binary file is not counted in the governed tree either', /check: ok \(1 ledger, 11 governed-tree files\)/.test(binCheck.out), binCheck.out);
  // one governed file under a ledger is a file, not files
  const LONE_LEDGER2 = '# Rulings\n\nPrinciples:\n\n- **Capture precedes structure**\n\n### R1. One ruling governs this tree (issue #85)\nPrinciple: Capture precedes structure.\nA file reached through a link is a file. Reason: one tree, one answer.\n';
  const LONE_LEDGER = '# Rulings\n\nPrinciples:\n\n- Capture precedes structure\n\n### R1. One file is governed here\nPrinciple: Capture precedes structure.\nThe tree below holds one file that cites it. Reason: the count is a boundary.\n';
  const oneDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-one-'));
  fs.writeFileSync(path.join(oneDir, 'DECISIONS.md'), LONE_LEDGER);
  // the ledger is itself a file of the tree it governs, so one file is a tree holding the ledger alone
  sh('git', ['init', '-q', '-b', 'main'], oneDir);
  sh('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A'], oneDir);
  sh('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'one'], oneDir);
  r = docket(['check'], { cwd: oneDir });
  ok('check: a tree with one governed-tree file says file, not files', /^check: ok \(1 ledger, 1 governed-tree file\)$/m.test(r.out), r.out);
  // a ruling cited only by another ruling's edge is cited nowhere: an edge is a reference, not a code cite (FORMAT.md 8)
  const edgeOnly = tempRepo(d => {
    const q = path.join(d, 'test', 'fixture', 'DECISIONS.md');
    fs.appendFileSync(q, '\n### R9. Only an edge names it (issue #74)\nPrinciple: Capture precedes structure.\nA ruling no file cites. Waives R8. Reason: r.\n');
  });
  r = docket(['status'], { cwd: path.join(edgeOnly, 'test', 'fixture') });
  ok('status: an in-edge is not a code cite, so a ruling only an edge names is cited nowhere', /^Cited nowhere: [^\n]*\bR9\b/m.test(r.out), r.out);
  r = docket(['governs', 'R9'], { cwd: path.join(edgeOnly, 'test', 'fixture') });
  ok('…and governs R9 names the edge that points at it while listing no code cite', /R9/.test(r.out) && /waives R8/.test(r.out) && !/^  test\/fixture\//m.test(r.out), r.out);
  // an edge whose ends sit under different prefixes of one ledger
  const xp = tempRepo(d => {
    const q = path.join(d, 'test', 'fixture', 'DECISIONS.md');
    fs.appendFileSync(q, '\n### R9. A ruling that waives an A (issue #75; waives A1)\nPrinciple: Capture precedes structure.\nThe two prefixes are one ledger. Reason: r.\n');
  });
  const xpj = JSON.parse(docket(['index'], { cwd: path.join(xp, 'test', 'fixture') }).out).rulings.find(x => x.id === 'R9');
  ok('an edge may cross prefixes inside one ledger: R9 waives A1 parses, and check accepts it', xpj.edges.some(e => e.verb === 'waives' && e.to === 'A1') && docket(['check'], { cwd: xp }).code === 0, JSON.stringify(xpj.edges));
  // check 7's two skip reasons are told apart: a ledger with no committed version of its own
  const nc = tempRepo(d => fs.rmSync(path.join(d, 'test', 'fixture', 'DECISIONS.md')));
  fs.writeFileSync(path.join(nc, 'test', 'fixture', 'DECISIONS.md'), read(path.join(FIX, 'DECISIONS.md')));
  r = docket(['check'], { cwd: nc });
  ok('check 7: a ledger the tree holds but no commit does is skipped, and the skip is said', r.code === 0 && /check 7 skipped/.test(r.out), r.out);
  // the enumeration root with neither the variable nor a git root: the nearest ledger's home (FORMAT.md 1)
  const noGit = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-nogit-'));
  fs.mkdirSync(path.join(noGit, 'sub', 'deeper'), { recursive: true });
  fs.writeFileSync(path.join(noGit, 'sub', 'DECISIONS.md'), LONE_LEDGER);
  fs.writeFileSync(path.join(noGit, 'sub', 'deeper', 'a.js'), 'x();   // R1\n');
  r = docket(['check'], { cwd: path.join(noGit, 'sub', 'deeper'), env: { CLAUDE_PROJECT_DIR: '' } });
  ok('check outside a git repository and with no project directory enumerates from the nearest ledger\'s home', r.code === 0 && /^check: ok \(1 ledger, 2 governed-tree files\)$/m.test(r.out), r.out + r.err);
  // spec-check (b) against the formula itself, re-derived here and not borrowed from the core
  const srgb = c => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = hex => { const h = hex.replace('#', ''); const n = i => parseInt(h.slice(i * 2, i * 2 + 2), 16); return 0.2126 * srgb(n(0)) + 0.7152 * srgb(n(1)) + 0.0722 * srgb(n(2)); };
  const ratioHere = (a, b) => { const la = lum(a), lb = lum(b); const hi = Math.max(la, lb), lo = Math.min(la, lb); return (hi + 0.05) / (lo + 0.05); };
  const here = Math.round(ratioHere('#1b1b1b', '#f4efe6') * 100) / 100;
  ok('spec-check (b) computes WCAG relative luminance: the fixture\'s own row, re-derived here from the formula, is 15.04', here === 15.04 && /15\.04:1/.test(read(path.join(FIX, 'UIUX.md'))), String(here));
  const wrongRow = tempRepo(d => { const q = path.join(d, 'test', 'fixture', 'UIUX.md'); fs.writeFileSync(q, read(q).replace('15.04:1', String(Math.round((here + 0.02) * 100) / 100) + ':1')); });
  r = docket(['spec-check'], { cwd: path.join(wrongRow, 'test', 'fixture') });
  ok('…and a row two hundredths off the re-derived value is a failure', r.code === 1 && /15\.04/.test(r.out), r.out);
  // the recorded expectation files are the text FORMAT.md 15 describes, not merely whatever near last printed
  const hdr = /^Governed here \([^,]+, ±20 lines of [^:]+:\d+\):(?: |$)/m;
  ok('the recorded near expectations open with the header FORMAT.md 15 states', hdr.test(expected('near-41.txt')) && hdr.test(expected('near-empty-window.txt')) && /^Governed here \([^,]+, ±20 lines of [^:]+:\d+(, \d+)+\):$/m.test(expected('near-union.txt')) && /^Governed here \([^,]+, whole file [^)]+\):$/m.test(expected('near-whole.txt')), expected('near-41.txt').split('\n')[0] + '|' + expected('near-whole.txt').split('\n')[0]);
  ok('…and each ends with the instruction line the window is for', ['near-41.txt', 'near-union.txt', 'near-whole.txt'].every(n => /Name the ruling you rely on before you edit\.$/m.test(expected(n).trimEnd())), expected('near-41.txt').trimEnd().split('\n').pop());
  // an option that lost its value does not take the next option's name as one
  const fp = tempRepo(), fpFix = path.join(fp, 'test', 'fixture');
  const fpBefore = read(path.join(fpFix, 'DECISIONS.md'));
  r = docket(['append', '--title', '--issue', '55', '--principle', 'Zero cognitive tax', '--body', 'Reason: r.'], { cwd: fpFix });
  ok('append: a --title whose value the shell dropped is a usage error, not a ruling titled "--issue"', r.code === 2 && /--title needs a value/.test(r.err) && r.out === '' && read(path.join(fpFix, 'DECISIONS.md')) === fpBefore, r.code + '|' + r.err + r.out);
  r = docket(['append', '--title', 'A real title', '--issue', '--principle', 'Zero cognitive tax', '--body', 'Reason: r.'], { cwd: fpFix });
  ok('…and so is a dropped --issue, whichever option follows it', r.code === 2 && /--issue needs a value/.test(r.err) && read(path.join(fpFix, 'DECISIONS.md')) === fpBefore, r.code + '|' + r.err);
  r = docket(['append', '--title', 'A real title', '--issue', '56', '--principle', 'Zero cognitive tax', '--body'], { cwd: fpFix });
  ok('…and an option left last with nothing after it', r.code === 2 && /--body needs a value/.test(r.err) && read(path.join(fpFix, 'DECISIONS.md')) === fpBefore, r.code + '|' + r.err);
  r = docket(['check', '--no-such-option'], { cwd: fp });
  ok('an option the core does not know is a usage error, not a flag silently passed over', r.code === 2 && /unknown option "--no-such-option"/.test(r.err), r.code + '|' + r.err);
  r = docket(['--help']);
  ok('--help prints the usage and exits 0, as help and -h do', r.code === 0 && /^docket — the ledger of rulings/m.test(r.out) && /^  docket near /m.test(r.out) && r.out === docket(['help']).out && r.out === docket(['-h']).out, r.out.split('\n')[0]);
  // the docket opens a stretch of work: a state file it cannot use informs, and never throws (D1)
  const stDir = tempRepo();
  const stFile = path.join(stDir, '.docket', 'verdict.json');
  fs.mkdirSync(path.dirname(stFile), { recursive: true });
  const stShapes = ['not valid json {{{', '{"last": {"session": "s1", "verdict": "FAIL", "at": "x", "failures": 1}}', '[]', '{"sessions": null, "last": 3}', 'null'];
  let stOk = true, stWhy = '';
  for (const shape of stShapes) {
    fs.writeFileSync(stFile, shape);
    const sr = docket(['status'], { cwd: path.join(stDir, 'test', 'fixture') });
    if (sr.code !== 0 || /TypeError|at Object\.|Cannot read properties/.test(sr.err)) { stOk = false; stWhy = shape + ' → ' + sr.code + ' ' + sr.err; break; }
  }
  ok('status: a state file that is unusable in any of five ways still opens the docket, with no stack trace', stOk, stWhy);
  fs.writeFileSync(stFile, JSON.stringify({ last: { session: 'sess-A', verdict: 'FAIL', at: 'x', failures: 1 }, sessions: { 'sess-A': { blocks: 6, surfaced: true } } }));
  r = docket(['status'], { cwd: path.join(stDir, 'test', 'fixture') });
  ok('…and a state file that does record the session says the stretch is surfaced', r.code === 0 && /SURFACED/.test(r.out), r.out);
  const twiceB = tempRepo(d => { const q = path.join(d, 'test', 'fixture', 'DECISIONS.md'); fs.writeFileSync(q, read(q).replace('<!-- docket: bare-cites app.js=3 -->', '<!-- docket: bare-cites app.js=3 app.js=999 -->')); });
  r = docket(['check'], { cwd: twiceB });
  ok('check 4: a file listed twice in the baseline is a fault, not a silent last-wins allowance', r.code === 1 && /check 4: bare-cites baseline: app\.js is listed twice; a file carries one allowance/.test(r.out), r.out);
  // check 7 compares the two versions line for line, not byte for byte: a checkout that changed only the
  // line endings is not an amendment (FORMAT.md 1, 13). Every other line-ending test commits the converted
  // file, so the working tree and the committed version are in one style and this comparison never runs.
  const eolC = tempRepo();
  const eolLedger = path.join(eolC, 'test', 'fixture', 'DECISIONS.md');
  fs.writeFileSync(eolLedger, read(eolLedger).replace(/\n/g, '\r\n'));
  r = docket(['check'], { cwd: eolC });
  ok('check 7: a ledger the checkout rewrote to CRLF is not an amendment of the version committed with LF', r.code === 0 && !/check 7: /.test(r.out), r.out);
  fs.appendFileSync(eolLedger, '\r\n### R9. Appended under CRLF (issue #76)\r\nPrinciple: Capture precedes structure.\r\nAppended, not amended. Reason: r.\r\n');
  r = docket(['check'], { cwd: eolC });
  ok('…and an entry appended to that CRLF working copy is an append, not a change to what came before', r.code === 0 && !/check 7: /.test(r.out), r.out);
  fs.writeFileSync(eolLedger, read(eolLedger).replace('The toolbar replaces the long-press menu', 'The toolbar replaced the long-press menu'));
  r = docket(['check'], { cwd: eolC });
  ok('…while a heading edited in that same CRLF copy is still caught: the line endings are normalised, the words are not', r.code === 1 && /check 7: R6: heading changed/.test(r.out), r.out);
  // index's whole shape, as every other subcommand's --json shape is pinned: an extra or renamed top-level
  // field is a change to the parse the core hands out, and is said here rather than found by a reader later.
  const ixShape = JSON.parse(docket(['index'], { cwd: FIX }).out);
  ok('index prints the whole parse and nothing else: the ledger, its prefixes, the two preamble directives, rulings, sections, specs', Object.keys(ixShape).join(',') === 'ledger,prefixes,contractFrom,baseline,rulings,sections,specs', Object.keys(ixShape).join(','));
  ok('…and index takes --json like every other subcommand, printing the same object', docket(['index', '--json'], { cwd: FIX }).out === docket(['index'], { cwd: FIX }).out, docket(['index', '--json'], { cwd: FIX }).err);
  // the table's row names replace_all false, and the payload a host sends always carries the field
  const raFalse = docket(['near'], { cwd: FIX, input: nearInput(APP, "  el.classList.add('note');", { replace_all: false }) });
  ok('near: many matches with replace_all given as false is silent, exactly as omitting it is', raFalse.code === 0 && raFalse.out === '' && raFalse.err === '' && docket(['near'], { cwd: FIX, input: nearInput(APP, "  el.classList.add('note');") }).out === '', raFalse.out + '|' + raFalse.err);
  // D2's reason estimates one citing line per twelve; its addendum measures what this fixture actually
  // yields, and the ledger keeps both, the later one winning. The measurement is repeated here so the
  // fixture cannot drift away from the addendum that records it, and so the two numbers stay told apart.
  const denLines = read(APP).replace(/\n$/, '').split('\n'), denN = denLines.length;   // the final newline ends the last line; it opens no other
  const denIds = new Set(JSON.parse(docket(['index'], { cwd: FIX }).out).rulings.map(x => x.id));
  const denCited = l => (l.match(/\b[A-Za-z]+[1-9][0-9]*\b/g) || []).filter(x => denIds.has(x));
  const denCiting = denLines.map((l, k) => [k + 1, denCited(l)]).filter(([, c]) => c.length);
  const denWindow = a => { const seen = new Set(); for (let k = Math.max(1, a - 20); k <= Math.min(denN, a + 20); k++) for (const id of denCited(denLines[k - 1])) seen.add(id); return seen.size; };
  const denAnchored = denCiting.map(([a]) => denWindow(a)), denEvery = denLines.map((_, k) => denWindow(k + 1));
  const denMean = xs => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 100) / 100;
  ok('the fixture is built at the density D2\'s addendum measures — one citing line per 13, not the one per 12 its reason estimated — and never holds six rulings in a window, nor reaches the cap; the mean over its 260 lines is 2.68', denCiting.length === 20 && Math.round(denN / denCiting.length) === 13 && Math.max(...denEvery) === 5 && Math.min(...denEvery) === 0 && Math.max(...denAnchored) === 5 && Math.min(...denAnchored) === 2 && denMean(denAnchored) === 3.5 && denMean(denEvery) === 2.68 && denN === 260, JSON.stringify([denN, denCiting.length, Math.min(...denAnchored), Math.max(...denAnchored), denMean(denAnchored), denMean(denEvery)]));
  // a ledger with two line endings is not written to: the write would have to rewrite lines this
  // entry does not touch, and check 7 compares line for line, so it could not see that it had (D4)
  const mixed = tempRepo(d => {
    const q = path.join(d, 'test', 'fixture', 'DECISIONS.md');
    const ls = read(q).split('\n');
    fs.writeFileSync(q, ls.map((l, k) => k === 2 ? l + '\r' : l).join('\n'));   // one line of eleven ends CRLF
  });
  const mixedCwd = path.join(mixed, 'test', 'fixture'), mixedBefore = fs.readFileSync(path.join(mixedCwd, 'DECISIONS.md'));
  r = docket(['append', '--title', 'Into a mixed file', '--issue', '77', '--principle', 'Zero cognitive tax', '--body', 'Reason: r.'], { cwd: mixedCwd });
  ok('append refuses a ledger that ends some lines with CRLF and some with LF, rather than rewriting every line', r.code === 2 && /ends some lines with CRLF and some with LF/.test(r.err) && fs.readFileSync(path.join(mixedCwd, 'DECISIONS.md')).equals(mixedBefore), r.code + '|' + r.err);
  r = docket(['append', '--addendum', 'R5', '--text', 'noted.'], { cwd: mixedCwd });
  ok('…and an addendum is refused on the same ground, for the same reason', r.code === 2 && /ends some lines with CRLF and some with LF/.test(r.err) && fs.readFileSync(path.join(mixedCwd, 'DECISIONS.md')).equals(mixedBefore), r.code + '|' + r.err);
  // the walk that stands in for a git tree is bounded: a huge directory that is not a repository
  // says so instead of reading for minutes (the docket opens a stretch of work, D1)
  const wide = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-wide-'));
  fs.mkdirSync(path.join(wide, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(wide, 'sub', 'DECISIONS.md'), '# Rulings\n\nPrinciples:\n\n- Capture precedes structure\n\n### R1. One ruling (issue #78)\nPrinciple: Capture precedes structure.\nThe tree above it is wide. Reason: r.\n');
  fs.writeFileSync(path.join(wide, 'sub', 'a.js'), 'x();   // R1\n');
  const wideFill = path.join(wide, 'fill');
  fs.mkdirSync(wideFill);
  for (let k = 0; k < 20050; k++) fs.writeFileSync(path.join(wideFill, 'f' + k + '.txt'), 'x\n');
  const wideStart = Date.now();
  r = docket(['check'], { cwd: path.join(wide, 'sub'), env: { CLAUDE_PROJECT_DIR: wide } });
  ok('check under a directory that is not a repository and holds more than twenty thousand entries says so, and does not read them all', r.code === 2 && /holds more than 20000 entries and is not a git repository/.test(r.err) && Date.now() - wideStart < 30000, r.code + '|' + r.err.slice(0, 120));
  fs.rmSync(wide, { recursive: true, force: true });
  // FORMAT.md 6 states a rule that ends — "pending until a later ruling has an edge into the entry
  // (any verb)" — and a ledger shows only the side it happens to be on. Both sides are built here.
  const b3AddCwd = path.join(tempRepo(), 'test', 'fixture');
  const b3PendingOf = () => { const j = JSON.parse(docket(['status', '--json'], { cwd: b3AddCwd }).out); return j.pendingAddenda.map(a => a.id).sort().join(','); };
  const b3PendBefore = b3PendingOf();
  ok('status: an addendum with no later ruling naming its entry is pending', b3PendBefore === 'R2', b3PendBefore);
  for (const verb of ['keeps', 'extends', 'supersedes', 'refines', 'waives', 'reverses']) {
    const b3One = path.join(tempRepo(), 'test', 'fixture');
    const b3Ap = docket(['append', '--title', 'It names R2', '--issue', '81', '--principle', 'Zero cognitive tax', '--edge', verb + ' R2', '--body', 'Reason: r.'], { cwd: b3One });
    const b3After = JSON.parse(docket(['status', '--json'], { cwd: b3One }).out).pendingAddenda.map(a => a.id);
    ok('status: once a later ruling has an edge into the entry — ' + verb + ', as any verb does — the addendum is no longer pending', b3Ap.code === 0 && !b3After.includes('R2'), b3Ap.err + JSON.stringify(b3After));
  }
  const b3Other = path.join(tempRepo(), 'test', 'fixture');
  docket(['append', '--title', 'It names R1, not R2', '--issue', '82', '--principle', 'Zero cognitive tax', '--edge', 'extends R1', '--body', 'Reason: r.'], { cwd: b3Other });
  ok('…while a later ruling that names some other entry leaves this one pending: the edge has to point at the entry', JSON.parse(docket(['status', '--json'], { cwd: b3Other }).out).pendingAddenda.some(a => a.id === 'R2'), docket(['status'], { cwd: b3Other }).out);
  // near reads what the walk reads, symlink or not: b3One file, b3One answer, in a tree with no git
  const b3Lk = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-link-'));
  fs.writeFileSync(path.join(b3Lk, 'DECISIONS.md'), LONE_LEDGER2);
  fs.writeFileSync(path.join(b3Lk, 'real.js'), 'const a = 1;   // R1\n');
  fs.symlinkSync(path.join(b3Lk, 'real.js'), path.join(b3Lk, 'link.js'));
  fs.symlinkSync(path.join(os.tmpdir(), 'docket-nowhere-' + process.pid), path.join(b3Lk, 'broken.js'));
  const b3LkNear = docket(['near'], { cwd: b3Lk, input: nearInput(path.join(b3Lk, 'link.js'), 'const a'), env: { CLAUDE_PROJECT_DIR: '' } });
  const b3LkGov = docket(['governs', 'R1'], { cwd: b3Lk, env: { CLAUDE_PROJECT_DIR: '' } });
  const b3LkChk = docket(['check'], { cwd: b3Lk, env: { CLAUDE_PROJECT_DIR: '' } });
  const b3LkReal = docket(['near'], { cwd: b3Lk, input: nearInput(path.join(b3Lk, 'real.js'), 'const a'), env: { CLAUDE_PROJECT_DIR: '' } });
  ok('a symlink to a file in the tree is that file for every command: near\'s window is the real file\'s with only the name changed, governs lists both, check counts both', b3LkNear.out === b3LkReal.out.replace(/\breal\.js\b/g, 'link.js') && /^  link\.js:1  /m.test(b3LkGov.out) && /^  real\.js:1  /m.test(b3LkGov.out) && /^check: ok \(1 ledger, 3 governed-tree files\)$/m.test(b3LkChk.out), b3LkNear.out + '|' + b3LkReal.out + '|' + b3LkGov.out + '|' + b3LkChk.out);
  ok('…and a symlink that leads nowhere is no file at all', !/broken\.js/.test(b3LkChk.out) && docket(['near'], { cwd: b3Lk, input: nearInput(path.join(b3Lk, 'broken.js'), 'x'), env: { CLAUDE_PROJECT_DIR: '' } }).out === '', b3LkChk.out);
  // a ledger carries nothing that changes what a reader is shown without changing what is written
  for (const [name, ch, shown] of [['an escape', '\u001b[31m', 'U+001B'], ['a right-to-left override', '\u202e', 'RLO'], ['a NUL', '\u0000', 'U+0000']]) {
    const b3Ug = tempRepo(d => { const q = path.join(d, 'test', 'fixture', 'DECISIONS.md'); fs.appendFileSync(q, '\n### R9. A heading carrying ' + ch + 'something (issue #83)\nPrinciple: Capture precedes structure.\nReason: r.\n'); });
    r = docket(['check'], { cwd: b3Ug });
    ok('check 2: an entry carrying ' + name + ' is named, not passed over', r.code === 1 && r.out.includes('check 2: R9: the text carries ' + shown), r.out);
  }
  // a bullet the principles grammar cannot read is said, not swallowed
  const b3Pb = tempRepo(d => { const q = path.join(d, 'test', 'fixture', 'PRD.md'); fs.writeFileSync(q, read(q).replace('- **Zero cognitive tax.**', '- Forgot to bold this one\n- **Zero cognitive tax.**')); });
  r = docket(['principles'], { cwd: path.join(b3Pb, 'test', 'fixture') });
  ok('principles: a bullet with no bolded name is reported, not silently dropped', r.code === 0 && /info  .*PRD\.md:\d+: a bullet with no bolded name/.test(r.out) && /Zero cognitive tax/.test(r.out), r.out);
  r = docket(['check'], { cwd: b3Pb });
  ok('…and check says it too, where the ledger is read', r.code === 0 && /a bullet with no bolded name in the principles list/.test(r.out), r.out);
  // b3One row, b3One ratio
  const b3TwoR = tempRepo(d => { const q = path.join(d, 'test', 'fixture', 'UIUX.md'); fs.writeFileSync(q, read(q).replace('15.04:1', 'AA needs 4.5:1; measured 15.04:1')); });
  r = docket(['spec-check'], { cwd: path.join(b3TwoR, 'test', 'fixture') });
  ok('spec-check (b): a row stating two ratios is refused rather than judged on whichever comes first', r.code === 1 && /a row states one ratio/.test(r.out), r.out);
  // a contrast row naming a colour with an alpha channel is refused, and the grammar allows 4 and 8 digits
  const b3AlphaRow = tempRepo(d => {
    const q = path.join(d, 'test', 'fixture', 'UIUX.md'), c = path.join(d, 'test', 'fixture', 'styles.css');
    fs.writeFileSync(c, read(c).replace('--ink: #1b1b1b;', '--ink: #1b1b1bff;'));
    fs.writeFileSync(q, read(q).replace('`#1b1b1b`', '`#1b1b1bff`'));
  });
  r = docket(['spec-check'], { cwd: path.join(b3AlphaRow, 'test', 'fixture') });
  ok('spec-check: an eight-digit hex is a colour the grammar allows, and a contrast row naming b3One is refused rather than recomputed without its alpha', r.code === 1 && /alpha/.test(r.out), r.out);
  // append writes, then checks: the entry is there even when the ledger as a whole does not pass
  const b3Wf = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'app.js'), 'const bad = 1;   // R99\n'));
  const b3WfCwd = path.join(b3Wf, 'test', 'fixture');
  r = docket(['append', '--title', 'Written while the tree is broken', '--issue', '84', '--principle', 'Zero cognitive tax', '--body', 'Reason: r.'], { cwd: b3WfCwd });
  ok('append: a check that fails b3After the write says so, exits 1, and the entry is written all the same — exit 1 does not mean nothing happened', r.code === 1 && /check: 1 failure\(s\) — the ledger is written; fix before you rely on it/.test(r.out) && read(path.join(b3WfCwd, 'DECISIONS.md')).includes('### R9. Written while the tree is broken'), r.out + r.err);
  const b3R5 = JSON.parse(docket(['index'], { cwd: FIX }).out).rulings.find(x => x.id === 'R5');
  ok('the fixture carries the sentence a later change is meant to make stale: R5 ties its tab count to the section count in the file, and the file states that count', /three tabs/.test(b3R5.body) && /section count in `app\.js`/.test(b3R5.body) && /const SECTIONS = \['now', 'next', 'later'\]/.test(read(APP)), b3R5.body);
  // a contract line naming a prefix no entry uses binds nothing, and a typo is exactly that
  const ctp = tempRepo(d => edit(d, 'test/fixture/DECISIONS.md', '<!-- docket: contract from R8 -->', '<!-- docket: contract from r8 -->'));
  r = docket(['check'], { cwd: ctp });
  ok('check 6: a contract line naming a prefix no entry uses is a fault, not a contract quietly turned off', r.code === 1 && /check 6: the contract line names prefix r, which no entry uses/.test(r.out) && /prefixes are A, R/.test(r.out), r.out);
  // an id is a name: governs reads one whatever its case, as query does
  const gcCwd = path.join(tempRepo(), 'test', 'fixture');
  const gcLower = docket(['governs', 'r6'], { cwd: gcCwd }), gcUpper = docket(['governs', 'R6'], { cwd: gcCwd });
  ok('governs resolves an id in any case, as query does', gcLower.code === 0 && gcUpper.code === 0 && gcLower.out === gcUpper.out && /^R6  /m.test(gcUpper.out), gcLower.code + '|' + gcLower.err + '|' + gcUpper.out.slice(0, 60));
  ok('…and an id no ledger holds is still refused by name', docket(['governs', 'r99'], { cwd: gcCwd }).code === 2, docket(['governs', 'r99'], { cwd: gcCwd }).err);
  // an edge target carries the numeral of an id: a leading zero names no entry, so it is no edge
  const lz = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '\n### R9. A leading zero is no id (issue #86; supersedes R03)\nPrinciple: Capture precedes structure.\nReason: r.\n'));
  const lzj = JSON.parse(docket(['index'], { cwd: path.join(lz, 'test', 'fixture') }).out).rulings.find(x => x.id === 'R9');
  r = docket(['check'], { cwd: lz });
  ok('an edge target with a leading zero is not an edge at all, exactly as such a cite is not a cite', !lzj.edges.length && !/check 5: edge R9 supersedes R03/.test(r.out), JSON.stringify(lzj.edges) + '|' + r.out);
  // a spec cite written without its space is a typo named, not a bare cite counted
  const glu = tempRepo(d => fs.appendFileSync(path.join(d, 'test', 'fixture', 'app.js'), 'const g = 1;   /* UIUX' + SEC + '4.5 the minimum */\n'));
  r = docket(['check'], { cwd: glu });
  ok('check 3: a spec cite with its space missing is named as the typo it is, not absorbed by the bare-cite ratchet', r.code === 1 && new RegExp('check 3: UIUX' + SEC + '4\\.5 is written without the space').test(r.out) && !/check 4: bare-/.test(r.out), r.out);
  // a ledger with no entries governs nothing, in both halves of the witness
  const esc = tempRepo(d => fs.writeFileSync(path.join(d, 'test', 'fixture', 'DECISIONS.md'), '# Empty\n'));
  r = docket(['spec-check'], { cwd: path.join(esc, 'test', 'fixture') });
  ok('spec-check honours the same exemption check does: no entries, no row read, and it says so', r.code === 0 && /no entries; its subtree is ungoverned and spec-check reads no row beside it/.test(r.out), r.out);
  // a row that means to assert a ratio and writes it in a shape the grammar does not read
  for (const shape of ['15.04 :1', '15.04: 1', '15.04 to 1']) {
    const badR = tempRepo(d => { const q = path.join(d, 'test', 'fixture', 'UIUX.md'); fs.writeFileSync(q, read(q).replace('15.04:1', shape)); });
    r = docket(['spec-check'], { cwd: path.join(badR, 'test', 'fixture') });
    ok('spec-check (b): a row naming two tokens whose ratio reads "' + shape + '" is named, not passed over as prose', r.code === 1 && /the ratio is not written as <n>:1/.test(r.out), r.out);
  }
  // the lock gives up and says so, which is the far side of its own wait
  const stale = tempRepo(), staleCwd = path.join(stale, 'test', 'fixture');
  fs.writeFileSync(path.join(staleCwd, 'DECISIONS.md.lock'), 'docket 999999\n');
  const staleBefore = read(path.join(staleCwd, 'DECISIONS.md')), t0 = Date.now();
  r = docket(['append', '--title', 'Waits for a lock nobody holds', '--issue', '87', '--principle', 'Zero cognitive tax', '--body', 'Reason: r.'], { cwd: staleCwd });
  const waited = Date.now() - t0;
  ok('append waits the five seconds it states and then says which lock is holding it, having written nothing', r.code === 2 && /is held by another append that has not finished; if none is running, remove/.test(r.err) && waited >= 5000 && waited < 15000 && read(path.join(staleCwd, 'DECISIONS.md')) === staleBefore && fs.existsSync(path.join(staleCwd, 'DECISIONS.md.lock')), r.code + '|' + waited + '|' + r.err);
  // the binary sniff reads eight thousand bytes, and the byte after them is not sniffed
  for (const [at, governed] of [[7999, false], [8000, true]]) {
    const nb = tempRepo(d => {
      const q = path.join(d, 'test', 'fixture', 'sniff.js');
      const head = Buffer.from('const a = 1;   // R6\n' + 'x'.repeat(at - 21));
      fs.writeFileSync(q, Buffer.concat([head, Buffer.from([0]), Buffer.from('\ntail\n')]));
    });
    r = docket(['check'], { cwd: nb });
    const seen = /12 governed-tree files/.test(r.out);
    ok('the text sniff reads the first eight thousand bytes: a NUL at byte ' + at + ' makes the file ' + (governed ? 'text, and it is counted' : 'binary, and it is not'), seen === governed, r.out);
  }
  // an entry whose body names itself with a verb would fail check 5 for ever, and the ledger is
  // append only, so nothing could ever clear it: it is refused before it is written
  const seCwd = path.join(tempRepo(), 'test', 'fixture'), seBefore = read(path.join(seCwd, 'DECISIONS.md'));
  r = docket(['append', '--title', 'It names itself', '--issue', '88', '--principle', 'Zero cognitive tax', '--body', 'This supersedes R9, its own id. Reason: r.'], { cwd: seCwd });
  ok('append refuses a --body that writes an edge from the new entry to itself, before writing it', r.code === 2 && /is an edge from R9 to itself/.test(r.err) && read(path.join(seCwd, 'DECISIONS.md')) === seBefore, r.code + '|' + r.err);
  r = docket(['append', '--title', 'It names one that is not there', '--issue', '88', '--principle', 'Zero cognitive tax', '--body', 'This supersedes R77. Reason: r.'], { cwd: seCwd });
  ok('…and a --body edge naming a ruling the ledger does not hold, for the same reason', r.code === 2 && /R77, which is not in/.test(r.err) && read(path.join(seCwd, 'DECISIONS.md')) === seBefore, r.code + '|' + r.err);
  r = docket(['append', '--title', 'It merely mentions itself', '--issue', '88', '--principle', 'Zero cognitive tax', '--body', 'R9 holds where R4 holds, with no verb between them. Reason: r.'], { cwd: seCwd });
  ok('…while a body that names its own id with no verb before it is no edge, and is written', r.code === 0 && /check: ok/.test(r.out), r.err + r.out);
  // a heading with no meta breaks one clause of five; the other four are still reported
  const m6 = tempRepo(d => { const q = path.join(d, 'test', 'fixture', 'DECISIONS.md'); fs.writeFileSync(q, read(q) + '\n### R9. No meta no principle no reason\nA body with nothing the contract asks for.\n'); });
  r = docket(['check'], { cwd: m6 });
  ok('check 6: an entry missing its meta is told what else it is missing, not only the meta', r.code === 1 && /R9: heading does not end with a parenthetical meta/.test(r.out) && /R9: no "Principle:" line/.test(r.out) && /R9: body has no "Reason:"/.test(r.out), r.out);
  // two lines naming Principles, each followed by a list: the ledger does not say which is the list
  const twoP = fs.mkdtempSync(path.join(os.tmpdir(), 'docket-twop-'));
  fs.writeFileSync(path.join(twoP, 'DECISIONS.md'), '# Rulings\n\nEarlier drafts listed other Principles, kept for reference:\n\n- **Wrong one.** Not the list.\n\nPrinciples:\n\n- **Capture precedes structure.** The real one.\n\n### R1. One ruling (issue #89)\nPrinciple: Capture precedes structure.\nReason: r.\n');
  fs.writeFileSync(path.join(twoP, 'a.js'), 'x();   // R1\n');
  sh('git', ['init', '-q', '-b', 'main'], twoP);
  sh('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A'], twoP);
  sh('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'two'], twoP);
  r = docket(['check'], { cwd: twoP });
  ok('check 6: two lines naming Principles, each with a list under it, is a fault rather than a silent choice between them', r.code === 1 && /two lines name Principles and each is followed by a list/.test(r.out), r.out);
  // the core requires Node built-ins only (dependency-free)
  const reqs = Array.from(read(CORE).matchAll(/require\((['"])([^'"]+)\1\)/g)).map(m => m[2]);
  ok('the core loads nothing by a name it computes: every require names a literal', !/require\(\s*[^'")]/.test(read(CORE)) && !/\bimport\s*\(/.test(read(CORE)), 'computed require or dynamic import');
  ok('the core requires only Node built-ins', reqs.length >= 4 && reqs.every(m => ['fs', 'path', 'os', 'child_process', 'crypto'].includes(m)), reqs.join(','));
}

console.log(`witness: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
