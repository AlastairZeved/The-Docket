#!/usr/bin/env node
'use strict';
// docket.js — the core of The Docket. One dependency-free file (D13): it speaks
// stdin JSON, stdout text, exit codes and markdown, and names no host, model or
// vendor. Vendored as test/docket.js it is the witness (D9): run with no
// subcommand it checks the ledger and the spec and exits non-zero on a failure.
//
// Sections
// 0  utilities            shell, files, git
// 1  discovery            the nearest ledger, the spec documents (D5)
// 2  parse                entries, titles, meta, edges, addenda, sections, spec headings
// 3  cites                ruling cites, spec cites, bare cites
// 4  context              every tracked text file resolved to its own ledger
// 5  near                 the pre-edit window (D1, D2, D7)
// 6  index/query/governs/principles
// 7  check                the seven checks
// 8  spec-check           token rows and contrast rows
// 9  append               entry, addendum, baseline (D4, D8)
// 10  status               the docket
// 11  cli
// 12  diff                 what changed in the law between two readings
// 13  vendor               the witness copied to where the law lives (D9)
// 14  constitute           a spine before the first line (D9, D13)
// 15  intake               an intake file, printed for a skill to splice
//
// Exit codes: 0 success · 1 a failed check · 2 usage error.

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

// ─── 0. utilities ───────────────────────────────────────────────────────────

// D14: each number below preserves a stated property; a change to one is a new ruling, never an edit here.
const WINDOW = 20;        // D2: ±20 lines; D16: two to five rulings is what this yields, measured
const CAP = 8;            // D2: at most eight rulings listed; D16: the fixture never reaches it, a denser window would
const TITLE_MAX = 72;     // D7: the title rule's cut
const BLOCK_CAP = 5;      // D11: five blocks per session since the last PASS
const THIRD_CYCLE = 3;    // D11: after the third block, failures must decrease
const REFUSALS_MIN = 3;   // a constitution names at least three refusals: one is a mood, two a pair, three a boundary

const VERBS = ['supersedes', 'overrides', 'retires', 'reverses', 'waives', 'extends',
  'keeps', 're-tunes', 'refines', 'replaces', 'corrects', 'revises'];
const ADVERBS = ['partially', 'partly', 'in part'];
// Word boundaries for cites, edges and spec cites are letters, digits and underscore in any script
// (FORMAT.md 8): `styléR9` is one word and not a cite; `saveRéR6` does not cite R6. \b knows ASCII only.
const NOT_WORD_BEFORE = '(?<![\\p{L}\\p{N}_])', NOT_WORD_AFTER = '(?![\\p{L}\\p{N}_])';
const INVALID_ROLES = ['general audience', 'everyone', 'anyone', 'non-technical', 'users', 'people', 'the public', 'all users', 'someone curious'];

// Every reader-facing byte leaves through here and through die(), and neither carries a character
// that reorders what a terminal shows. A ledger may hold one — check 2 names it — but the text a
// maker is shown still reads straight, which is the whole of that guarantee (FORMAT.md 13).
function out(s) { const t = plain(s); process.stdout.write(t.endsWith('\n') ? t : t + '\n'); }
// A reader that stops reading (`docket check | head -1`) is not a failure of the ledger: end quietly, exit 0.
process.stdout.on('error', e => { if (e && e.code === 'EPIPE') process.exit(0); throw e; });
function die(msg, code) { process.stderr.write(plain(msg) + '\n'); process.exit(code === undefined ? 2 : code); }
function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch (e) { return ''; } }
function readText(p) { return fs.readFileSync(p, 'utf8'); }
function exists(p) { try { fs.accessSync(p); return true; } catch (e) { return false; } }
function isFile(p) { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } }
function today() { return process.env.DOCKET_TODAY || new Date().toISOString().slice(0, 10); }
function sh(cmd, args, cwd) {
  const r = cp.spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
  return { status: r.status === null ? 1 : r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}
function gitRoot(dir) {
  const r = sh('git', ['rev-parse', '--show-toplevel'], dir);
  return r.status === 0 ? r.stdout.trim() : null;
}
function trackedFiles(root) {
  const r = sh('git', ['ls-files', '-z'], root);
  if (r.status !== 0) return null;
  return r.stdout.split('\0').filter(Boolean).map(f => path.join(root, f));
}
function untrackedFiles(root) {
  const r = sh('git', ['ls-files', '-z', '--others', '--exclude-standard'], root);
  if (r.status !== 0) return [];
  return r.stdout.split('\0').filter(Boolean).map(f => path.join(root, f));
}
function isTextFile(p) {
  let fd;
  try {
    fd = fs.openSync(p, 'r');
    const buf = Buffer.alloc(8000);                                  // git's own binary sniff: the first 8000 bytes
    const n = fs.readSync(fd, buf, 0, 8000, 0);
    for (let i = 0; i < n; i++) if (buf[i] === 0) return false;
    return true;
  } catch (e) { return false; } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function rel(from, to) { const r = path.relative(from, to); return r === '' ? '.' : r.split(path.sep).join('/'); }
// One trailing newline ends the last line; it does not open another. A file of 260 lines that
// ends as files do read as 260 here, which is what the ledger says the witness counts and what
// every window bound and every line number is measured against (FORMAT.md 1).
function splitLines(text) { return text.replace(/\r?\n$/, '').split(/\r?\n/); }
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function uniq(arr) { return Array.from(new Set(arr)); }
function stripMarks(s) { return s.replace(/`/g, '').replace(/\*\*/g, ''); }

// ─── 1. discovery (D5) ──────────────────────────────────────────────────────

// The project root of `dir`: CLAUDE_PROJECT_DIR when set and `dir` lies under it, else the git root of
// `dir`, else null. Zero config: nothing else is consulted. The host's variable bounds only the tree it
// holds — a value naming some other directory neither redirects a walk nor empties an enumeration (a
// check run under it would pass with nothing to check). Discovery walks up to the root, or to the
// filesystem root when there is none; file enumeration never does — see enumerationRoot.
function projectRoot(dir) {
  const v = process.env.CLAUDE_PROJECT_DIR;                            // the host's project directory, when it names one
  if (v && isDir(v) && isWithin(path.resolve(dir), path.resolve(v))) return path.resolve(v);   // a value that is not a directory names no tree
  return gitRoot(dir);
}
// True when `p` is `ancestor` or lies below it — path arithmetic; no symlink is followed.
function isWithin(p, ancestor) { const r = path.relative(ancestor, p); return r === '' || (r !== '..' && !r.startsWith('..' + path.sep) && !path.isAbsolute(r)); }
// The root that files are enumerated under: the project root, else the home of the nearest
// ledger above `cwd`, else `cwd` itself — never the filesystem root.
function enumerationRoot(cwd) {
  const r = projectRoot(cwd);
  if (r) return r;
  const lp = findLedger(path.join(cwd, 'x'), path.parse(path.resolve(cwd)).root);
  return lp ? ledgerHome(lp) : path.resolve(cwd);
}

// The nearest DECISIONS.md or docs/DECISIONS.md walking up from `filePath`'s
// directory to `root` inclusive; null when there is none (the file is ungoverned).
function findLedger(filePath, root) {
  let dir = path.resolve(path.dirname(filePath));
  const stop = path.resolve(root);
  for (;;) {
    for (const cand of [path.join(dir, 'DECISIONS.md'), path.join(dir, 'docs', 'DECISIONS.md')]) {
      if (isFile(cand)) return cand;
    }
    if (dir === stop || dir === path.parse(dir).root) return null;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

// The ledger's home: the directory that holds it, or that holds the docs/ holding it. Paths in the
// pre-edit window's header and in the bare-cite baseline are relative to it.
function ledgerHome(ledgerPath) {
  const dir = path.dirname(ledgerPath);
  return path.basename(dir) === 'docs' ? path.dirname(dir) : dir;
}
// The spec documents sit beside the ledger and nowhere else.
function specDocs(ledgerPath) {
  const dir = path.dirname(ledgerPath);
  const u = path.join(dir, 'UIUX.md'), p = path.join(dir, 'PRD.md');
  return { uiux: isFile(u) ? u : null, prd: isFile(p) ? p : null };
}

// ─── 2. parse ───────────────────────────────────────────────────────────────

const NUMERAL_MAX_DIGITS = 15;                                        // FORMAT.md 2: fifteen keeps the number exact
const HEADING_RE = /^### ([A-Za-z]+)([1-9]\d{0,14})\.[ \t]+(.*?)[ \t]*$/s;   // s: a U+2028/U+2029 inside a heading is content to this reader, as it is to splitLines   // a heading ends at spaces and tabs: a bare CR is content, not the end of a line (1)   // ASCII prefix, no leading zero, at most fifteen digits so n is exact (FORMAT.md 2)
const SECTION_RE = /^## ([A-Za-z]+)\.\s+(.*?)\s*$/;
const ADDENDUM_RE = /^> Addendum (\d{4}-\d{2}-\d{2}): (.*?)\s*$/;
const SPEC_HEADING_RE = /^#{1,6}\s+§(\d+(?:\.\d+)*)\s+(.*?)\s*$/;
// One verb may name several targets joined by "/" ("keeps R1/R2"): one edge per target, the same clause.
// A verb or adverb may open a sentence with a capital — "Supersedes R1", "In part reverses R6" — and is recorded in
// lowercase; any other casing is no edge (FORMAT.md 5).
function caseHead(words) { return words.map(w => '[' + w[0] + w[0].toUpperCase() + ']' + w.slice(1)); }
const EDGE_RE = new RegExp('(?:' + NOT_WORD_BEFORE + '(' + caseHead(ADVERBS).join('|') + ')\\s+)?' + NOT_WORD_BEFORE + '(' + caseHead(VERBS).join('|') + ')\\s+([A-Za-z]+)([1-9]\\d*)((?:/[A-Za-z]+[1-9]\\d*)*)' + NOT_WORD_AFTER + '(?:\\s*\\(([^()]*)\\))?', 'gu');

// The index of the "(" that opens the meta: the first one outside a backtick span that begins the heading or follows
// a space (FORMAT.md 3, 4). A parenthesis inside inline code is code, not the meta; a heading with an unpaired
// backtick has no code span; a heading that is only its parenthetical has an empty title and a meta.
function metaStart(s) {
  const noSpans = ((s.match(/`/g) || []).length % 2) === 1;
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '`' && !noSpans) { inCode = !inCode; continue; }
    if (!inCode && s[i] === '(' && (i === 0 || s[i - 1] === ' ')) return i;
  }
  return -1;
}
// Text inside backticks is quoted, not asserted (FORMAT.md 5): blank every code span, keeping positions.
function maskCode(s) { return s.replace(/`[^`\n]*`/g, m => ' '.repeat(m.length)); }

// D7 (2): cut at the first " (" outside code, strip marks, then cut at the last word boundary before 72 with "…".
function titleOf(heading) {
  let t = heading;
  const i = metaStart(t);
  if (i >= 0) t = t.slice(0, i);
  t = stripMarks(t).trim();
  const cps = Array.from(t);                                          // code points, not UTF-16 units
  if (cps.length > TITLE_MAX) {
    const head = cps.slice(0, TITLE_MAX);
    const sp = head.lastIndexOf(' ');
    t = (sp > 0 ? head.slice(0, sp) : head.slice(0, TITLE_MAX - 1)).join('').trim() + '…';
  }
  return t;
}

// The first parenthetical of a heading, matched by depth: text and the index it starts at.
function metaOf(heading) {
  const i = metaStart(heading);
  if (i < 0) return { meta: '', start: -1, end: -1 };
  let depth = 0;
  for (let j = i; j < heading.length; j++) {
    if (heading[j] === '(') depth++;
    else if (heading[j] === ')') { depth--; if (depth === 0) return { meta: heading.slice(i + 1, j), start: i, end: j }; }
  }
  return { meta: heading.slice(i + 1), start: i, end: heading.length };
}

function clausesOf(meta) { return meta.split(';').map(s => s.trim()).filter(Boolean); }
// The body states its reason when `Reason:` appears outside code spans and fenced blocks (FORMAT.md 5, 11).
function assertsReason(lines) {
  const fenced = fencedLines(lines);
  return lines.some((l, k) => !fenced[k] && /Reason:/.test(maskCode(l)));
}

// Every edge in `text`, with its clause. `sentences` splits body text; a meta clause is its own sentence.
function edgesIn(text, sourceId, line, asMeta) {
  const found = [];
  const units = asMeta ? clausesOf(text) : text.split(/(?<=[.;])\s+|\n/).map(s => s.trim()).filter(Boolean);
  for (const unit of units) {
    EDGE_RE.lastIndex = 0;
    let m;
    const scan = maskCode(unit);                                     // an edge inside a code span is quoted, not made
    while ((m = EDGE_RE.exec(scan)) !== null) {
      const targets = [m[3] + m[4]].concat((m[5] || '').split('/').filter(Boolean));
      for (const t of targets) {
        const tm = /^([A-Za-z]+)(\d+)$/.exec(t);
        found.push({ from: sourceId, adverb: (m[1] || '').toLowerCase(), verb: m[2].toLowerCase(), to: t, toPrefix: tm[1], toN: Number(tm[2]), qualifier: m[6] || '', clause: unit, line });
      }
    }
  }
  return found;
}
function isEdgeClause(clause) {
  const re = new RegExp('^(?:(?:' + caseHead(ADVERBS).join('|') + ')\\s+)?(?:' + caseHead(VERBS).join('|') + ')\\s+[A-Za-z]+\\d+(?:/[A-Za-z]+\\d+)*(?:\\s*\\([^()]*\\))?$');
  return re.test(clause.trim());
}
function renderEdge(e) { return e.from + ' ' + (e.adverb ? e.adverb + ' ' : '') + e.verb + ' ' + e.to + (e.qualifier ? ' (' + e.qualifier + ')' : ''); }
function edgeKey(e) { return e.from + '|' + e.adverb + '|' + e.verb + '|' + e.to + '|' + e.qualifier; }

// The principles list: the bulleted list under the first section of PRD.md when it exists, else the
// preamble's list after a line containing "Principles". Items begin with a bold phrase.
function principlesFromList(lines, startIdx) {
  const names = [], skipped = [];
  let started = false;
  for (let i = startIdx; i < lines.length; i++) {
    const m = /^\s*[-*]\s+\*\*([^*]+?)\*\*/.exec(lines[i]);
    if (m) { names.push({ name: m[1].trim().replace(/\.$/, ''), text: lines[i].trim(), line: i + 1 }); started = true; }
    else if (started && lines[i].trim() === '') break;
    else if (started && /^\s+\S/.test(lines[i])) names[names.length - 1].text += ' ' + lines[i].trim();   // a wrapped bullet: the indented line continues it
    else if (started && /^\s*[-*]\s/.test(lines[i])) skipped.push(i + 1);   // a bullet with no bolded name: no principle to cite, and the list goes on
    else if (started) break;
  }
  names.skipped = skipped;
  return names;
}
function principlesOf(ledger) {
  const docs = specDocs(ledger.path);
  if (docs.prd) {
    const lines = splitLines(readText(docs.prd));
    for (let i = 0; i < lines.length; i++) {
      const m = SPEC_HEADING_RE.exec(lines[i]);
      if (m && m[1] === '1') {
        const list = principlesFromList(lines, i + 1);
        if (list.length) return { source: docs.prd, list, skipped: list.skipped || [] };
      }
    }
  }
  const lines = ledger.preambleLines;
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/Principles/.test(lines[i])) continue;
    const list = principlesFromList(lines, i + 1);
    if (list.length) found.push({ at: i + 1, list });
  }
  if (found.length > 1 && found[0].list[0].line !== found[1].list[0].line) {
    return { source: ledger.path, list: found[0].list, skipped: found[0].list.skipped || [], ambiguous: found.map(f => f.at) };
  }
  if (found.length) return { source: ledger.path, list: found[0].list, skipped: found[0].list.skipped || [] };
  return { source: null, list: [] };
}
function principleNamed(list, name) {
  const norm = s => s.trim().replace(/\.$/, '').toLowerCase();
  return list.find(p => norm(p.name) === norm(name)) || null;
}

// A line that ends an entry: the next entry heading, or a section heading. A `### ` line that is not an entry
// heading, or a `## ` line that is not a section heading, ends nothing and is read as body text (FORMAT.md 2, 7).
function isBoundary(line) { return HEADING_RE.test(line) || SECTION_RE.test(line); }
function parseLedger(text, ledgerPath) {
  const lines = splitLines(text);
  const rulings = [], sections = [];
  const contractFrom = {}, baseline = {};
  let hasBaseline = false;
  let firstHeading = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (isBoundary(lines[i])) { firstHeading = i; break; }
  }
  const preambleLines = lines.slice(0, firstHeading);
  const directiveFaults = [];                                          // {k, line, message}: check reports them, parse reads the first directive
  const contractFromLine = {};                                         // where each contract line sits, so check can name it
  const firstAt = { bareCites: 0 };
  for (let li = 0; li < preambleLines.length; li++) {
    const l = preambleLines[li];
    let m = /<!--\s*docket:\s*contract from ([A-Za-z]+)([1-9]\d{0,14})\s*-->/.exec(l);   // a ruling number (2): a zero names no entry, so it binds none
    if (m) {
      if (contractFrom[m[1]] !== undefined) directiveFaults.push({ k: 6, line: li + 1, message: 'a second contract line for prefix ' + m[1] + ' (line ' + firstAt[m[1]] + ' binds); the preamble carries one per prefix (FORMAT.md 11)' });
      else { contractFrom[m[1]] = Number(m[2]); firstAt[m[1]] = li + 1; contractFromLine[m[1]] = li + 1; }
    }
    m = /<!--\s*docket:\s*bare-cites([^>]*)-->/.exec(l);
    if (m) {
      if (hasBaseline) { directiveFaults.push({ k: 4, line: li + 1, message: 'a second bare-cites comment (line ' + firstAt.bareCites + ' is the baseline); the preamble carries one (FORMAT.md 9)' }); continue; }
      hasBaseline = true; firstAt.bareCites = li + 1;
      for (const kv of m[1].trim().split(/\s+/).filter(Boolean)) {
        const eq = kv.lastIndexOf('=');
        // One file, one allowance: a repeated key would let the later number raise a reviewed allowance
        // in silence, as a second baseline comment or a second contract line would (FORMAT.md 9, 11).
        if (eq > 0 && Object.prototype.hasOwnProperty.call(baseline, kv.slice(0, eq))) directiveFaults.push({ k: 4, line: li + 1, message: 'bare-cites baseline: ' + kv.slice(0, eq) + ' is listed twice; a file carries one allowance (FORMAT.md 9)' });
        else if (eq > 0 && /^\d+$/.test(kv.slice(eq + 1))) baseline[kv.slice(0, eq)] = Number(kv.slice(eq + 1));
        else directiveFaults.push({ k: 4, line: li + 1, message: 'bare-cites baseline: "' + kv + '" is not <file>=<count> (FORMAT.md 9)' });   // a pair that is not a count is no allowance, and check says so
      }
    }
  }
  // entries and sections
  let i = 0;
  while (i < lines.length) {
    const sm = SECTION_RE.exec(lines[i]);
    const hm = HEADING_RE.exec(lines[i]);
    if (sm) { sections.push({ letter: sm[1], title: stripMarks(sm[2]), line: i + 1 }); i++; continue; }
    if (hm) {
      const start = i;
      let j = i + 1;
      while (j < lines.length && !isBoundary(lines[j])) j++;
      const bodyLines = lines.slice(i + 1, j);
      const heading = hm[3];
      const { meta } = metaOf(heading);
      const id = hm[1] + hm[2];
      const issueM = /issue #(\d+)/.exec(meta);
      const addenda = [];
      bodyLines.forEach((l, k) => { const am = ADDENDUM_RE.exec(l); if (am) addenda.push({ date: am[1], text: am[2], line: start + 2 + k }); });
      const rawEdges = edgesIn(meta, id, start + 1, true);
      bodyLines.forEach((l, k) => { if (!ADDENDUM_RE.test(l)) rawEdges.push(...edgesIn(l, id, start + 2 + k, false)); });
      const seenE = new Set(), edges = [];
      for (const e of rawEdges) { const k = edgeKey(e); if (!seenE.has(k)) { seenE.add(k); edges.push(e); } }
      const clauses = clausesOf(meta);
      const grounding = clauses.find(c => !isEdgeClause(c)) || '';
      const bodyFenced = fencedLines(bodyLines);                       // FORMAT.md 5: a Principle: line inside a fence is quoted
      const pm = bodyLines.map((l, k) => bodyFenced[k] ? null : /^Principle:\s*(.+?)\s*$/.exec(l)).find(Boolean);
      rulings.push({
        id, prefix: hm[1], n: Number(hm[2]), line: start + 1, heading, title: titleOf(heading), meta, grounding,
        issue: issueM ? Number(issueM[1]) : null, edges, addenda, body: bodyLines.join('\n'), bodyLines,
        principle: pm ? pm[1].replace(/\.$/, '') : null, endLine: j,
        hasReason: assertsReason(bodyLines),
      });
      i = j; continue;
    }
    i++;
  }
  const prefixes = uniq(rulings.map(r => r.prefix));
  const byId = new Map();
  for (const r of rulings) if (!byId.has(r.id)) byId.set(r.id, r);     // FORMAT.md 12: a repeated id resolves to its first entry, the one at its position; the later one is check 2's failure
  return { path: ledgerPath, dir: path.dirname(ledgerPath), home: ledgerHome(ledgerPath), text, lines, preambleLines, prefixes, rulings, sections, byId, contractFrom, contractFromLine, baseline, hasBaseline, directiveFaults };
}
function parseSpec(text) {
  const heads = [];
  splitLines(text).forEach((l, i) => { const m = SPEC_HEADING_RE.exec(l); if (m) heads.push({ num: m[1], title: stripMarks(m[2]), line: i + 1 }); });
  return heads;
}
function loadLedger(ledgerPath) { return parseLedger(readText(ledgerPath), ledgerPath); }
function ledgerSpecs(ledger) {
  const docs = specDocs(ledger.path);
  return {
    UIUX: docs.uiux ? { path: docs.uiux, heads: parseSpec(readText(docs.uiux)) } : null,
    PRD: docs.prd ? { path: docs.prd, heads: parseSpec(readText(docs.prd)) } : null,
  };
}

// ─── 3. cites ───────────────────────────────────────────────────────────────

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// Ruling cites: an id on word boundaries whose prefix is one of the ledger's; `exists` says whether the number is defined.
function citesInLine(line, ledger) {
  if (!ledger.prefixes.length) return [];
  const re = new RegExp(NOT_WORD_BEFORE + '(' + ledger.prefixes.map(escapeRe).join('|') + ')([1-9]\\d*)' + NOT_WORD_AFTER, 'gu');   // FORMAT.md 2, 8: no leading zero
  const found = [];
  let m;
  const scan = maskCode(line);                                        // FORMAT.md 8: an id in a code span is quoted, not cited
  while ((m = re.exec(scan)) !== null) found.push({ id: m[1] + m[2], prefix: m[1], n: Number(m[2]), col: m.index, exists: ledger.byId.has(m[1] + m[2]) });
  return found;
}
// A fenced code block — a line beginning ``` opens it, the next such line closes it — is quoted like a code span
// (FORMAT.md 8): nothing inside it is a cite. fencedLines marks each line that lies inside one (the fence lines too).
function fencedLines(lines) {
  const out = new Array(lines.length); let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) { inFence = !inFence; out[i] = true; continue; }
    out[i] = inFence;
  }
  return out;
}
function citesIn(text, ledger) {
  const all = [], lines = splitLines(text), fenced = fencedLines(lines);
  lines.forEach((l, i) => { if (fenced[i]) return; for (const c of citesInLine(l, ledger)) all.push(Object.assign({ line: i + 1, text: l }, c)); });
  return all;
}
const SPEC_CITE_RE = /(?<![\p{L}\p{N}_])(UIUX|PRD) §(\d+(?:\.\d+)*)/gu;
function specCitesIn(text) {
  const all = [], lines = splitLines(text), fenced = fencedLines(lines);
  lines.forEach((l, i) => { if (fenced[i]) return; SPEC_CITE_RE.lastIndex = 0; let m; while ((m = SPEC_CITE_RE.exec(maskCode(l))) !== null) all.push({ doc: m[1], num: m[2], line: i + 1 }); });
  return all;
}
const BARE_CITE_RE = /(?<!(?<![\p{L}\p{N}_])(?:UIUX|PRD) )(?<!(?<![\p{L}\p{N}_])(?:UIUX|PRD))§\d/gu;
const GLUED_CITE_RE = /(?<![\p{L}\p{N}_])(UIUX|PRD)§(\d+(?:\.\d+)*)/gu;   // the document's name against the mark, with the space missing
function bareCitesIn(text) {
  const lines = splitLines(text), fenced = fencedLines(lines); let n = 0;
  lines.forEach((l, i) => { if (fenced[i]) return; const m = maskCode(l).match(BARE_CITE_RE); if (m) n += m.length; });
  return n;
}

// ─── 4. context: every tracked text file resolved to its own ledger ─────────

const WALK_MAX = 20000;                                                // entries read, not files kept: the bound is on the work, not the answer
function walkFiles(dir, acc, root, seen) {
  seen = seen || { n: 0 };
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return acc; }
  for (const ent of ents) {
    if (++seen.n > WALK_MAX) die('the tree under ' + (root || dir) + ' holds more than ' + WALK_MAX + ' entries and is not a git repository, so there is no tracked set to enumerate; run the docket inside the repository, or set the project directory to it (FORMAT.md 1)', 2);
    if (ent.name === '.git' || ent.name === 'node_modules' || ent.name === '.docket') continue;
    const p = path.join(dir, ent.name);
    if (ent.isSymbolicLink()) {                                        // git lists a tracked symlink and near reads through one: the walk agrees with both
      let real = null;
      try { real = fs.realpathSync(p); } catch (e) { continue; }       // broken, or a loop
      if (!isWithin(real, root || dir)) continue;                      // a link out of the tree is not the tree's file
      if (isFile(p)) acc.push(p);
      continue;
    }
    if (ent.isDirectory()) walkFiles(p, acc, root || dir, seen); else if (ent.isFile()) acc.push(p);
  }
  return acc;
}
function loadContext(root, opts) {
  opts = opts || {};
  let files = trackedFiles(root);
  if (files === null) files = walkFiles(root, [], root);
  if (opts.includeUntracked) files = files.concat(untrackedFiles(root));
  const ledgers = new Map();
  const entries = [];
  const vendored = [];
  for (const f of uniq(files)) {
    if (!isFile(f) || !isTextFile(f)) continue;
    if (isSelfCopy(f)) { vendored.push(rel(root, f)); continue; }      // D9: the vendored witness is not a governed file
    const lp = findLedger(f, root);
    if (!lp) continue;
    if (!ledgers.has(lp)) ledgers.set(lp, loadLedger(lp));
    entries.push({ path: f, ledger: lp, rel: rel(root, f) });
  }
  seedLedgerText(entries, ledgers);                                   // one read per file, so one version per run
  return { root, ledgers, files: entries, vendored };
}
// A file whose text is this program's own, at another path, is the witness `vendor` copied there (D9). Its
// comments cite this plugin's rulings and the fixture's examples, which resolve to nothing under the ledger it
// serves, so it is not read as a governed file: not for cites, not for the bare-§ count, not by near. Identity
// is the text itself, line endings normalised, which a marker line could not forge; a copy that has drifted
// from the running core is not exempt, and its cites failing is the sign to vendor again.
let selfText = null;
function isSelfCopy(filePath) {
  if (path.basename(filePath) !== 'docket.js') return false;
  // The program itself: governed when it is the core at bin/docket.js, which its own repository's ledger
  // governs (D6); the witness when it runs from anywhere else, which is where vendor put it.
  if (path.resolve(filePath) === path.resolve(__filename)) return path.basename(path.dirname(__filename)) !== 'bin';
  if (selfText === null) selfText = normEol(readText(__filename));
  try { return normEol(readText(filePath)) === selfText; } catch (e) { return false; }
}
function fileText(entry) { if (entry.text === undefined) entry.text = readText(entry.path); return entry.text; }
// A ledger is read once, as the ledger. Where it is also one of the files a check walks, it carries that same text, so
// a run never holds a parse from one version of a ledger and a text from another (a write can land between two reads).
function seedLedgerText(entries, ledgers) {
  for (const e of entries) if (e.text === undefined && ledgers.has(e.path)) e.text = ledgers.get(e.path).text;
}
function isSpecDoc(entry, ledger) { return entry.path === path.join(ledger.dir, 'UIUX.md') || entry.path === path.join(ledger.dir, 'PRD.md'); }
// A ledger document — any DECISIONS*.md — is checked for its cites but is never governed code:
// its cites are references between rulings, not implementation.
function isLedgerDoc(p) { return /^DECISIONS.*\.md$/i.test(path.basename(p)); }
// Code cites: resolving cites in every governed file of a ledger except the ledger itself.
function codeCites(ctx, ledger) {
  const cites = [];
  for (const e of ctx.files) {
    if (e.ledger !== ledger.path || isLedgerDoc(e.path)) continue;
    // One line, one cite, HERE: the same id twice on a line is one reliance for the code-cite
    // lists — what governs prints and what "cited nowhere" counts. near does not share this
    // rule: its count is per occurrence and is the first key of two of its three orders
    // (FORMAT.md 15, which says two matches on one line are one anchor, and says nothing
    // about two cites on one line). The two readings differ on purpose; neither speaks for
    // the other.
    const seen = new Set();
    for (const c of citesIn(fileText(e), ledger)) if (c.exists && !seen.has(c.id + ':' + c.line)) { seen.add(c.id + ':' + c.line); cites.push(Object.assign({ file: e.path, rel: e.rel }, c)); }
  }
  return cites;
}
function governedFiles(ctx, ledger) {
  const set = new Set();
  for (const c of codeCites(ctx, ledger)) set.add(c.file);
  return Array.from(set);
}
// The scope of a ledger command: with --ledger the named ledger, and the root is the ledger's own (its project
// root, else its git root, else its home), so the check that follows a write covers the tree the ledger governs and
// not the working directory's; without it the working directory's root and the nearest ledger above it, or null.
function scope(argv) {
  const cwd = process.cwd();
  const given = flag(argv, '--ledger');
  if (given !== null) {
    const lp = path.resolve(cwd, given);
    if (!isFile(lp)) die('no ledger: --ledger ' + given + ' is not a file', 2);
    return { cwd, root: enumerationRoot(path.dirname(lp)), ledger: lp };
  }
  const root = enumerationRoot(cwd);
  return { cwd, root, ledger: findLedger(path.join(cwd, 'x'), root) };
}
function ledgerFromCwd(argv) {
  const s = scope(argv);
  if (!s.ledger) die(noLedgerMessage(s.cwd, s.root), 2);
  return { root: s.root, ledger: loadLedger(s.ledger) };
}
// The ledgers under `dir` (paths relative to it): what a walk up from `dir` cannot see (FORMAT.md 1). Only a tree
// the host names or git tracks is enumerated for them; a bare directory is not searched.
function ledgersBelow(dir, root) {
  if (!projectRoot(dir)) return [];
  return Array.from(loadContext(root).ledgers.keys()).filter(lp => isWithin(path.dirname(lp), dir)).map(lp => rel(dir, lp)).sort();
}
function noLedgerMessage(cwd, root) {
  const below = ledgersBelow(cwd, root);
  return 'no ledger: no DECISIONS.md or docs/DECISIONS.md between ' + cwd + ' and ' + root
    + (below.length ? '; below the working directory: ' + below.join(', ') + ' — pass --ledger <path>, or run from inside' : '');
}

// ─── 5. near: the pre-edit window (D1, D2, D7) ──────────────────────────────

function lineOfIndex(text, idx) { let n = 1; for (let i = 0; i < idx; i++) if (text.charCodeAt(i) === 10) n++; return n; }
function findAll(text, needle) {
  const at = [];
  let i = 0;
  for (;;) { const j = text.indexOf(needle, i); if (j < 0) break; at.push(lineOfIndex(text, j)); i = j + needle.length; }
  return at;
}
function near(argv) {
  const raw = readStdin();
  let input;
  try { input = JSON.parse(raw); } catch (e) { return 0; }            // D1: never a blocking exit
  if (!input || typeof input !== 'object') return 0;
  const tool = input.tool_name, ti = input.tool_input || {};
  if (typeof ti.file_path !== 'string' || !ti.file_path) return 0;
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const file = path.resolve(cwd, ti.file_path);
  const startDir = exists(path.dirname(file)) ? path.dirname(file) : cwd;
  const pr = projectRoot(startDir);
  const lp = findLedger(file, pr || path.parse(path.resolve(startDir)).root);
  if (!lp) return 0;                                                   // ungoverned tree: silent
  if (isLedgerDoc(file)) return 0;                                     // FORMAT.md 8: the ledger is amended through append; a direct edit is check 7's business
  if (isSelfCopy(file)) return 0;                                      // D9: the vendored witness cites another ledger; a list from it would be wrong, so there is none
  if (!isFile(file)) return 0;                                         // D7: a Write of a new file is silent
  if (!isTextFile(file)) return 0;                                     // FORMAT.md 1, 15: a governed file is a text file; a binary one check never sees is never reported as governed
  const ledger = loadLedger(lp);
  const text = normEol(readText(file)), lines = splitLines(text), N = lines.length, fenced = fencedLines(lines);   // one reading for the match and the lines (1)
  const fileRel = rel(ledger.home, file), ledgerRel = ledgerLabel(pr, lp);
  let windows, anchors, mode, span = 0;                                 // span: the lines an old_string covers beyond its first
  if (tool === 'Write') { windows = [[1, N]]; anchors = []; mode = 'whole'; }
  else if (tool === 'Edit') {
    const needle = ti.old_string;
    if (typeof needle !== 'string' || needle === '') return 0;          // zero matches: silent
    const matches = findAll(text, normEol(needle));                   // the edit's text is normalised too: a host joins lines with the newline it writes
    if (matches.length === 0) return 0;                                 // zero: silent
    if (matches.length > 1 && ti.replace_all !== true) return 0;        // D7 (1): the tool will reject; silent
    anchors = uniq(matches);                                            // two matches on one line are one anchor: the line is named once
    span = normEol(needle).split('\n').length - 1;                     // the edit covers these lines too; the window is ±WINDOW around the whole of it
    windows = anchors.map(l => [Math.max(1, l - WINDOW), Math.min(N, l + span + WINDOW)]);
    mode = matches.length === 1 ? 'one' : 'many';
  } else return 0;
  // collect
  const byId = new Map();
  const specs = [];
  // The union of the windows (D7): a line inside two overlapping windows is read once, at its distance to the
  // nearest anchor — a union, not a sum, so a cite counts once however many windows hold it.
  const nearest = new Map();                                           // line -> distance to the nearest anchor
  windows.forEach((w, wi) => {
    const anchor = anchors[wi];
    for (let ln = w[0]; ln <= w[1]; ln++) {
      const d = anchor === undefined ? ln : (ln < anchor ? anchor - ln : ln > anchor + span ? ln - (anchor + span) : 0);   // inside the edited span, distance is 0
      if (!nearest.has(ln) || d < nearest.get(ln)) nearest.set(ln, d);
    }
  });
  for (const ln of Array.from(nearest.keys()).sort((a, b) => a - b)) {
    if (fenced[ln - 1]) continue;                                      // FORMAT.md 8: a fenced block is quoted
    const l = lines[ln - 1], d = nearest.get(ln);
    for (const c of citesInLine(l, ledger)) {
      if (!c.exists) continue;
      const d0 = anchors.length ? (ln < anchors[0] ? anchors[0] - ln : ln > anchors[0] + span ? ln - (anchors[0] + span) : 0) : ln;
      const cur = byId.get(c.id);
      if (!cur) byId.set(c.id, { id: c.id, count: 1, dist: d, dist0: d0, first: ln, col: c.col });
      // first is the earliest cite by line and then by column: FORMAT.md 15's last level is a key here, not an order of visits.
      else { cur.count++; cur.dist = Math.min(cur.dist, d); cur.dist0 = Math.min(cur.dist0, d0); if (ln < cur.first || (ln === cur.first && c.col < cur.col)) { cur.first = ln; cur.col = c.col; } }
    }
    SPEC_CITE_RE.lastIndex = 0; let m;
    while ((m = SPEC_CITE_RE.exec(maskCode(l))) !== null) specs.push({ doc: m[1], num: m[2], line: ln });
  }
  const where = mode === 'whole' ? 'whole file ' + fileRel
    : '±' + WINDOW + ' lines of ' + fileRel + ':' + (anchors.length <= CAP ? anchors.map(a => span ? a + '–' + (a + span) : a).join(', ') : anchors.slice(0, CAP).map(a => span ? a + '–' + (a + span) : a).join(', ') + ' +' + (anchors.length - CAP) + ' more');
  const outLines = [];
  const obj = { ledger: ledgerRel, file: fileRel, mode, anchors, region: where, rulings: [], more: 0, edges: [], addenda: [], specCites: [], notice: null };
  if (byId.size === 0) {
    const governed = citesIn(text, ledger).some(c => c.exists);
    if (!governed) return 0;                                            // not governed: silent
    obj.notice = 'no ruling is cited in this window; run docket governs <id> for the one you rely on.';
    outLines.push('Governed here (' + ledgerRel + ', ' + where + '): ' + obj.notice);   // one line, as D7's addendum and FORMAT.md 15 say
    return emitNear(input, argv, outLines.join('\n'), obj);
  }
  let list = Array.from(byId.values());
  // Every level FORMAT.md 15 names is a key. Count is NOT a key of the single-match order: a ruling
  // cited many times but never near the edit does not outrank one cited once beside it (D2, nearest first).
  if (mode === 'one') list.sort((a, b) => a.dist - b.dist || a.first - b.first || a.col - b.col);
  else if (mode === 'many') list.sort((a, b) => b.count - a.count || a.dist0 - b.dist0 || a.first - b.first || a.col - b.col); // D7
  else list.sort((a, b) => b.count - a.count || a.first - b.first || a.col - b.col);           // whole file: by count
  const total = list.length;
  list = list.slice(0, CAP);
  const listed = new Set(list.map(x => x.id));
  outLines.push('Governed here (' + ledgerRel + ', ' + where + '):');
  for (const x of list) {
    const r = ledger.byId.get(x.id);
    outLines.push('  ' + r.id + '  ' + r.title + (r.issue !== null ? '  · issue #' + r.issue : ''));
    obj.rulings.push({ id: r.id, title: r.title, issue: r.issue, count: x.count, line: x.first });
  }
  obj.more = Math.max(0, total - CAP);
  if (total > CAP) outLines.push('  +' + (total - CAP) + ' more');                        // FORMAT.md 15; D14
  const edges = [];
  const seen = new Set();
  const push = e => { const k = edgeKey(e); if (!seen.has(k)) { seen.add(k); edges.push(renderEdge(e)); } };
  for (const x of list) {
    const r = ledger.byId.get(x.id);
    for (const e of r.edges) push(e);
    for (const other of ledger.rulings) for (const e of other.edges) if (e.to === r.id) push(e);
  }
  if (edges.length) outLines.push('Edges among these: ' + edges.join('; ') + '.');
  obj.edges = edges;
  const withAdd = list.map(x => ledger.byId.get(x.id)).filter(r => r.addenda.length);
  const add = withAdd.map(r => r.id + ' (' + r.addenda.map(a => a.date).join(', ') + ')');
  obj.addenda = withAdd.map(r => ({ id: r.id, dates: r.addenda.map(a => a.date) }));
  if (add.length) outLines.push('Addenda: ' + add.join(', ') + '.');
  if (specs.length) {
    const sp = ledgerSpecs(ledger);
    const seenS = new Set(), items = [];
    for (const s of specs) {
      const k = s.doc + ' §' + s.num;
      if (seenS.has(k)) continue; seenS.add(k);
      const doc = sp[s.doc];
      const h = doc ? doc.heads.find(x => x.num === s.num) : null;
      items.push(k + (h ? ' ' + h.title : ''));
      obj.specCites.push({ doc: s.doc, num: s.num, title: h ? h.title : null });
    }
    outLines.push('Also cited: ' + items.join('; ') + '.');
  }
  outLines.push('Name the ruling you rely on before you edit.');
  void listed;
  return emitNear(input, argv, outLines.join('\n'), obj);
}
// The header names the ledger relative to the project root. When the directory the host names is not an
// ancestor of the ledger, the path is relative to the ledger's git root, and absolute when there is none.
function ledgerLabel(pr, lp) {
  if (pr && !rel(pr, lp).startsWith('..')) return rel(pr, lp);
  const g = gitRoot(path.dirname(lp));
  return g ? rel(g, lp) : lp;
}
// --json prints the window as an object; when the input carries a hook event name, the text is wrapped in the
// hook's dialect; otherwise plain text. Silence is silence in every dialect.
function emitNear(input, argv, text, obj) {
  if (argv.json) { out(JSON.stringify(obj, null, 2)); return 0; }
  if (typeof input.hook_event_name === 'string' && input.hook_event_name) {
    out(JSON.stringify({ hookSpecificOutput: { hookEventName: input.hook_event_name, additionalContext: text } }));
  } else out(text);
  return 0;
}

// ─── 6. index / query / governs / principles ────────────────────────────────

function rulingJson(r) {
  return { id: r.id, prefix: r.prefix, n: r.n, line: r.line, heading: r.heading, title: r.title, meta: r.meta, grounding: r.grounding,
    issue: r.issue, principle: r.principle, edges: r.edges.map(e => ({ from: e.from, adverb: e.adverb, verb: e.verb, to: e.to, qualifier: e.qualifier, clause: e.clause, line: e.line })),
    addenda: r.addenda, body: r.body };
}
function indexOf_(argv) {
  const { root, ledger } = ledgerFromCwd(argv);
  const sp = ledgerSpecs(ledger);
  const obj = { ledger: rel(root, ledger.path), prefixes: ledger.prefixes, contractFrom: ledger.contractFrom, baseline: ledger.hasBaseline ? ledger.baseline : null,
    rulings: ledger.rulings.map(rulingJson), sections: ledger.sections,
    specs: { UIUX: sp.UIUX ? sp.UIUX.heads : null, PRD: sp.PRD ? sp.PRD.heads : null } };
  out(JSON.stringify(obj, null, 2));
  return 0;
}
function inEdges(ledger, id) { const r = []; for (const o of ledger.rulings) for (const e of o.edges) if (e.to === id) r.push(e); return r; }
// D3: the edges with their clauses, in and out; no status is computed for any ruling.
function printRuling(ledger, r, lines) {
  lines.push(r.id + '  ' + r.title + (r.issue !== null ? '  · issue #' + r.issue : '') + '  (' + path.basename(ledger.path) + ':' + r.line + ')');
  for (const e of r.edges) lines.push('  → ' + renderEdge(e) + '  — "' + e.clause + '"');
  for (const e of inEdges(ledger, r.id)) lines.push('  ← ' + renderEdge(e) + '  — "' + e.clause + '"');
  for (const a of r.addenda) lines.push('  > Addendum ' + a.date + ': ' + a.text);
}
function query(argv) {
  const term = argv._[1];
  if (!term) die('usage: docket query <term>', 2);
  const { ledger } = ledgerFromCwd(argv);
  const t = term.toLowerCase();
  const hits = ledger.rulings.filter(r => r.id.toLowerCase() === t || r.heading.toLowerCase().includes(t) || r.body.toLowerCase().includes(t));
  if (argv.json) { out(JSON.stringify(hits.map(r => Object.assign(rulingJson(r), { inEdges: inEdges(ledger, r.id).map(e => ({ from: e.from, verb: e.verb, adverb: e.adverb, to: e.to, qualifier: e.qualifier, clause: e.clause })) })), null, 2)); return 0; }
  const lines = [];
  if (!hits.length) lines.push('no ruling matches "' + term + '" in ' + path.basename(ledger.path));
  for (const r of hits) printRuling(ledger, r, lines);
  out(lines.join('\n'));
  return 0;
}
// FORMAT.md 12: an id resolves exactly; failing that, whatever its case, when that is unambiguous.
function resolveRuling(ledger, id) {
  const exact = ledger.byId.get(id);
  if (exact) return { r: exact };
  const same = ledger.rulings.filter(x => x.id.toLowerCase() === String(id).toLowerCase());
  if (same.length === 1) return { r: same[0] };
  if (same.length > 1) return { r: null, ambiguous: same.map(x => x.id) };
  return { r: null };
}
function governs(argv) {
  const id = argv._[1];
  if (!id) die('usage: docket governs <id>', 2);
  const { root, ledger } = ledgerFromCwd(argv);
  const res = resolveRuling(ledger, id);                                // an id is a name, and a name is read whatever its case, as query reads one
  if (res.ambiguous) die('no ruling ' + id + ' in ' + rel(root, ledger.path) + '; ' + res.ambiguous.join(' and ') + ' differ only in case — name one exactly', 2);
  let r = res.r;
  if (!r) die('no ruling ' + id + ' in ' + rel(root, ledger.path), 2);
  const ctx = loadContext(root);
  const cites = codeCites(ctx, ledger).filter(c => c.id === r.id);
  const ins = inEdges(ledger, r.id);
  if (argv.json) {
    out(JSON.stringify({ ruling: rulingJson(r), outEdges: r.edges, inEdges: ins, addenda: r.addenda, cites: cites.map(c => ({ file: c.rel, line: c.line, text: c.text.trim() })) }, null, 2));
    return 0;
  }
  const lines = [];                                                    // D3: an edge list, never a status
  lines.push(r.id + '  ' + r.title + (r.issue !== null ? '  · issue #' + r.issue : '') + '  (' + rel(root, ledger.path) + ':' + r.line + ')');
  lines.push('Out-edges (what ' + r.id + ' does to earlier rulings):');
  if (!r.edges.length) lines.push('  none'); for (const e of r.edges) lines.push('  ' + renderEdge(e) + '  — "' + e.clause + '"');
  lines.push('In-edges (what later rulings do to ' + r.id + '):');
  if (!ins.length) lines.push('  none'); for (const e of ins) lines.push('  ' + renderEdge(e) + '  — "' + e.clause + '"');
  lines.push('Addenda:');
  if (!r.addenda.length) lines.push('  none'); for (const a of r.addenda) lines.push('  ' + a.date + ': ' + a.text);
  lines.push('Code cites:');
  if (!cites.length) lines.push('  none'); for (const c of cites) lines.push('  ' + c.rel + ':' + c.line + '  ' + c.text.trim().slice(0, 100));
  out(lines.join('\n'));
  return 0;
}
function principles(argv) {
  const { root, ledger } = ledgerFromCwd(argv);
  const p = principlesOf(ledger);
  if (argv.json) { out(JSON.stringify({ source: p.source ? rel(root, p.source) : null, list: p.list, skipped: p.skipped || [] }, null, 2)); return p.list.length ? 0 : 1; }   // one exit code for both branches (FORMAT.md 10)   // paths in JSON are root-relative, as everywhere else
  if (!p.list.length) { out('no principles list found (the first section of PRD.md, or the ledger preamble)'); return 1; }
  out(p.list.map(x => x.text).join('\n'));
  for (const li of (p.skipped || [])) out('info  ' + (p.source ? rel(root, p.source) : 'the preamble') + ':' + li + ': a bullet with no bolded name — no principle to cite (FORMAT.md 10)');
  return 0;
}

// ─── 7. check: the seven checks ─────────────────────────────────────────────

function flag(argv, name) { const i = argv.raw.indexOf(name); return i >= 0 && i + 1 < argv.raw.length ? argv.raw[i + 1] : null; }
function has(argv, name) { return argv.raw.includes(name); }

// Returns { failures: [{file, line, k, message}], info: [string] } for every ledger under root.
function runCheck(root, opts) {
  opts = opts || {};
  const ctx = opts.ctx || loadContext(root);
  const failures = [], info = [];
  const fail = (file, line, k, message) => failures.push({ file: rel(root, file), line, k, message });
  for (const v of ctx.vendored || []) info.push(v + ': the vendored witness, a copy of this program — not read as a governed file (D9)');
  for (const [lp, ledger] of ctx.ledgers) {
    const files = ctx.files.filter(e => e.ledger === lp);
    const sp = ledgerSpecs(ledger);
    // FORMAT.md 1: a ledger with no entries governs nothing — its subtree is ungoverned, none of the seven checks runs
    // on its files, and the docket says so. Check 7 still reads the ledger itself: emptying a committed ledger removes entries.
    const empty = ledger.rulings.length === 0;
    const under = files.filter(e => e.path !== lp).length;             // the subtree's files, the ledger itself aside
    if (empty) info.push(rel(root, lp) + ': no entries; its subtree is ungoverned and no check runs on its ' + under + ' file' + (under === 1 ? '' : 's'));
    // 1. every cite names a ruling that exists
    for (const e of empty ? [] : files) {
      for (const c of citesIn(fileText(e), ledger)) if (!c.exists) fail(e.path, c.line, 1, 'cite ' + c.id + ' names no ruling in ' + rel(root, lp));
    }
    // 2. numbering contiguous per prefix, in order of appearance
    const seenN = {};
    for (const r of ledger.rulings) {
      const expect = (seenN[r.prefix] || 0) + 1;                       // FORMAT.md 12: each number is its position
      if (r.n !== expect) fail(lp, r.line, 2, 'numbering: ' + r.id + ' is entry ' + expect + ' of the ' + r.prefix + ' entries; expected ' + r.prefix + expect);
      seenN[r.prefix] = expect;                                        // the position advances, whatever the number said
    }
    for (const r of ledger.rulings) {                                  // FORMAT.md 2: an entry is read, so it carries nothing that changes what a reader sees
      for (const [li, text] of [[r.line, r.heading]].concat(r.bodyLines.map((b, k) => [r.line + 1 + k, b]))) {
        const m = UNSAFE_RE.exec(text);
        if (m) { fail(lp, li, 2, r.id + ': the text carries ' + unsafeName(m[0]) + ', which changes what a reader is shown without changing what is written (FORMAT.md 2)'); break; }
      }
    }
    for (const e of empty ? [] : files) {                              // a spec cite with its space missing is a typo named, not a bare cite counted (FORMAT.md 8)
      const ls = splitLines(fileText(e)), fenced = fencedLines(ls);
      ls.forEach((l, i) => {
        if (fenced[i]) return;
        for (const g of maskCode(l).matchAll(GLUED_CITE_RE)) fail(e.path, i + 1, 3, g[1] + '\u00a7' + g[2] + ' is written without the space the grammar reads; a spec cite is "' + g[1] + ' \u00a7' + g[2] + '"');
      });
    }
    // 3. every UIUX §x / PRD §x cite resolves
    for (const e of empty ? [] : files) {
      for (const c of specCitesIn(fileText(e))) {
        const doc = sp[c.doc];
        if (!doc) fail(e.path, c.line, 3, c.doc + ' §' + c.num + ' cited but no ' + c.doc + '.md sits beside ' + rel(root, lp));
        else if (!doc.heads.some(h => h.num === c.num)) fail(e.path, c.line, 3, c.doc + ' §' + c.num + ' names no heading in ' + rel(root, doc.path));
      }
    }
    // 4. bare-§ ratchet — its baseline first: a second comment or a malformed pair (FORMAT.md 9)
    for (const f of ledger.directiveFaults) if (f.k === 4) fail(lp, f.line, 4, f.message);
    for (const e of empty ? [] : files) {
      if (isSpecDoc(e, ledger)) continue;
      const n = bareCitesIn(fileText(e));
      if (n === 0) continue;
      const key = rel(ledger.home, e.path);
      if (ledger.hasBaseline) {
        const allow = ledger.baseline[key] || 0;
        if (n > allow) fail(e.path, firstBareLine(fileText(e)), 4, 'bare-§ cites: ' + n + ' > allowance ' + allow + ' for ' + key);
      } else info.push(rel(root, e.path) + ': ' + n + ' bare-§ cites (no baseline in ' + rel(root, lp) + '; reported, not failed)');
    }
    // 5. edges target earlier rulings, never the source itself
    for (const r of ledger.rulings) {
      for (const ed of r.edges) {
        const t = ledger.byId.get(ed.to);
        if (!t) fail(lp, ed.line, 5, 'edge ' + renderEdge(ed) + ': ' + ed.to + ' does not exist');
        else if (!(t.line < r.line)) fail(lp, ed.line, 5, 'edge ' + renderEdge(ed) + ': ' + (t.id === r.id ? 'a ruling may not name itself' : ed.to + ' is defined later (line ' + t.line + ') than ' + r.id + ' (line ' + r.line + ')'));   // strictly earlier: a self-edge is not earlier
      }
    }
    // 6. header contract for entries bound by the contract line — the line itself first (FORMAT.md 11)
    for (const f of ledger.directiveFaults) if (f.k === 6) fail(lp, f.line, 6, f.message);
    for (const pfx of empty ? [] : Object.keys(ledger.contractFrom)) { // a contract for a prefix no entry uses binds nothing, and a typo is exactly that (FORMAT.md 11, 12)
      if (!ledger.prefixes.includes(pfx)) fail(lp, ledger.contractFromLine[pfx] || 1, 6, 'the contract line names prefix ' + pfx + ', which no entry uses' + (ledger.prefixes.length ? ' — this ledger\'s prefixes are ' + ledger.prefixes.join(', ') : '') + '; it binds nothing');
    }
    const prin = principlesOf(ledger);
    for (const li of (prin.skipped || [])) info.push(rel(root, prin.source || lp) + ':' + li + ': a bullet with no bolded name in the principles list — no principle to cite (FORMAT.md 10)');
    if (prin.ambiguous) fail(lp, prin.ambiguous[1], 6, 'two lines name Principles and each is followed by a list (lines ' + prin.ambiguous.join(' and ') + '); the preamble carries one principles list (FORMAT.md 10)');
    for (const r of ledger.rulings) {
      const from = ledger.contractFrom[r.prefix];
      if (from === undefined || r.n < from) continue;
      const { meta, end } = metaOf(r.heading);
      if (!r.title) fail(lp, r.line, 6, r.id + ': title is empty — a bound entry is named in words (FORMAT.md 3, 11)');
      if (!meta || end !== r.heading.length - 1) fail(lp, r.line, 6, r.id + ': heading does not end with a parenthetical meta');
      const clauses = meta && end === r.heading.length - 1 ? clausesOf(meta) : [];
      if (meta && end === r.heading.length - 1) {
        if (!clauses.length || isEdgeClause(clauses[0])) fail(lp, r.line, 6, r.id + ': meta must open with a grounding (issue #n or a context), not an edge');
        for (const c of clauses.slice(1)) if (!isEdgeClause(c)) fail(lp, r.line, 6, r.id + ': meta clause is not an edge: "' + c + '"');
      }
      if (!r.principle) fail(lp, r.line, 6, r.id + ': no "Principle:" line');
      else if (!prin.list.length) fail(lp, r.line, 6, r.id + ': names a principle but no principles list was found');
      else if (!principleNamed(prin.list, r.principle)) fail(lp, r.line, 6, r.id + ': principle "' + r.principle + '" is not in the list (' + prin.list.map(p => p.name).join(' · ') + ')');
      if (!r.hasReason) fail(lp, r.line, 6, r.id + ': body has no "Reason:"');   // quoted in code, it is not stated (FORMAT.md 5)
    }
    // 7. append only: existing headings and bodies unchanged vs the committed ledger
    // FORMAT.md 8: a fence quotes everything to the next fence line; one never closed quotes the rest of the ledger,
    // cites included, and check 1, 3 and 4 would read none of it. The fault is the fence, and it is named.
    const fenceAt = ledger.lines.map((l, i) => (/^\s*```/.test(l) ? i + 1 : 0)).filter(Boolean);
    if (fenceAt.length % 2 === 1) fail(lp, fenceAt[fenceAt.length - 1], 2, 'a fence opened here is never closed; every line after it is read as code, cites included (FORMAT.md 8)');
    const committed = committedText(root, lp, ledger.text);
    if (committed === null) info.push(rel(root, lp) + ': check 7 skipped — no earlier version to compare (the ledger is not yet committed, or the revision compared with has no such file: a first commit, or the commit that added it)');   // FORMAT.md 13: the skip is said, not silent
    if (committed !== null) {
      const old = parseLedger(committed, lp);
      for (const o of old.rulings) {
        const cur = ledger.byId.get(o.id);
        if (!cur) { fail(lp, o.line, 7, o.id + ' was removed (append only)'); continue; }
        if (cur.heading !== o.heading) fail(lp, cur.line, 7, o.id + ': heading changed (append only): "' + o.heading + '" → "' + cur.heading + '"');
        if (!bodyOnlyAppended(o.bodyLines, cur.bodyLines)) fail(lp, cur.line, 7, o.id + ': body changed other than by appended addendum lines (append only)');
      }
    }
  }
  // A ledger the compared revision has and the working tree lacks is the most complete amendment there is (D4).
  const groot = gitRoot(root);
  if (groot) {
    const base = baseRevision();
    const rev = base && sh('git', ['rev-parse', '--verify', '-q', base + '^{commit}'], groot).status === 0 ? base : 'HEAD';
    const ls = sh('git', ['ls-tree', '-r', '--name-only', rev], groot);
    if (ls.status === 0) for (const p of ls.stdout.split('\n')) {
      if (!/(^|\/)DECISIONS\.md$/.test(p)) continue;
      const full = path.join(groot, p);
      if (isWithin(full, path.resolve(root)) && !isFile(full)) fail(full, 1, 7, 'the ledger is gone from the working tree (append only); ' + rev + ' has it');
    }
  }
  return { failures, info, ctx };
}
function firstBareLine(text) { const ls = splitLines(text), fenced = fencedLines(ls); for (let i = 0; i < ls.length; i++) { if (fenced[i]) continue; BARE_CITE_RE.lastIndex = 0; if (BARE_CITE_RE.test(maskCode(ls[i]))) return i + 1; } return 1; }
function trimBlank(lines) { const a = lines.slice(); while (a.length && a[a.length - 1].trim() === '') a.pop(); return a; }
function bodyOnlyAppended(oldLines, newLines) {
  const o = trimBlank(oldLines), n = trimBlank(newLines);
  if (n.length < o.length) return false;
  for (let i = 0; i < o.length; i++) if (o[i] !== n[i]) return false;
  return n.slice(o.length).every(l => l.trim() === '' || ADDENDUM_RE.test(l));
}
// The committed ledger for check 7: HEAD's, or HEAD's parent's when the ledger in the working tree already
// equals HEAD's, so a check run on a fresh commit (as in CI) judges the commit it was given; null when no
// such version exists, and then the check is skipped.
function normEol(s) { return s.replace(/\r\n/g, '\n'); }
// DOCKET_BASE, when the environment names a revision (CI names the commit before the push), is the version compared
// with: an amendment in the middle of a pushed range is then seen, where a tip-only comparison would miss it. Unset
// or unreadable, the rule is HEAD's, or HEAD's parent's when the tree already equals HEAD.
function baseRevision() {
  const b = process.env.DOCKET_BASE;
  return b && /^[A-Za-z0-9_./~^-]{1,64}$/.test(b) && !/^0+$/.test(b) ? b : null;
}
function namesHead(rev, groot) {
  const a = sh('git', ['rev-parse', '--verify', '--quiet', rev + '^{commit}'], groot), h = sh('git', ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], groot);
  return a.status === 0 && h.status === 0 && a.stdout.trim() === h.stdout.trim();
}
function committedText(root, filePath, workingText) {
  const groot = gitRoot(path.dirname(filePath)) || root;               // git resolves <rev>:<path> from the repository root, whatever the enumeration root is
  const p = rel(groot, filePath);
  const base = baseRevision();
  if (base && !namesHead(base, groot)) { const b = sh('git', ['show', base + ':' + p], groot); if (b.status === 0) return b.stdout; }   // a base that names HEAD itself would compare a clean commit with itself and witness nothing: read as unset, so the parent rule below applies
  const head = sh('git', ['show', 'HEAD:' + p], groot);
  if (head.status !== 0) return null;
  let working = workingText;                                           // the caller's own reading: one run holds one version of a ledger, the comparison included
  if (working === undefined) { try { working = readText(filePath); } catch (e) { return head.stdout; } }
  if (normEol(working) !== normEol(head.stdout)) return head.stdout;  // FORMAT.md 1: both sides normalised
  const parent = sh('git', ['show', 'HEAD~1:' + p], groot);
  return parent.status === 0 ? parent.stdout : null;
}
function check(argv) {
  if (has(argv, '--ledger')) die('check: no --ledger option — check covers every ledger under the root (index, query, governs, principles, status, spec-check and append take --ledger)', 2);
  const root = enumerationRoot(process.cwd());
  const res = runCheck(root);
  if (argv.json) { out(JSON.stringify({ ok: res.failures.length === 0, failures: res.failures, info: res.info }, null, 2)); return res.failures.length ? 1 : 0; }
  for (const f of res.failures) out(f.file + ':' + f.line + '  check ' + f.k + ': ' + f.message);
  for (const i of res.info) out('info  ' + i);
  if (!res.failures.length) out('check: ok (' + res.ctx.ledgers.size + ' ledger' + (res.ctx.ledgers.size === 1 ? '' : 's') + ', ' + res.ctx.files.length + ' governed-tree file' + (res.ctx.files.length === 1 ? '' : 's') + ')');
  return res.failures.length ? 1 : 0;
}

// ─── 8. spec-check: token rows and contrast rows ────────────────────────────

const HEX = '#(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{3})(?![0-9A-Fa-f])';   // a CSS hex colour has 3, 4, 6 or 8 digits and no other count
const TOKEN_ROW_RE = new RegExp('^\\|\\s*`(--[A-Za-z0-9_-]+)`\\s*\\|\\s*`(' + HEX + ')`\\s*\\|');
const HEXISH_ROW_RE = /^\|\s*`(--[A-Za-z0-9_-]+)`\s*\|\s*`(#[^`]*)`\s*\|/;                                // a row shaped like a token row whose value opens with #
// C0 and C1 controls except tab, and the characters that reorder what a terminal shows.
const UNSAFE_RE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/;
const UNSAFE_RE_G = new RegExp(UNSAFE_RE.source, 'g');
const UNSAFE_NAME = { '\u200e': 'LRM', '\u200f': 'RLM', '\u202a': 'LRE', '\u202b': 'RLE', '\u202c': 'PDF', '\u202d': 'LRO', '\u202e': 'RLO', '\u2066': 'LRI', '\u2067': 'RLI', '\u2068': 'FSI', '\u2069': 'PDI' };
function unsafeName(ch) { return UNSAFE_NAME[ch] || 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'); }
// What a reader is shown never carries them, whatever a ledger holds: check says so, and until it is
// fixed the text still reads straight.
const UNSAFE_OUT_RE_G = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
function plain(t) { return String(t).replace(UNSAFE_OUT_RE_G, '\ufffd'); }
const CONTRAST_RE = /(\d+(?:\.\d+)?):1/;
const CONTRAST_RE_ALL = /(\d+(?:\.\d+)?):1/g;
function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// A decimal as written, in hundredths, rounded half-up on its own digits: "1.005" is 101, where float arithmetic
// on the value (1.005 * 100 = 100.49999…) would say 100 (FORMAT.md 13).
function hundredths(s) {
  const m = /^(\d+)(?:\.(\d*))?$/.exec(s);
  if (!m) return NaN;
  const frac = (m[2] || '') + '000';
  return Number(m[1]) * 100 + Number(frac.slice(0, 2)) + (frac.charCodeAt(2) >= 0x35 ? 1 : 0);   // a third digit of 5 or more rounds up
}
function fixed2(h) { return Math.floor(h / 100) + '.' + String(h % 100).padStart(2, '0'); }
function contrast(hexA, hexB) { const a = luminance(hexA), b = luminance(hexB); const [hi, lo] = a >= b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); }
function runSpecCheck(root, ctx, onlyLedger) {
  ctx = ctx || loadContext(root);
  const failures = [], info = [];
  let rows = 0;
  for (const [lp, ledger] of ctx.ledgers) {
    if (onlyLedger && lp !== onlyLedger) continue;
    const docs = specDocs(lp);
    if (!docs.uiux) continue;
    if (!ledger.rulings.length) {                                      // FORMAT.md 1: no entries, nothing governed — the same exemption check makes, said the same way
      info.push(rel(root, lp) + ': no entries; its subtree is ungoverned and spec-check reads no row beside it');
      continue;
    }
    const specLines = splitLines(readText(docs.uiux));
    const cssFiles = ctx.files.filter(e => e.ledger === lp && /\.css$/i.test(e.path));
    const decls = new Map(); // token -> [{value, file, line}]
    for (const e of cssFiles) splitLines(fileText(e).replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))).forEach((l, i) => {   // a comment is not a declaration; blanked, so line numbers hold
      const re = new RegExp('(--[A-Za-z0-9_-]+)\\s*:\\s*(' + HEX + ')', 'g'); let m;
      while ((m = re.exec(l)) !== null) { if (!decls.has(m[1])) decls.set(m[1], []); decls.get(m[1]).push({ value: m[2].toLowerCase(), file: e.path, line: i + 1 }); }
    });
    const specValue = new Map();
    specLines.forEach((l, i) => {
      const m = TOKEN_ROW_RE.exec(l);
      if (!m) {
        const h = HEXISH_ROW_RE.exec(l);                                // not a hex of 3, 4, 6 or 8 digits: the typo is named, not skipped
        if (h) failures.push({ file: rel(root, docs.uiux), line: i + 1, k: 'a', message: h[1] + ' is ' + h[2] + ' in the spec, which is not a CSS hex colour (3, 4, 6 or 8 digits)' });
        return;
      }
      rows++;
      const token = m[1], hex = m[2].toLowerCase();
      specValue.set(token, hex);
      const d = decls.get(token);
      if (!d) failures.push({ file: rel(root, docs.uiux), line: i + 1, k: 'a', message: token + ' is ' + hex + ' in the spec but is declared in no CSS file that resolves to ' + rel(root, lp) });
      else if (!d.some(x => x.value === hex)) failures.push({ file: rel(root, docs.uiux), line: i + 1, k: 'a', message: token + ' is ' + hex + ' in the spec but ' + d.map(x => x.value + ' at ' + rel(root, x.file) + ':' + x.line).join(', ') });
      else for (const x of d) if (x.value !== hex) info.push(rel(root, docs.uiux) + ':' + (i + 1) + ': ' + token + ' is ' + hex + ' in the spec and one declaration matches; ' + x.value + ' at ' + rel(root, x.file) + ':' + x.line + ' is a second value (a theme, or a stray)');
    });
    const valueOf = t => specValue.get(t) || (decls.get(t) ? decls.get(t)[0].value : null);
    specLines.forEach((l, i) => {
      if (!/^\|/.test(l)) return;
      const toksAll = uniq(Array.from(l.matchAll(/`(--[A-Za-z0-9_-]+)`/g)).map(m => m[1]));
      const cm = CONTRAST_RE.exec(l);
      if (!cm) {
        // two tokens and no ratio the grammar reads: the row means to assert one and does not.
        if (toksAll.length === 2 && /\d\s*(?::\s*1\b|to\s+1\b)/.test(l)) { rows++; failures.push({ file: rel(root, docs.uiux), line: i + 1, k: 'b', message: toksAll.join(' on ') + ': the ratio is not written as <n>:1, so no ratio is read from this row' }); }
        return;
      }
      const toks = toksAll;
      if (toks.length === 0) return;                                   // a ratio in prose, no tokens: not a contrast row
      rows++;
      const allRatios = uniq((l.match(CONTRAST_RE_ALL) || []));
      if (allRatios.length > 1) { failures.push({ file: rel(root, docs.uiux), line: i + 1, k: 'b', message: 'contrast row states ' + allRatios.join(' and ') + '; a row states one ratio, and the first is not a rule' }); return; }
      if (toks.length !== 2) { failures.push({ file: rel(root, docs.uiux), line: i + 1, k: 'b', message: 'contrast row names ' + toks.length + ' tokens; a contrast row names exactly two' }); return; }
      const a = valueOf(toks[0]), b = valueOf(toks[1]);
      if (!a || !b) { failures.push({ file: rel(root, docs.uiux), line: i + 1, k: 'b', message: 'contrast row: no hex known for ' + (a ? toks[1] : toks[0]) }); return; }
      for (const [tok, hx] of [[toks[0], a], [toks[1], b]]) if (hx.length === 5 || hx.length === 9) {   // #rgba or #rrggbbaa
        failures.push({ file: rel(root, docs.uiux), line: i + 1, k: 'b', message: 'contrast row: ' + tok + ' is ' + hx + ', which carries an alpha channel; what it meets the eye as depends on what lies behind it, so a ratio cannot be recomputed from it' });
        return;
      }
      const statedH = hundredths(cm[1]), gotH = Math.round(contrast(a, b) * 100);   // both in hundredths: the stated one from its digits, the computed one from its value
      if (gotH !== statedH) failures.push({ file: rel(root, docs.uiux), line: i + 1, k: 'b', message: toks[0] + ' on ' + toks[1] + ' states ' + fixed2(statedH) + ':1 but the hexes give ' + fixed2(gotH) + ':1' });
    });
  }
  return { failures, info, rows };
}
function specCheck(argv) {
  const s = scope(argv);
  const res = runSpecCheck(s.root, null, has(argv, '--all') ? null : s.ledger);
  if (argv.json) { out(JSON.stringify({ ok: res.failures.length === 0, rows: res.rows, info: res.info, failures: res.failures }, null, 2)); return res.failures.length ? 1 : 0; }
  for (const f of res.failures) out(f.file + ':' + f.line + '  spec-check ' + f.k + ': ' + f.message);
  for (const i of res.info) out('info  ' + i);
  if (!res.failures.length) out('spec-check: ok (' + res.rows + ' rows)');
  return res.failures.length ? 1 : 0;
}

// ─── 9. append: entry, addendum, baseline (D4, D8) ──────────────────────────

function flags(argv, name) { const r = []; for (let i = 0; i < argv.raw.length; i++) if (argv.raw[i] === name && i + 1 < argv.raw.length) r.push(argv.raw[i + 1]); return r; }
// A CRLF ledger stays CRLF through every write (FORMAT.md 1): the line ending is read once, from the file.
// Atomic within the directory: a reader sees the ledger before the write or after it, never half of it.
function writeLedger(ledger, text) {
  const crlf = (ledger.text.match(/\r\n/g) || []).length, lf = (ledger.text.match(/(^|[^\r])\n/g) || []).length;
  if (crlf && lf) die('append: ' + ledger.path + ' ends some lines with CRLF and some with LF; a write would have to give the whole file one ending, rewriting lines this entry does not touch, and the ledger is append only (FORMAT.md 1; D4)', 2);
  if (crlf) text = text.replace(/\r?\n/g, '\r\n');
  const tmp = ledger.path + '.docket-' + process.pid;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, ledger.path);
}
// A ledger that two sessions can append to at once is a ledger that can lose an entry: each would read the same last
// id, compute the same next one, and the later write would carry the earlier one away while both callers were told the
// entry was written. So a write command takes an exclusive lock beside the ledger and re-reads it inside the lock: the
// id it computes is the id it writes (D4 — append, never amend; a record that can be rewritten proves nothing).
const LOCK_WAIT_MS = 5000;
function lockedLedger(argv) {
  const scoped = ledgerFromCwd(argv);
  const lockPath = scoped.ledger.path + '.lock';
  const mine = 'docket ' + process.pid + '\n';
  let fd = null, waited = 0;
  while (fd === null) {
    try { fd = fs.openSync(lockPath, 'wx'); fs.writeSync(fd, mine); }   // the holder names itself, so a release frees its own lock and no other
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (waited >= LOCK_WAIT_MS) die('append: ' + rel(scoped.root, scoped.ledger.path) + ' is held by another append that has not finished; if none is running, remove ' + rel(scoped.root, lockPath), 2);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25); waited += 25;   // a plain sleep, no dependency
    }
  }
  // Released once, and only while it is still ours: a second release at exit, after another append has
  // taken the lock, would unlink that one's and let two writers read the same last id.
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try { fs.closeSync(fd); } catch (e) {}
    try { if (fs.readFileSync(lockPath, 'utf8') === mine) fs.unlinkSync(lockPath); } catch (e) {}
  };
  process.on('exit', release);                                        // die() exits, so the lock never outlives the command
  return { root: scoped.root, ledger: loadLedger(scoped.ledger.path), release };
}
function ensureNl(s) { return s.endsWith('\n') ? s : s + '\n'; }
// One verb may name several targets joined by "/" — the grammar reads it (5), so the writer produces it: one edge per target.
function parseEdgeArg(s) {
  const re = new RegExp('^(?:(' + caseHead(ADVERBS).join('|') + ')\\s+)?(' + caseHead(VERBS).join('|') + ')\\s+([A-Za-z]+\\d+(?:\\/[A-Za-z]+\\d+)*)(?:\\s*\\(([^()]*)\\))?$');
  const m = re.exec(s.trim());
  if (!m) return null;
  return { adverb: (m[1] || '').toLowerCase(), verb: m[2].toLowerCase(), tos: m[3].split('/'), qualifier: m[4] || '' };
}
function appendEntry(argv) {
  const { root, ledger, release } = lockedLedger(argv);
  const entry = buildEntry(argv, root, ledger);
  const text = (ledger.text.trim() ? ensureNl(ledger.text) + '\n' : '') + entry;   // an empty ledger opens with its entry, not with blank lines
  writeLedger(ledger, text);
  release();
  return afterWrite(argv, root, ledger, entry);
}
// Everything append refuses, it refuses here, before any write; constitute builds its first entry through
// this same function so a constitution cannot carry what a ruling could not.
function buildEntry(argv, root, ledger) {
  const title = flag(argv, '--title'), issue = flag(argv, '--issue'), principle = flag(argv, '--principle'), body = flag(argv, '--body');
  const edges = flags(argv, '--edge');
  if (!title || !title.trim()) die('append: --title is required (one line, the ruling in a phrase)', 2);
  if (/[\r\n\u2028\u2029]/.test(title)) die('append: --title is one line — a line break would open a second heading (FORMAT.md 2, 3)', 2);
  if (!stripMarks(title.trim()).trim()) die('append: --title renders empty — marks alone are no title; give the ruling in words (FORMAT.md 3)', 2);
  if (metaStart(title) >= 0) die('append: --title may not contain " (" outside a code span — the title rule would cut it there; put the parenthetical in the body', 2);   // the same reader as the title rule
  if (!issue || !issue.trim()) die('append: --issue is required (an issue number, or a phrase naming the context the ruling answers)', 2);
  if (/[\r\n\u2028\u2029]/.test(issue)) die('append: --issue is one line — the meta sits on the heading line (FORMAT.md 4)', 2);
  if (/[;()]/.test(issue)) die('append: --issue may not contain ";", "(" or ")" — the meta is one parenthetical whose clauses are split on ";" (FORMAT.md 4)', 2);
  if (!principle || !principle.trim()) die('append: --principle is required (one of `docket principles`)', 2);
  const prin = principlesOf(ledger);
  if (!prin.list.length) die('append: no principles list found (the first section of PRD.md, or a "Principles" list in the ledger preamble)', 2);
  const pr = principleNamed(prin.list, principle);
  if (!pr) die('append: principle "' + principle + '" is not one of: ' + prin.list.map(p => p.name).join(' · '), 2);
  if (!body || !body.trim()) die('append: --body is required (the ruling in prose, with its Reason:)', 2);
  for (const [name, v] of [['--title', title], ['--issue', issue], ['--principle', principle], ['--body', body]].concat(edges.map(e => ['--edge', e]))) {
    const um = UNSAFE_RE.exec(v);                                      // check 2 would fail the entry for ever; it is refused before it is written
    if (um) die('append: ' + name + ' carries U+' + um[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0') + ', a control or bidi character the ledger refuses (check 2); once written it could never be unwritten', 2);
  }
  if ((splitLines(body).filter(l => /^\s*```/.test(l)).length % 2) === 1) die('append: --body opens a fence it does not close; every line after it, in this entry and the next, would be read as code (FORMAT.md 8)', 2);

  if (!assertsReason(splitLines(body))) die('append: --body must state the reason as a sentence beginning "Reason:" (outside code spans and fenced blocks)', 2);
  if (splitLines(body).some(l => ADDENDUM_RE.test(l))) die('append: --body may not carry an addendum line; an addendum is written by append --addendum and dated by the tool (FORMAT.md 6)', 2);
  if (splitLines(body).some(isBoundary)) die('append: --body may not carry an entry or section heading line — a body opens no entry; the heading is the tool\'s to write (FORMAT.md 2, 7, 11)', 2);
  { const bl = splitLines(body), bf = fencedLines(bl); if (bl.some((l, k) => !bf[k] && /^Principle:\s/.test(l))) die('append: --body may not carry a Principle: line; the tool writes it from --principle, and two would leave the reader to guess (FORMAT.md 11)', 2); }
  const parsedEdges = [], edgeKeys = new Set();
  for (const e of edges) {
    if (/[\r\n\u2028\u2029]/.test(e)) die('append: --edge "' + e.replace(/[\r\n]+/g, ' ') + '" is one line — the meta sits on the heading line (FORMAT.md 4)', 2);
    const p = parseEdgeArg(e);
    if (!p) die('append: --edge "' + e + '" is not "<verb> <id>" with a verb from: ' + VERBS.join(', '), 2);
    if (/;/.test(p.qualifier)) die('append: --edge "' + e + '": a qualifier may not contain ";" — the meta\'s clauses are split on it (FORMAT.md 4)', 2);
    p.tos = p.tos.map(to => {                                           // the target is read whatever its case, as governs reads one
      const res = resolveRuling(ledger, to);
      if (res.ambiguous) die('append: --edge "' + e + '" names ' + to + '; ' + res.ambiguous.join(' and ') + ' differ only in case — name one exactly', 2);
      if (!res.r) die('append: --edge "' + e + '" names ' + to + ', which is not in ' + rel(root, ledger.path), 2);
      return res.r.id;
    });
    const k = [p.adverb, p.verb, p.tos.join('/'), p.qualifier].join('|');
    if (edgeKeys.has(k)) continue;                                      // the same edge given twice is one edge
    edgeKeys.add(k); parsedEdges.push(p);
  }
  let prefix = flag(argv, '--prefix');
  if (!prefix) prefix = ledger.rulings.length ? ledger.rulings[ledger.rulings.length - 1].prefix : null;
  if (!prefix) die('append: --prefix is required for an empty ledger', 2);
  if (!/^[A-Za-z]+$/.test(prefix)) die('append: --prefix must be letters', 2);
  const n = ledger.rulings.filter(r => r.prefix === prefix).reduce((m, r) => Math.max(m, r.n), 0) + 1;
  if (String(n).length > NUMERAL_MAX_DIGITS) die('append: the ' + prefix + ' entries end at ' + (n - 1) + ', the largest number the grammar allows (' + NUMERAL_MAX_DIGITS + ' digits); a further ruling needs a new prefix — pass --prefix (FORMAT.md 2, 12)', 2);
  // The ledger is append only: an entry whose text names a ruling that does not exist is refused before it is written,
  // not failed by check 1 after (FORMAT.md 8). The entry's own id may appear in its body.
  const probe = parseLedger(ledger.text + '\n### ' + prefix + n + '. x\n', ledger.path);
  for (const c of citesIn(title + '\n' + body, probe)) if (!c.exists) die('append: the entry names ' + c.id + ', which is not in ' + rel(root, ledger.path), 2);
  const selfId = prefix + n;
  for (const li of splitLines(body)) for (const ed of edgesIn(li, selfId, 0, false)) {
    if (ed.to === selfId) die('append: --body says "' + ed.clause.trim() + '", which is an edge from ' + selfId + ' to itself; a ruling may not name itself (FORMAT.md 5), and once written the ledger could never stop failing check 5', 2);
    if (!probe.byId.has(ed.to)) die('append: --body says "' + ed.clause.trim() + '", naming ' + ed.to + ', which is not in ' + rel(root, ledger.path), 2);
  }
  const grounding = /^#?\d+$/.test(issue.trim()) ? 'issue #' + issue.trim().replace('#', '') : issue.trim();
  const metaParts = [grounding].concat(parsedEdges.map(e => (e.adverb ? e.adverb + ' ' : '') + e.verb + ' ' + e.tos.join('/') + (e.qualifier ? ' (' + e.qualifier + ')' : '')));   // one clause, the targets joined as the grammar reads them (5)
  return '### ' + prefix + n + '. ' + title.trim() + ' (' + metaParts.join('; ') + ')\n' + 'Principle: ' + pr.name + '.\n' + body.trim() + '\n';
}
function afterWrite(argv, root, ledger, printed) {
  const res = runCheck(root);
  if (argv.json) { out(JSON.stringify({ written: printed, ok: res.failures.length === 0, failures: res.failures }, null, 2)); return res.failures.length ? 1 : 0; }
  out(printed.trimEnd());
  for (const f of res.failures) out(f.file + ':' + f.line + '  check ' + f.k + ': ' + f.message);
  out(res.failures.length ? 'check: ' + res.failures.length + ' failure(s) — the ledger is written; fix before you rely on it' : 'check: ok');
  return res.failures.length ? 1 : 0;
}
function appendAddendum(argv) {
  const { root, ledger, release } = lockedLedger(argv);
  const id = flag(argv, '--addendum'), text = flag(argv, '--text');
  const r = ledger.byId.get(id);
  if (!r) die('append: --addendum ' + id + ' names no ruling in ' + rel(root, ledger.path), 2);
  if (!text || !text.trim()) die('append: --text is required (why the entry\'s reason no longer holds, or what changed)', 2);
  const um = UNSAFE_RE.exec(text);
  if (um) die('append: --text carries U+' + um[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0') + ', a control or bidi character the ledger refuses (check 2); once written it could never be unwritten', 2);
  for (const c of citesIn(text, ledger)) if (!c.exists) die('append: --text names ' + c.id + ', which is not in ' + rel(root, ledger.path), 2);
  const lines = ledger.lines.slice();
  let end = r.endLine;                       // index of the next heading line (exclusive end of the entry)
  while (end > r.line && lines[end - 1].trim() === '') end--;
  const line = '> Addendum ' + today() + ': ' + text.trim().replace(/\s*\n\s*/g, ' ');
  lines.splice(end, 0, line);
  writeLedger(ledger, ensureNl(lines.join('\n')));
  return afterWrite(argv, root, ledger, line);
}
function rewriteBaseline(argv) {
  const { root, ledger, release } = lockedLedger(argv);
  const ctx = loadContext(root);
  const counts = [];
  for (const e of ctx.files) {
    if (e.ledger !== ledger.path || isSpecDoc(e, ledger)) continue;
    const n = bareCitesIn(fileText(e));
    if (n > 0) counts.push(rel(ledger.home, e.path) + '=' + n);
  }
  const comment = '<!-- docket: bare-cites' + (counts.length ? ' ' + counts.join(' ') : '') + ' -->';
  const lines = ledger.lines.slice();
  const pre = ledger.preambleLines.length;
  let at = -1;
  for (let i = 0; i < pre; i++) if (/<!--\s*docket:\s*bare-cites/.test(lines[i])) at = i;
  if (at >= 0) lines[at] = comment; else lines.splice(pre, 0, comment, '');
  writeLedger(ledger, ensureNl(lines.join('\n')));
  return afterWrite(argv, root, ledger, comment);
}
function append(argv) {
  if (has(argv, '--addendum')) return appendAddendum(argv);
  if (has(argv, '--baseline')) return rewriteBaseline(argv);
  return appendEntry(argv);
}

// ─── 10. status: the docket ─────────────────────────────────────────────────

function statePath(root) { return path.join(root, '.docket', 'verdict.json'); }
function loadState(root) {
  let st = null;
  try { st = JSON.parse(readText(statePath(root))); } catch (e) { st = null; }
  if (!st || typeof st !== 'object' || Array.isArray(st)) st = {};
  // Every field is filled here so that a file written by hand, or half-written, informs rather than throws (D1).
  const sessions = st.sessions && typeof st.sessions === 'object' && !Array.isArray(st.sessions) ? st.sessions : {};
  const last = st.last && typeof st.last === 'object' && !Array.isArray(st.last) ? st.last : null;
  return { last, lastPassHash: typeof st.lastPassHash === 'string' ? st.lastPassHash : null, sessions };
}
function saveState(root, st) { fs.mkdirSync(path.dirname(statePath(root)), { recursive: true }); fs.writeFileSync(statePath(root), JSON.stringify(st, null, 2) + '\n'); }
function pendingAddenda(ledger) {
  const pend = [];
  for (const r of ledger.rulings) {
    if (!r.addenda.length) continue;
    const resolved = ledger.rulings.some(o => o.line > r.line && o.edges.some(e => e.to === r.id));
    if (!resolved) for (const a of r.addenda) pend.push({ id: r.id, date: a.date, text: a.text });
  }
  return pend;
}
function status(argv) {
  const s = scope(argv), cwd = s.cwd, root = s.root, lp = s.ledger;
  if (!lp) {                                                          // no ledger governs the working directory
    const below = ledgersBelow(cwd, root);                            // a walk goes up: a ledger below is named, not found
    const groot = gitRoot(cwd);
    const ls = groot ? sh('git', ['ls-tree', '-r', '--name-only', 'HEAD'], groot) : null;
    const gone = ls && ls.status === 0 ? ls.stdout.split('\n').filter(p => /(^|\/)DECISIONS\.md$/.test(p) && !isFile(path.join(groot, p))) : [];
    if (gone.length) {                                                 // the committed ledger is gone: not an ungoverned project, an amended one
      if (argv.json) { out(JSON.stringify({ ledger: null, gone, below }, null, 2)); return 0; }
      out('Docket — the committed ledger ' + gone.join(', ') + ' is gone from the working tree; check 7 says so (D4)');
      return 0;
    }
    if (!below.length) return 0;                                      // ungoverned project: the docket is silent
    if (argv.json) { out(JSON.stringify({ ledger: null, below }, null, 2)); return 0; }
    out('Docket — no ledger governs ' + rel(root, cwd) + ' (under ' + root + '); below it: ' + below.join(', ') + ' — pass --ledger <path>, or run from inside');
    return 0;
  }
  const ledger = loadLedger(lp);
  const ctx = loadContext(root);
  const cited = new Set(codeCites(ctx, ledger).map(c => c.id));
  const uncited = ledger.rulings.filter(r => !cited.has(r.id)).map(r => r.id);
  const pend = pendingAddenda(ledger);
  const st = loadState(root);
  const surfaced = !!(st.last && st.sessions[st.last.session] && st.sessions[st.last.session].surfaced);   // D11: the surfaced state is the one the docket exists to show; a verdict naming a session the file never recorded is not surfaced
  const check_ = runCheck(root, { ctx });
  const spec_ = runSpecCheck(root, ctx, lp);
  const witness = { ok: check_.failures.length === 0 && spec_.failures.length === 0, ledgers: check_.ctx.ledgers.size, failures: check_.failures.concat(spec_.failures) };
  if (argv.json) {
    out(JSON.stringify({ ledger: rel(root, lp), rulings: ledger.rulings.length, prefixes: ledger.prefixes, last: ledger.rulings.slice(-3).map(r => ({ id: r.id, title: r.title })), uncited, pendingAddenda: pend, lastVerdict: st.last, surfaced, witness }, null, 2));
    return 0;
  }
  const L = [];
  L.push('Docket — ' + rel(root, lp) + ' (' + ledger.rulings.length + ' ruling' + (ledger.rulings.length === 1 ? '' : 's') + (ledger.prefixes.length ? '; prefix' + (ledger.prefixes.length === 1 ? ' ' : 'es ') + ledger.prefixes.join(', ') : '; no prefix') + ')');
  L.push('Last rulings:');
  for (const r of ledger.rulings.slice(-3).reverse()) L.push('  ' + r.id + '  ' + r.title + (r.issue !== null ? '  · issue #' + r.issue : ''));
  L.push('Cited nowhere: ' + (uncited.length ? uncited.join(', ') + ' (' + uncited.length + ' of ' + ledger.rulings.length + ')' : 'none'));
  L.push('Addenda pending: ' + (pend.length ? '' : 'none'));
  for (const a of pend) L.push('  ' + a.id + ' (' + a.date + '): ' + a.text);
  L.push('Last verdict: ' + (st.last ? st.last.verdict + ' at ' + st.last.at + ' (' + st.last.failures + ' located failure' + (st.last.failures === 1 ? '' : 's') + ')' + (surfaced ? '; session ' + st.last.session + ' is SURFACED — its residue waits for the human' : '') : 'none'));
  L.push('Witness: ' + (witness.ok ? 'ok (' + witness.ledgers + ' ledger' + (witness.ledgers === 1 ? '' : 's') + ')' : 'FAIL (' + witness.failures.length + ')'));
  for (const f of witness.failures.slice(0, 5)) L.push('  ' + f.file + ':' + f.line + '  ' + (typeof f.k === 'number' ? 'check ' : 'spec-check ') + f.k + ': ' + f.message);
  out(L.join('\n'));
  return 0;
}

// ─── 12. diff: what changed in the law ──────────────────────────────────────

// Two readings of one ledger, compared entry by entry with the seventh check's own comparison, so
// `diff` and `check` cannot disagree about what "changed" means. Loud first: an existing heading or
// body that differs, or an entry gone, is the thing the ledger exists to make impossible (D4), and is
// listed before anything added. Exit 1 when such a change is listed, as a failed check exits 1; exit 2
// when a revision or file cannot be read (FORMAT.md 13).
function ledgerAtRev(root, ledgerPath, rev) {
  const p = rel(root, ledgerPath);
  const r = sh('git', ['show', rev + ':' + p], root);
  if (r.status !== 0) die('diff: cannot read ' + p + ' at ' + rev + (r.stderr && r.stderr.trim() ? ' — ' + r.stderr.trim().split('\n')[0] : ''), 2);
  return parseLedger(r.stdout, ledgerPath);
}
function ledgerFromFile(given) {
  const full = path.resolve(process.cwd(), given);
  if (!isFile(full)) die('diff: cannot read ' + given, 2);
  return parseLedger(readText(full), full);
}
function diffLedgers(a, b) {
  const changed = [], added = [], edges = [], addenda = [];
  for (const o of a.rulings) {
    const cur = b.byId.get(o.id);
    if (!cur) { changed.push({ id: o.id, kind: 'removed', line: o.line }); continue; }
    if (cur.heading !== o.heading) changed.push({ id: o.id, kind: 'heading', from: o.heading, to: cur.heading, line: cur.line });
    if (!bodyOnlyAppended(o.bodyLines, cur.bodyLines)) changed.push({ id: o.id, kind: 'body', line: cur.line });
    const had = new Set(o.addenda.map(x => x.date + '|' + x.text));
    for (const x of cur.addenda) if (!had.has(x.date + '|' + x.text)) addenda.push({ id: o.id, date: x.date, text: x.text, line: x.line });
  }
  const oldEdges = new Set();
  for (const r of a.rulings) for (const e of r.edges) oldEdges.add(edgeKey(e));
  for (const r of b.rulings) {
    if (!a.byId.has(r.id)) { added.push(r); for (const x of r.addenda) addenda.push({ id: r.id, date: x.date, text: x.text, line: x.line }); }   // an added ruling's addenda are addenda added, as its edges are edges added: a range that appends a ruling and then its addendum hides neither
    for (const e of r.edges) if (!oldEdges.has(edgeKey(e))) edges.push(e);   // an added ruling's edges are edges added: what governs what has changed
  }
  return { changed, added, edges, addenda };
}
function diff(argv) {
  const a = argv._[1], b = argv._[2];
  if (!a || !b) die('diff: two revisions, or two files with --files\n\n  docket diff <revA> <revB>\n  docket diff --files <a> <b>', 2);
  let A, B, label;
  if (has(argv, '--files')) { A = ledgerFromFile(a); B = ledgerFromFile(b); label = a + ' → ' + b; }
  else {
    const s = scope(argv);
    if (!s.ledger) die(noLedgerMessage(s.cwd, s.root), 2);
    const root = gitRoot(path.dirname(s.ledger));                        // a revision is git's: the repository that holds the ledger
    if (!root) die('diff: ' + rel(s.root, s.ledger) + ' is not in a git repository; compare two files with --files', 2);
    A = ledgerAtRev(root, s.ledger, a); B = ledgerAtRev(root, s.ledger, b);
    label = rel(root, s.ledger) + '  ' + a + ' → ' + b;
  }
  const d = diffLedgers(A, B);
  if (argv.json) {
    out(JSON.stringify({ from: a, to: b, ok: d.changed.length === 0, changed: d.changed,
      added: d.added.map(r => ({ id: r.id, title: r.title, meta: r.meta, line: r.line })),
      edges: d.edges.map(e => ({ from: e.from, adverb: e.adverb, verb: e.verb, to: e.to, qualifier: e.qualifier })), addenda: d.addenda }, null, 2));
    return d.changed.length ? 1 : 0;
  }
  const L = [label];
  if (d.changed.length) {
    L.push('CHANGED — an existing entry differs, which the ledger forbids (append only):');
    for (const c of d.changed) {
      if (c.kind === 'removed') L.push('  ' + c.id + ' was removed');
      else if (c.kind === 'heading') L.push('  ' + c.id + ': heading changed: "' + c.from + '" → "' + c.to + '"');
      else L.push('  ' + c.id + ': body changed other than by appended addendum lines');
    }
  }
  L.push('Rulings added (' + d.added.length + '):');
  for (const r of d.added) L.push('  ' + r.id + '. ' + r.title + (r.meta ? ' (' + r.meta + ')' : ''));
  L.push('Edges added (' + d.edges.length + '):');
  for (const e of d.edges) L.push('  ' + renderEdge(e));
  L.push('Addenda added (' + d.addenda.length + '):');
  for (const x of d.addenda) L.push('  ' + x.id + '  ' + x.date + ': ' + x.text);
  if (!d.changed.length && !d.added.length && !d.edges.length && !d.addenda.length) L.push('nothing changed');
  out(L.join('\n'));
  return d.changed.length ? 1 : 0;
}

// ─── 13. vendor: the witness where the law lives (D9) ───────────────────────

// The core is one file with no dependencies, so the witness a repository runs in CI is this file,
// copied; the plugin need not be installed where the law is checked. The copy runs bare as the
// witness and answers every read subcommand; it does not carry templates/, so it cannot constitute.
const CI_STEP = [
  '      - uses: actions/checkout@v4',
  '        with:',
  '          fetch-depth: 0          # the seventh check compares with the committed ledger; a shallow clone has none to compare',
  '      - uses: actions/setup-node@v4',
  '        with:',
  '          node-version: 20',
  '      - name: The witness',
  '        run: node test/docket.js',
].join('\n');
function vendorInto(dir) {
  const dest = path.join(dir, 'test', 'docket.js');
  const replaced = isFile(dest);
  // What sits there is replaced only when it is a docket core of some version — it opens as this file opens and names
  // the docket in its head — so a project's own test file, or this repository's suite, is never written over.
  if (replaced) {
    const theirs = normEol(readText(dest)), mine = normEol(readText(__filename));
    const opens = t => t.split('\n', 3).join('\n');
    if (opens(theirs) !== opens(mine) || !/docket/.test(theirs.slice(0, 4000))) die('vendor: ' + rel(process.cwd(), dest) + ' exists and is not a copy of the docket\'s core — move it aside first; the witness goes to test/docket.js', 2);
  }
  if (exists(path.dirname(dest)) && !isDir(path.dirname(dest))) die('vendor: ' + rel(process.cwd(), path.dirname(dest)) + ' exists and is not a directory; the witness goes to test/docket.js', 2);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(__filename, dest);
  return { dest, replaced };
}
function vendor(argv) {
  const target = argv._[1];
  if (!target) die('vendor: a directory is required\n\n  docket vendor <dir>', 2);
  const dir = path.resolve(process.cwd(), target);
  if (!isDir(dir)) die('vendor: ' + target + ' is not a directory', 2);
  const v = vendorInto(dir);
  if (argv.json) { out(JSON.stringify({ written: rel(dir, v.dest), replaced: v.replaced, ciStep: CI_STEP }, null, 2)); return 0; }
  out((v.replaced ? 'replaced ' : 'wrote ') + rel(process.cwd(), v.dest) + ' — the witness: one file, no dependencies (D9). Run it bare: node test/docket.js\n\nThe CI step:\n' + CI_STEP);
  return 0;
}

// ─── 14. constitute: a spine before the first line (D9, D13) ────────────────

// The mechanical half of /constitute. The intake (intake/CONSTITUTE.md) refuses what only a reader can
// tell — a category, a feature; this refuses what a shape check can tell, each by the field's name,
// and then fills the templates, writes the first entry through append's own validation, vendors the
// witness, prints the CI step and the agent-instructions section, and runs check. Nothing here names a
// host: the section is "for the repository's agent-instructions file", and the host's skill says which.
const ABBREVIATIONS = ['dr', 'mr', 'mrs', 'ms', 'prof', 'st', 'e.g', 'i.e', 'etc', 'vs', 'cf', 'no', 'jr', 'sr'];   // a stop after one of these ends no sentence — a list, stated
function sentenceCount(s) {
  let t = s.trim();
  if (!t) return 0;
  for (const a of ABBREVIATIONS) t = t.replace(new RegExp('\\b' + a.replace('.', '\\.') + '\\.', 'gi'), a.replace('.', ''));
  let n = 0;
  const re = /[.!?]+(?=\s+[A-Z"'(À-Þ]|\s*$)/g;               // a stop that ends a sentence: followed by a capital, or last
  while (re.exec(t)) n++;
  if (!/[.!?]["')]*\s*$/.test(t)) n++;                                 // a text that ends without a stop: its last sentence is unfinished, and is one — "It does X. It does Y" reads as two
  return Math.max(1, n);
}
// A crowd is refused when the role IS one, article or not, or one followed by a relative clause ("everyone who
// cooks"). A role that merely opens with a crowd's word — "a people manager", "users researcher", "the public
// defender" — names a person and is not this shape check's to refuse; the semantic line is the intake's (D13).
function invalidRole(role) {
  const strip = t => t.replace(/^(a|an|the)\s+/, '');
  const raw = role.toLowerCase().replace(/[.]+$/, '').trim(), forms = [raw, strip(raw)];
  for (const bad of INVALID_ROLES) {
    for (const b of [bad, strip(bad)]) for (const f of forms) {
      if (f === b || f.startsWith(b + ',')) return bad;
      if (f.startsWith(b + ' ') && /^(who|that|which|whom|whose)\b/.test(f.slice(b.length + 1))) return bad;
    }
  }
  return null;
}
function readAnswers(argv) {
  const given = flag(argv, '--answers');
  if (!given) die('constitute: --answers <file> is required — the answers as JSON, in the shape intake/CONSTITUTE.md gives', 2);
  let o;
  try { o = JSON.parse(readText(path.resolve(process.cwd(), given))); } catch (e) { die('constitute: --answers ' + given + ' is not readable JSON — ' + e.message, 2); }
  if (!o || typeof o !== 'object' || Array.isArray(o)) die('constitute: --answers must hold a JSON object', 2);
  const bad = (field, why) => die('constitute: ' + field + ' ' + why, 2);
  const str = v => (typeof v === 'string' ? v.trim() : '');
  const oneLine = (field, v) => { if (/[\r\n]/.test(v)) bad(field, 'is one line'); if (/\*/.test(v)) bad(field, 'may not contain "*" — it is set in a bold phrase a ruling cites by name'); };
  const what = str(o.what);
  if (!what) bad('what', 'is required: one sentence naming the object and the verb');
  if (/[\r\n]/.test(what)) bad('what', 'is one sentence, on one line');
  if (sentenceCount(what) !== 1) bad('what', 'is one sentence; this reads as ' + sentenceCount(what));
  const who = o.who && typeof o.who === 'object' && !Array.isArray(o.who) ? o.who : null;
  if (!who) bad('who', 'is required: {"role": …, "knows": …, "doesntKnow": …}');
  const role = str(who.role), knows = str(who.knows), doesntKnow = str(who.doesntKnow);
  if (!role) bad('who.role', 'is required: the person this is for, as a role');
  const crowd = invalidRole(role);
  if (crowd) bad('who.role', '"' + role + '" is refused — a role names a person, not a crowd; "' + crowd + '" is one of: ' + INVALID_ROLES.join(', '));
  if (!knows) bad('who.knows', 'is required: one thing that person knows');
  if (!doesntKnow) bad('who.doesntKnow', 'is required: one thing that person does not know');
  const feeling = str(o.feeling);
  if (!feeling) bad('feeling', 'is required: one phrase, the feeling every iteration keeps — no default is offered');
  oneLine('feeling', feeling);
  if (/[.!?]$/.test(feeling) || sentenceCount(feeling) > 1) bad('feeling', 'is a phrase, not a sentence');
  if (!Array.isArray(o.refuses)) bad('refuses', 'is required: at least ' + REFUSALS_MIN + ' verb phrases, as a JSON array');
  const refuses = o.refuses.map(str);
  refuses.forEach((r, i) => { if (!r) bad('refuses[' + i + ']', 'is empty'); oneLine('refuses[' + i + ']', r); });
  if (refuses.length < REFUSALS_MIN) bad('refuses', 'needs at least ' + REFUSALS_MIN + '; this has ' + refuses.length);
  const lower = refuses.map(r => r.toLowerCase().replace(/\.$/, ''));
  const dup = lower.find((r, i) => lower.indexOf(r) !== i);
  if (dup) bad('refuses', 'repeats "' + dup + '"');
  const prefix = o.prefix === undefined ? 'R' : str(o.prefix);
  if (!/^[A-Za-z]+$/.test(prefix)) bad('prefix', 'must be letters (FORMAT.md 12)');
  const name = o.name === undefined ? null : str(o.name);
  if (name !== null) { if (!name) bad('name', 'is one line, or omitted to name the project after its directory'); oneLine('name', name); }
  return { what, role, knows, doesntKnow, feeling, refuses, prefix, name };
}
function fillTemplate(file, vars) {
  const p = path.join(__dirname, '..', 'templates', file);
  if (!isFile(p)) die('constitute: templates/' + file + ' is not beside this file\'s bin/ — constitute runs from the plugin; the vendored witness at test/docket.js is the witness and carries no templates', 2);
  return readText(p).replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (!Object.prototype.hasOwnProperty.call(vars, k)) die('constitute: templates/' + file + ' names {{' + k + '}}, which constitute does not fill', 2);
    return vars[k];
  });
}
function constitute(argv) {
  const a = readAnswers(argv);
  const target = flag(argv, '--target');
  const dir = path.resolve(process.cwd(), target || '.');
  if (!isDir(dir)) die('constitute: --target ' + target + ' is not a directory', 2);
  const docs = path.join(dir, 'docs');
  if (exists(docs) && !isDir(docs)) die('constitute: docs exists and is not a directory; the three documents go under docs/', 2);
  if (exists(path.join(dir, 'test')) && !isDir(path.join(dir, 'test'))) die('constitute: test exists and is not a directory; the witness goes to test/docket.js', 2);
  for (const f of ['DECISIONS.md', 'PRD.md', 'UIUX.md']) {
    if (isFile(path.join(docs, f))) die('constitute: docs/' + f + ' already exists — a constitution is written once; the ledger is append only (D4), so what comes after is docket append, not a second constitution', 2);
  }
  const name = a.name || path.basename(dir);
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  const principles = ['- **' + cap(a.feeling) + '.** The feeling every iteration must keep; a change that loses it fails whatever else it does.']
    .concat(a.refuses.map(r => '- **Will not ' + r.replace(/\.$/, '') + '.** Refused at constitution; a ruling that needs otherwise supersedes this one by name.'))
    .join('\n');
  const reader = cap(a.role) + ': knows ' + a.knows.replace(/\.$/, '') + ', and does not know ' + a.doesntKnow.replace(/\.$/, '') + '.';
  const date = today();
  const vars = { name, what: a.what, principles, reader, date, prefix: a.prefix };
  const filled = { 'PRD.md': fillTemplate('PRD.md', vars), 'UIUX.md': fillTemplate('UIUX.md', vars), 'DECISIONS.md': fillTemplate('DECISIONS.md', vars) };
  // Written whole or not at all: a refusal after this point (a cite in the answers naming a ruling that
  // does not exist, say) removes what was written, so a half-constitution never stands.
  const written = [];
  let complete = false;
  process.on('exit', () => {
    if (complete) return;
    for (const f of written) { try { fs.unlinkSync(f); } catch (e) { /* already gone */ } }
    // The append lock is ours while the refusal fires — it names this pid — and a foreign one is never touched.
    const lock = path.join(docs, 'DECISIONS.md.lock');
    try { if (readText(lock).trim() === 'docket ' + process.pid) fs.unlinkSync(lock); } catch (e) { /* no lock, or not ours */ }
    for (const d of [docs, path.join(dir, 'test')]) { try { fs.rmdirSync(d); } catch (e) { /* held something else, or absent */ } }
  });
  fs.mkdirSync(docs, { recursive: true });
  for (const [f, text] of Object.entries(filled)) { const p = path.join(docs, f); fs.writeFileSync(p, text); written.push(p); }
  const ledgerPath = path.join(docs, 'DECISIONS.md');
  const body = [
    'What: ' + a.what,
    'For: ' + a.role + ' — knows ' + a.knows.replace(/\.$/, '') + '; does not know ' + a.doesntKnow.replace(/\.$/, '') + '.',
    'Must keep: ' + a.feeling + '.',
    'Will not: ' + a.refuses.map(r => r.replace(/\.$/, '')).join('; ') + '.',
    'Reason: every later ruling resolves against these answers by name — a ruling that serves none of them is a preference, and a change that loses the feeling fails whatever else it does.',
  ].join('\n');
  const entryArgv = { raw: ['--ledger', ledgerPath, '--title', 'The constitution', '--issue', 'constituted ' + date, '--principle', a.feeling, '--body', body, '--prefix', a.prefix], _: ['append'], json: false };
  const { root, ledger, release } = lockedLedger(entryArgv);
  const entry = buildEntry(entryArgv, root, ledger);
  writeLedger(ledger, ensureNl(ledger.text) + '\n' + entry);
  release();
  const v = vendorInto(dir);
  written.push(v.dest);
  // What was just written is not yet tracked, and the context reads tracked files where there is a repository; the
  // check here includes untracked files so that it reads the constitution it is meant to check, and says how many
  // ledgers it read, so a check over nothing is never mistaken for a check.
  const croot = enumerationRoot(dir);
  const res = runCheck(croot, { ctx: loadContext(croot, { includeUntracked: true }) });
  complete = true;
  const section = [
    '## The docket',
    'This repository is governed by docs/DECISIONS.md: a ledger of rulings, appended and never edited.',
    'Before changing behaviour, read what governs it — `node test/docket.js query <term>`, then',
    '`node test/docket.js governs <id>` for each ruling that comes back. A decision is recorded as a new',
    'entry, never as an edit to an old one. Run `node test/docket.js` before you stop: it is the witness,',
    'and CI runs the same command. The witness reads tracked files: add and commit docs/ and test/ first, or it',
    'reads nothing and says so.',
  ].join('\n');
  if (argv.json) {
    out(JSON.stringify({ name, dir: rel(process.cwd(), dir) || '.', prefix: a.prefix, written: written.map(f => rel(dir, f)), entry: entry.trimEnd(), ciStep: CI_STEP, agentSection: section, ok: res.failures.length === 0, failures: res.failures, info: res.info }, null, 2));
    return res.failures.length ? 1 : 0;
  }
  const L = ['constituted ' + name + ' in ' + (rel(process.cwd(), dir) || '.') + ' (prefix ' + a.prefix + ')',
    '  docs/PRD.md        the principles (' + (1 + a.refuses.length) + ') and the reader',
    '  docs/UIUX.md       the token tables, empty until a value is stated, and the minimum',
    '  docs/DECISIONS.md  ' + entry.split('\n')[0].replace(/^### /, ''),
    '  test/docket.js     the witness (D9) — run it bare: node test/docket.js',
    '', 'The CI step:', CI_STEP,
    '', 'For the repository\'s agent-instructions file — the host names it; add this yourself:', section, ''];
  for (const f of res.failures) L.push(f.file + ':' + f.line + '  check ' + f.k + ': ' + f.message);
  for (const i of res.info) L.push('info  ' + i);
  const nl = res.ctx.ledgers.size, nf = res.ctx.files.length;
  L.push(res.failures.length ? 'check: ' + res.failures.length + ' failure(s) — the constitution is written; fix before you build on it' : 'check: ok (' + nl + ' ledger' + (nl === 1 ? '' : 's') + ', ' + nf + ' governed-tree file' + (nf === 1 ? '' : 's') + ')');
  out(L.join('\n'));
  return res.failures.length ? 1 : 0;
}

// ─── 15. intake: an intake file, printed ─────────────────────────────────────

// A skill splices its intake at load through this command rather than through `cat`: the host runs a splice under the
// skill's own allow-list, which names `node … docket.js …` and nothing else, and refuses to read a file outside the
// project by any other means. The intake text stays in intake/*.md (D13); this only prints it. The vendored witness
// carries no intake/ and says so.
function intake(argv) {
  const which = argv._[1];
  if (!which || !/^(rule|constitute)$/.test(which)) die('intake: which one — docket intake rule | docket intake constitute', 2);
  const p = path.join(__dirname, '..', 'intake', which.toUpperCase() + '.md');
  if (!isFile(p)) die('intake: intake/' + which.toUpperCase() + '.md is not beside this file\'s bin/ — the intakes live in the plugin; the vendored witness at test/docket.js carries none', 2);
  out(readText(p));
  return 0;
}

// ─── 11. cli ────────────────────────────────────────────────────────────────

const USAGE = [
  'docket — the ledger of rulings that governs a codebase',
  '',
  '  docket                              the witness: check, and spec-check when a UIUX.md sits beside a ledger',
  '  docket near                         stdin: an edit; stdout: what governs the region (silent when nothing does)',
  '  docket status                       the docket: last rulings, uncited rulings, pending addenda, last verdict, witness',
  '  docket check                        the seven checks (exit 1 on a failure)',
  '  docket spec-check [--all]           token rows and contrast rows of UIUX.md against the CSS (the nearest ledger; --all for every ledger)',
  '  docket index                        the whole parse as JSON',
  '  docket query <term>                 rulings whose heading or body match, with edges and addenda',
  '  docket governs <id>                 edges in and out with their clauses, addenda, code cites',
  '  docket principles                   the principle list',
  '  docket append --title --issue --principle [--edge "<verb> <id>"]... --body   a new entry, checked',
  '  docket append --addendum <id> --text "..."   a dated addendum under an entry',
  '  docket append --baseline            rewrite the bare-cite baseline',
  '  docket diff <revA> <revB>           what changed in the law: rulings, edges and addenda added; any existing entry changed, listed first (exit 1)',
  '  docket diff --files <a> <b>         the same, between two ledger files',
  '  docket vendor <dir>                 copy the witness to <dir>/test/docket.js and print the CI step',
  '  docket constitute --answers <json>  a new project\'s PRD, UIUX and DECISIONS from the four answers, the witness vendored, check run (--target <dir>)',
  '  docket intake rule|constitute       print an intake file, for a skill to splice at load',
  '',
  'Options: --json on every subcommand; --ledger <path> where a ledger is read.',
  'Exit codes: 0 success · 1 a failed check · 2 usage error.',
].join('\n');
const TAKES_VALUE = new Set(['--ledger', '--session', '--hash', '--failures', '--title', '--issue', '--principle', '--edge', '--body', '--prefix', '--addendum', '--text', '--answers', '--target']);
const BARE_FLAGS = new Set(['--json', '--baseline', '--files', '--text-only', '--all', '--help']);
// The options each subcommand reads. One it does not read is a usage error, not a silence: an option accepted and
// ignored would let a reader believe it had an effect.
const OPTIONS = {
  near: ['--json'], index: ['--json', '--ledger'], check: ['--json'], 'spec-check': ['--json', '--all', '--ledger'],
  append: ['--json', '--ledger', '--title', '--issue', '--principle', '--edge', '--body', '--prefix', '--addendum', '--text', '--baseline'],
  query: ['--json', '--ledger'], governs: ['--json', '--ledger'], principles: ['--json', '--ledger'], status: ['--json', '--ledger'],
  diff: ['--json', '--ledger', '--files'], vendor: ['--json'], constitute: ['--json', '--answers', '--target'], intake: [],
};
function parseArgv(args) {
  const raw = args.slice();
  const _ = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (BARE_FLAGS.has(a)) continue;
    if (TAKES_VALUE.has(a)) {
      // Given twice, one value is the one meant and the other is not, and the tool cannot know which.
      // flag() reads the first; a ruling written from the wrong one could never be unwritten (D4), so
      // the ambiguity is refused before the write rather than resolved by position. --edge repeats by
      // design (FORMAT.md 4: the same edge twice is one edge) and is the one exception.
      if (a !== '--edge' && raw.indexOf(a) !== i) die('docket: ' + a + ' is given more than once, with different values — name it once', 2);
      // A value is missing, or is the next flag's own name — the shell dropped an empty variable.
      // Writing "--issue" into a ruling's title would be permanent, so this is a usage error, not a value.
      if (i + 1 >= raw.length) die('docket: ' + a + ' needs a value', 2);
      const v = raw[i + 1];
      if (TAKES_VALUE.has(v) || BARE_FLAGS.has(v)) die('docket: ' + a + ' needs a value, and "' + v + '" is the name of another option — an empty shell variable drops the value and leaves the next option in its place', 2);
      i++;
      continue;
    }
    if (a.startsWith('--')) die('docket: unknown option "' + a + '"\n\n' + USAGE, 2);
    _.push(a);
  }
  return { raw, _, json: raw.includes('--json') };
}
// D6: the repository's own CI runs this over its own tree; the law binds its author.
function witness(argv) {
  if (has(argv, '--ledger')) die('docket: the witness takes no --ledger — it covers every ledger under the root (index, query, governs, principles, status, spec-check and append take --ledger)', 2);
  const root = enumerationRoot(process.cwd());
  const c = runCheck(root);
  const s = runSpecCheck(root, c.ctx, findLedger(path.join(process.cwd(), 'x'), root));
  const n = c.failures.length + s.failures.length;
  if (argv.json) {                                                    // --json on every subcommand, the witness included
    out(JSON.stringify({ ok: n === 0, ledgers: c.ctx.ledgers.size, specRows: s.rows, info: c.info,
      failures: c.failures.map(f => Object.assign({ check: 'check' }, f)).concat(s.failures.map(f => Object.assign({ check: 'spec-check' }, f))) }, null, 2));
    return n ? 1 : 0;
  }
  for (const f of c.failures) out(f.file + ':' + f.line + '  check ' + f.k + ': ' + f.message);
  for (const f of s.failures) out(f.file + ':' + f.line + '  spec-check ' + f.k + ': ' + f.message);
  for (const i of c.info) out('info  ' + i);
  for (const i of s.info || []) out('info  ' + i);
  out(n ? 'witness: ' + n + ' failure' + (n === 1 ? '' : 's') : 'witness: ok (' + c.ctx.ledgers.size + ' ledger' + (c.ctx.ledgers.size === 1 ? '' : 's') + ', ' + s.rows + ' spec rows)');
  return n ? 1 : 0;
}
function main() {
  const argv = parseArgv(process.argv.slice(2));
  if (argv.raw.includes('--help')) { out(USAGE); return 0; }
  const sub = argv._[0];
  const table = { near, index: indexOf_, check, 'spec-check': specCheck, append, query, governs, principles, status, diff, vendor, constitute, intake };
  if (!sub) return witness(argv);
  if (sub === 'help' || sub === '-h') { out(USAGE); return 0; }
  if (!table[sub]) die('docket: unknown subcommand "' + sub + '"\n\n' + USAGE, 2);
  const allowed = OPTIONS[sub] || [];
  for (let i = 0; i < argv.raw.length; i++) {
    const a = argv.raw[i];
    if (sub === 'check' && a === '--ledger') { i++; continue; }          // check refuses --ledger itself, naming the subcommands that take it
    if (a.startsWith('--') && a !== '--help' && !allowed.includes(a)) die(sub + ': ' + a + ' is not an option of ' + sub + '; its options are ' + (allowed.join(', ') || 'none'), 2);
    if (TAKES_VALUE.has(a)) i++;                                        // the value after a flag is a value, whatever it looks like
  }
  return table[sub](argv);
}
if (require.main === module) process.exitCode = main();   // exitCode, not exit(): a piped stdout must flush first
module.exports = { parseLedger, titleOf, findLedger, projectRoot, contrast, luminance, VERBS, ADVERBS };
