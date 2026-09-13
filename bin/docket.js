#!/usr/bin/env node
'use strict';
// docket.js — the core of The Docket. One dependency-free file (D13): it speaks
// stdin JSON, stdout text, exit codes and markdown, and names no host, model or
// vendor. Vendored as test/docket.js it is the witness (D9): run with no
// subcommand it checks the ledger and the spec and exits non-zero on a failure.
//
// Sections
//   0  utilities            shell, files, git
//   1  discovery            the nearest ledger, the spec documents (D5)
//   2  parse                entries, titles, meta, edges, addenda, sections, spec headings
//   3  cites                ruling cites, spec cites, bare cites
//   4  context              every tracked text file resolved to its own ledger
//   5  near                 the pre-edit window (D1, D2, D7)
//   6  index/query/governs/principles
//   7  check                the seven checks
//   8  spec-check           token rows and contrast rows
//   9  append               entry, addendum, baseline (D4, D8)
//  10  diff                 two versions of a ledger
//  11  status               the docket
//  12  gate/verdict         the judge's two commands (D10, D11)
//  13  cli
//
// Exit codes: 0 success · 1 a failed check · 2 usage error.

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

// ─── 0. utilities ───────────────────────────────────────────────────────────

// D14: each number below preserves a stated property; a change to one is a new ruling, never an edit here.
const WINDOW = 20;        // D2: ±20 lines
const CAP = 8;            // D2: at most eight rulings listed
const TITLE_MAX = 72;     // D7: the title rule's cut
const BLOCK_CAP = 5;      // D11: five blocks per session since the last PASS
const THIRD_CYCLE = 3;    // D11: after the third block, failures must decrease

const VERBS = ['supersedes', 'overrides', 'retires', 'reverses', 'waives', 'extends',
  'keeps', 're-tunes', 'refines', 'replaces', 'corrects', 'revises'];
const ADVERBS = ['partially', 'partly', 'in part'];
const INVALID_ROLES = ['general audience', 'everyone', 'anyone', 'non-technical', 'users', 'people', 'the public', 'all users', 'someone curious'];

function out(s) { process.stdout.write(s.endsWith('\n') ? s : s + '\n'); }
function die(msg, code) { process.stderr.write(msg + '\n'); process.exit(code === undefined ? 2 : code); }
function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch (e) { return ''; } }
function readText(p) { return fs.readFileSync(p, 'utf8'); }
function exists(p) { try { fs.accessSync(p); return true; } catch (e) { return false; } }
function isFile(p) { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }
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
function splitLines(text) { return text.split(/\r?\n/); }
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function uniq(arr) { return Array.from(new Set(arr)); }
function stripMarks(s) { return s.replace(/`/g, '').replace(/\*\*/g, ''); }

// ─── 1. discovery (D5) ──────────────────────────────────────────────────────

// The project root: CLAUDE_PROJECT_DIR when set, else the git root of `dir`, else null.
// Zero config: nothing else is consulted. Discovery walks up to it, or to the filesystem
// root when there is none; file enumeration never does — see enumerationRoot.
function projectRoot(dir) {
  const v = process.env.CLAUDE_PROJECT_DIR;                            // the host's project directory, when it names one
  if (v && exists(v)) return path.resolve(v);
  return gitRoot(dir);
}
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

const HEADING_RE = /^### ([A-Za-z]+)([1-9]\d*)\.\s+(.*?)\s*$/;   // ASCII prefix, no leading zero (FORMAT.md 2)
const SECTION_RE = /^## ([A-Za-z]+)\.\s+(.*?)\s*$/;
const ADDENDUM_RE = /^> Addendum (\d{4}-\d{2}-\d{2}): (.*?)\s*$/;
const SPEC_HEADING_RE = /^#{1,6}\s+§(\d+(?:\.\d+)*)\s+(.*?)\s*$/;
// One verb may name several targets joined by "/" ("keeps R1/R2"): one edge per target, the same clause.
const EDGE_RE = new RegExp('(?:\\b(' + ADVERBS.join('|') + ')\\s+)?\\b(' + VERBS.join('|') + ')\\s+([A-Za-z]+)(\\d+)((?:/[A-Za-z]+\\d+)*)\\b(?:\\s*\\(([^()]*)\\))?', 'g');

// The first " (" that lies outside a backtick span (FORMAT.md 3, 4): a parenthesis inside inline code is
// code, not the meta. A heading with an unpaired backtick has no code span.
function metaStart(s) {
  if (((s.match(/`/g) || []).length % 2) === 1) return s.indexOf(' (');
  let inCode = false;
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i] === '`') { inCode = !inCode; continue; }
    if (!inCode && s[i] === ' ' && s[i + 1] === '(') return i;
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
  for (let j = i + 1; j < heading.length; j++) {
    if (heading[j] === '(') depth++;
    else if (heading[j] === ')') { depth--; if (depth === 0) return { meta: heading.slice(i + 2, j), start: i, end: j }; }
  }
  return { meta: heading.slice(i + 2), start: i, end: heading.length };
}

function clausesOf(meta) { return meta.split(';').map(s => s.trim()).filter(Boolean); }

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
        found.push({ from: sourceId, adverb: m[1] || '', verb: m[2], to: t, toPrefix: tm[1], toN: Number(tm[2]), qualifier: m[6] || '', clause: unit, line });
      }
    }
  }
  return found;
}
function isEdgeClause(clause) {
  const re = new RegExp('^(?:(?:' + ADVERBS.join('|') + ')\\s+)?(?:' + VERBS.join('|') + ')\\s+[A-Za-z]+\\d+(?:/[A-Za-z]+\\d+)*(?:\\s*\\([^()]*\\))?$');
  return re.test(clause.trim());
}
function renderEdge(e) { return e.from + ' ' + (e.adverb ? e.adverb + ' ' : '') + e.verb + ' ' + e.to + (e.qualifier ? ' (' + e.qualifier + ')' : ''); }
function edgeKey(e) { return e.from + '|' + e.adverb + '|' + e.verb + '|' + e.to + '|' + e.qualifier; }

// The principles list: the bulleted list under the first section of PRD.md when it exists, else the
// preamble's list after a line containing "Principles". Items begin with a bold phrase.
function principlesFromList(lines, startIdx) {
  const names = [];
  let started = false;
  for (let i = startIdx; i < lines.length; i++) {
    const m = /^\s*[-*]\s+\*\*([^*]+?)\*\*/.exec(lines[i]);
    if (m) { names.push({ name: m[1].trim().replace(/\.$/, ''), text: lines[i].trim(), line: i + 1 }); started = true; }
    else if (started && lines[i].trim() === '') break;
    else if (started && !/^\s*[-*]\s/.test(lines[i])) break;
  }
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
        if (list.length) return { source: docs.prd, list };
      }
    }
  }
  const lines = ledger.preambleLines;
  for (let i = 0; i < lines.length; i++) {
    if (/Principles/.test(lines[i])) {
      const list = principlesFromList(lines, i + 1);
      if (list.length) return { source: ledger.path, list };
    }
  }
  return { source: null, list: [] };
}
function principleNamed(list, name) {
  const norm = s => s.trim().replace(/\.$/, '').toLowerCase();
  return list.find(p => norm(p.name) === norm(name)) || null;
}

// A line that ends an entry: the next entry heading, or any `## ` line. A `### ` line that is not an entry
// heading ends nothing and is read as body text (FORMAT.md 2).
function isBoundary(line) { return HEADING_RE.test(line) || /^## /.test(line); }
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
  for (const l of preambleLines) {
    let m = /<!--\s*docket:\s*contract from ([A-Za-z]+)(\d+)\s*-->/.exec(l);
    if (m) contractFrom[m[1]] = Number(m[2]);
    m = /<!--\s*docket:\s*bare-cites([^>]*)-->/.exec(l);
    if (m) {
      hasBaseline = true;
      for (const kv of m[1].trim().split(/\s+/).filter(Boolean)) {
        const eq = kv.lastIndexOf('=');
        if (eq > 0) baseline[kv.slice(0, eq)] = Number(kv.slice(eq + 1));
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
      const pm = bodyLines.map(l => /^Principle:\s*(.+?)\s*$/.exec(l)).find(Boolean);
      rulings.push({
        id, prefix: hm[1], n: Number(hm[2]), line: start + 1, heading, title: titleOf(heading), meta, grounding,
        issue: issueM ? Number(issueM[1]) : null, edges, addenda, body: bodyLines.join('\n'), bodyLines,
        principle: pm ? pm[1].replace(/\.$/, '') : null, endLine: j,
      });
      i = j; continue;
    }
    i++;
  }
  const prefixes = uniq(rulings.map(r => r.prefix));
  const byId = new Map(rulings.map(r => [r.id, r]));
  return { path: ledgerPath, dir: path.dirname(ledgerPath), home: ledgerHome(ledgerPath), text, lines, preambleLines, prefixes, rulings, sections, byId, contractFrom, baseline, hasBaseline };
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
  const re = new RegExp('\\b(' + ledger.prefixes.map(escapeRe).join('|') + ')([1-9]\\d*)\\b', 'g');   // FORMAT.md 2, 8: no leading zero
  const found = [];
  let m;
  const scan = maskCode(line);                                        // FORMAT.md 8: an id in a code span is quoted, not cited
  while ((m = re.exec(scan)) !== null) found.push({ id: m[1] + m[2], prefix: m[1], n: Number(m[2]), col: m.index + 1, exists: ledger.byId.has(m[1] + m[2]) });
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
const SPEC_CITE_RE = /\b(UIUX|PRD) §(\d+(?:\.\d+)*)/g;
function specCitesIn(text) {
  const all = [], lines = splitLines(text), fenced = fencedLines(lines);
  lines.forEach((l, i) => { if (fenced[i]) return; SPEC_CITE_RE.lastIndex = 0; let m; while ((m = SPEC_CITE_RE.exec(maskCode(l))) !== null) all.push({ doc: m[1], num: m[2], line: i + 1 }); });
  return all;
}
const BARE_CITE_RE = /(?<!\b(?:UIUX|PRD) )§\d/g;
function bareCitesIn(text) {
  const lines = splitLines(text), fenced = fencedLines(lines); let n = 0;
  lines.forEach((l, i) => { if (fenced[i]) return; const m = maskCode(l).match(BARE_CITE_RE); if (m) n += m.length; });
  return n;
}

// ─── 4. context: every tracked text file resolved to its own ledger ─────────

function walkFiles(dir, acc) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return acc; }
  for (const ent of ents) {
    if (ent.name === '.git' || ent.name === 'node_modules' || ent.name === '.docket' || ent.isSymbolicLink()) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(p, acc); else if (ent.isFile()) acc.push(p);
  }
  return acc;
}
function loadContext(root, opts) {
  opts = opts || {};
  let files = trackedFiles(root);
  if (files === null) files = walkFiles(root, []);
  if (opts.includeUntracked) files = files.concat(untrackedFiles(root));
  const ledgers = new Map();
  const entries = [];
  for (const f of uniq(files)) {
    if (!isFile(f) || !isTextFile(f)) continue;
    const lp = findLedger(f, root);
    if (!lp) continue;
    if (!ledgers.has(lp)) ledgers.set(lp, loadLedger(lp));
    entries.push({ path: f, ledger: lp, rel: rel(root, f) });
  }
  return { root, ledgers, files: entries };
}
function fileText(entry) { if (entry.text === undefined) entry.text = readText(entry.path); return entry.text; }
function isSpecDoc(entry, ledger) { return entry.path === path.join(ledger.dir, 'UIUX.md') || entry.path === path.join(ledger.dir, 'PRD.md'); }
// A ledger document — any DECISIONS*.md — is checked for its cites but is never governed code:
// its cites are references between rulings, not implementation.
function isLedgerDoc(p) { return /^DECISIONS.*\.md$/i.test(path.basename(p)); }
// Code cites: resolving cites in every governed file of a ledger except the ledger itself.
function codeCites(ctx, ledger) {
  const cites = [];
  for (const e of ctx.files) {
    if (e.ledger !== ledger.path || isLedgerDoc(e.path)) continue;
    for (const c of citesIn(fileText(e), ledger)) if (c.exists) cites.push(Object.assign({ file: e.path, rel: e.rel }, c));
  }
  return cites;
}
function governedFiles(ctx, ledger) {
  const set = new Set();
  for (const c of codeCites(ctx, ledger)) set.add(c.file);
  return Array.from(set);
}
function ledgerFromCwd(argv) {
  const cwd = process.cwd();
  const root = enumerationRoot(cwd);
  const given = flag(argv, '--ledger');
  const lp = given ? path.resolve(cwd, given) : findLedger(path.join(cwd, 'x'), root);
  if (!lp || !isFile(lp)) die('no ledger: no DECISIONS.md or docs/DECISIONS.md between ' + cwd + ' and ' + root, 2);
  return { root, ledger: loadLedger(lp) };
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
  const root = pr || ledgerHome(lp);
  if (!isFile(file)) return 0;                                         // D7: a Write of a new file is silent
  const ledger = loadLedger(lp);
  const text = readText(file), lines = splitLines(text), N = lines.length, fenced = fencedLines(lines);
  const fileRel = rel(ledger.home, file), ledgerRel = rel(root, lp);
  let windows, anchors, mode;
  if (tool === 'Write') { windows = [[1, N]]; anchors = []; mode = 'whole'; }
  else if (tool === 'Edit') {
    const needle = ti.old_string;
    if (typeof needle !== 'string' || needle === '') return 0;          // zero matches: silent
    anchors = findAll(text, needle);
    if (anchors.length === 0) return 0;                                 // zero: silent
    if (anchors.length > 1 && ti.replace_all !== true) return 0;        // D7 (1): the tool will reject; silent
    windows = anchors.map(l => [Math.max(1, l - WINDOW), Math.min(N, l + WINDOW)]);
    mode = anchors.length === 1 ? 'one' : 'many';
  } else return 0;
  // collect
  const byId = new Map();
  const specs = [];
  windows.forEach((w, wi) => {
    const anchor = anchors[wi];
    for (let ln = w[0]; ln <= w[1]; ln++) {
      if (fenced[ln - 1]) continue;                                    // FORMAT.md 8: a fenced block is quoted
      const l = lines[ln - 1];
      for (const c of citesInLine(l, ledger)) {
        if (!c.exists) continue;
        const d = anchor === undefined ? ln : Math.abs(ln - anchor);
        const d0 = anchors.length ? Math.abs(ln - anchors[0]) : ln;
        const cur = byId.get(c.id);
        if (!cur) byId.set(c.id, { id: c.id, count: 1, dist: d, dist0: d0, first: ln });
        else { cur.count++; cur.dist = Math.min(cur.dist, d); cur.dist0 = Math.min(cur.dist0, d0); cur.first = Math.min(cur.first, ln); }
      }
      SPEC_CITE_RE.lastIndex = 0; let m;
      while ((m = SPEC_CITE_RE.exec(maskCode(l))) !== null) specs.push({ doc: m[1], num: m[2], line: ln });
    }
  });
  const where = mode === 'whole' ? 'whole file ' + fileRel
    : '±' + WINDOW + ' lines of ' + fileRel + ':' + (anchors.length <= CAP ? anchors.join(', ') : anchors.slice(0, CAP).join(', ') + ' +' + (anchors.length - CAP) + ' more');
  const outLines = [];
  if (byId.size === 0) {
    const governed = citesIn(text, ledger).some(c => c.exists);
    if (!governed) return 0;                                            // not governed: silent
    outLines.push('Governed here (' + ledgerRel + ', ' + where + '):');
    outLines.push('  no ruling is cited in this window; run docket governs <id> for the one you rely on.');
    return emitNear(input, outLines.join('\n'));
  }
  let list = Array.from(byId.values());
  if (mode === 'one') list.sort((a, b) => a.dist - b.dist || a.first - b.first);             // D2: nearest first
  else if (mode === 'many') list.sort((a, b) => b.count - a.count || a.dist0 - b.dist0 || a.first - b.first); // D7: by count, then nearest to the first
  else list.sort((a, b) => b.count - a.count || a.first - b.first);                           // whole file: by count
  const total = list.length;
  list = list.slice(0, CAP);
  const listed = new Set(list.map(x => x.id));
  outLines.push('Governed here (' + ledgerRel + ', ' + where + '):');
  for (const x of list) {
    const r = ledger.byId.get(x.id);
    outLines.push('  ' + r.id + '  ' + r.title + (r.issue !== null ? '  · issue #' + r.issue : ''));
  }
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
  const add = list.map(x => ledger.byId.get(x.id)).filter(r => r.addenda.length).map(r => r.id + ' (' + r.addenda.map(a => a.date).join(', ') + ')');
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
    }
    outLines.push('Also cited: ' + items.join('; ') + '.');
  }
  outLines.push('Name the ruling you rely on before you edit.');
  void listed;
  return emitNear(input, outLines.join('\n'));
}
// When the input carries a hook event name, answer in the same dialect; otherwise plain text.
function emitNear(input, text) {
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
function governs(argv) {
  const id = argv._[1];
  if (!id) die('usage: docket governs <id>', 2);
  const { root, ledger } = ledgerFromCwd(argv);
  const r = ledger.byId.get(id);
  if (!r) die('no ruling ' + id + ' in ' + rel(root, ledger.path), 2);
  const ctx = loadContext(root);
  const cites = codeCites(ctx, ledger).filter(c => c.id === id);
  const ins = inEdges(ledger, id);
  if (argv.json) {
    out(JSON.stringify({ ruling: rulingJson(r), outEdges: r.edges, inEdges: ins, addenda: r.addenda, cites: cites.map(c => ({ file: c.rel, line: c.line, text: c.text.trim() })) }, null, 2));
    return 0;
  }
  const lines = [];
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
  const { ledger } = ledgerFromCwd(argv);
  const p = principlesOf(ledger);
  if (argv.json) { out(JSON.stringify(p, null, 2)); return 0; }
  if (!p.list.length) { out('no principles list found (the first section of PRD.md, or the ledger preamble)'); return 1; }
  out(p.list.map(x => x.text).join('\n'));
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
  for (const [lp, ledger] of ctx.ledgers) {
    const files = ctx.files.filter(e => e.ledger === lp);
    const sp = ledgerSpecs(ledger);
    // 1. every cite names a ruling that exists
    for (const e of files) {
      for (const c of citesIn(fileText(e), ledger)) if (!c.exists) fail(e.path, c.line, 1, 'cite ' + c.id + ' names no ruling in ' + rel(root, lp));
    }
    // 2. numbering contiguous per prefix, in order of appearance
    const seenN = {};
    for (const r of ledger.rulings) {
      const expect = (seenN[r.prefix] || 0) + 1;
      if (r.n !== expect) fail(lp, r.line, 2, 'numbering: ' + r.id + ' follows ' + r.prefix + (expect - 1) + '; expected ' + r.prefix + expect);
      seenN[r.prefix] = r.n;
    }
    // 3. every UIUX §x / PRD §x cite resolves
    for (const e of files) {
      for (const c of specCitesIn(fileText(e))) {
        const doc = sp[c.doc];
        if (!doc) fail(e.path, c.line, 3, c.doc + ' §' + c.num + ' cited but no ' + c.doc + '.md sits beside ' + rel(root, lp));
        else if (!doc.heads.some(h => h.num === c.num)) fail(e.path, c.line, 3, c.doc + ' §' + c.num + ' names no heading in ' + rel(root, doc.path));
      }
    }
    // 4. bare-§ ratchet
    for (const e of files) {
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
    // 6. header contract for entries bound by the contract line
    const prin = principlesOf(ledger);
    for (const r of ledger.rulings) {
      const from = ledger.contractFrom[r.prefix];
      if (from === undefined || r.n < from) continue;
      const { meta, end } = metaOf(r.heading);
      if (!meta || end !== r.heading.length - 1) { fail(lp, r.line, 6, r.id + ': heading does not end with a parenthetical meta'); continue; }
      const clauses = clausesOf(meta);
      if (!clauses.length || isEdgeClause(clauses[0])) fail(lp, r.line, 6, r.id + ': meta must open with a grounding (issue #n or a context), not an edge');
      for (const c of clauses.slice(1)) if (!isEdgeClause(c)) fail(lp, r.line, 6, r.id + ': meta clause is not an edge: "' + c + '"');
      if (!r.principle) fail(lp, r.line, 6, r.id + ': no "Principle:" line');
      else if (!prin.list.length) fail(lp, r.line, 6, r.id + ': names a principle but no principles list was found');
      else if (!principleNamed(prin.list, r.principle)) fail(lp, r.line, 6, r.id + ': principle "' + r.principle + '" is not in the list (' + prin.list.map(p => p.name).join(' · ') + ')');
      if (!/Reason:/.test(r.body)) fail(lp, r.line, 6, r.id + ': body has no "Reason:"');
    }
    // 7. append only: existing headings and bodies unchanged vs the committed ledger
    const committed = committedText(root, lp);
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
function committedText(root, filePath) {
  const p = rel(root, filePath);
  const head = sh('git', ['show', 'HEAD:' + p], root);
  if (head.status !== 0) return null;
  let working = null;
  try { working = fs.readFileSync(filePath, 'utf8'); } catch (e) { return head.stdout; }
  if (normEol(working) !== normEol(head.stdout)) return head.stdout;  // FORMAT.md 1: both sides normalised
  const parent = sh('git', ['show', 'HEAD~1:' + p], root);
  return parent.status === 0 ? parent.stdout : null;
}
function check(argv) {
  const root = enumerationRoot(process.cwd());
  const res = runCheck(root);
  if (argv.json) { out(JSON.stringify({ ok: res.failures.length === 0, failures: res.failures, info: res.info }, null, 2)); return res.failures.length ? 1 : 0; }
  for (const f of res.failures) out(f.file + ':' + f.line + '  check ' + f.k + ': ' + f.message);
  for (const i of res.info) out('info  ' + i);
  if (!res.failures.length) out('check: ok (' + res.ctx.ledgers.size + ' ledger' + (res.ctx.ledgers.size === 1 ? '' : 's') + ', ' + res.ctx.files.length + ' governed-tree files)');
  return res.failures.length ? 1 : 0;
}

// ─── 8. spec-check: token rows and contrast rows ────────────────────────────

const TOKEN_ROW_RE = /^\|\s*`(--[A-Za-z0-9_-]+)`\s*\|\s*`(#[0-9A-Fa-f]{3,8})`\s*\|/;
const CONTRAST_RE = /(\d+(?:\.\d+)?):1/;
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
function contrast(hexA, hexB) { const a = luminance(hexA), b = luminance(hexB); const [hi, lo] = a >= b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); }
function runSpecCheck(root, ctx, onlyLedger) {
  ctx = ctx || loadContext(root);
  const failures = [], info = [];
  let rows = 0;
  for (const [lp, ledger] of ctx.ledgers) {
    if (onlyLedger && lp !== onlyLedger) continue;
    const docs = specDocs(lp);
    if (!docs.uiux) continue;
    const specLines = splitLines(readText(docs.uiux));
    const cssFiles = ctx.files.filter(e => e.ledger === lp && /\.css$/i.test(e.path));
    const decls = new Map(); // token -> [{value, file, line}]
    for (const e of cssFiles) splitLines(fileText(e)).forEach((l, i) => {
      const re = /(--[A-Za-z0-9_-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})\b/g; let m;
      while ((m = re.exec(l)) !== null) { if (!decls.has(m[1])) decls.set(m[1], []); decls.get(m[1]).push({ value: m[2].toLowerCase(), file: e.path, line: i + 1 }); }
    });
    const specValue = new Map();
    specLines.forEach((l, i) => {
      const m = TOKEN_ROW_RE.exec(l);
      if (!m) return;
      rows++;
      const token = m[1], hex = m[2].toLowerCase();
      specValue.set(token, hex);
      const d = decls.get(token);
      if (!d) failures.push({ file: rel(root, docs.uiux), line: i + 1, k: 'a', message: token + ' is ' + hex + ' in the spec but is declared in no CSS file that resolves to ' + rel(root, lp) });
      else for (const x of d) if (x.value !== hex) failures.push({ file: rel(root, docs.uiux), line: i + 1, k: 'a', message: token + ' is ' + hex + ' in the spec but ' + x.value + ' at ' + rel(root, x.file) + ':' + x.line });
    });
    const valueOf = t => specValue.get(t) || (decls.get(t) ? decls.get(t)[0].value : null);
    specLines.forEach((l, i) => {
      if (!/^\|/.test(l)) return;
      const cm = CONTRAST_RE.exec(l);
      if (!cm) return;
      const toks = uniq(Array.from(l.matchAll(/`(--[A-Za-z0-9_-]+)`/g)).map(m => m[1]));
      if (toks.length !== 2) return;
      rows++;
      const a = valueOf(toks[0]), b = valueOf(toks[1]);
      if (!a || !b) { failures.push({ file: rel(root, docs.uiux), line: i + 1, k: 'b', message: 'contrast row: no hex known for ' + (a ? toks[1] : toks[0]) }); return; }
      const stated = Number(cm[1]), got = contrast(a, b);
      if (Math.abs(Math.round(got * 100) / 100 - Math.round(stated * 100) / 100) > 0.005) failures.push({ file: rel(root, docs.uiux), line: i + 1, k: 'b', message: toks[0] + ' on ' + toks[1] + ' states ' + stated.toFixed(2) + ':1 but the hexes give ' + got.toFixed(2) + ':1' });
    });
  }
  return { failures, info, rows };
}
function nearestLedger(argv, root) {
  const cwd = process.cwd();
  const given = flag(argv, '--ledger');
  return given ? path.resolve(cwd, given) : findLedger(path.join(cwd, 'x'), root);
}
function specCheck(argv) {
  const root = enumerationRoot(process.cwd());
  const res = runSpecCheck(root, null, has(argv, '--all') ? null : nearestLedger(argv, root));
  if (argv.json) { out(JSON.stringify({ ok: res.failures.length === 0, rows: res.rows, failures: res.failures }, null, 2)); return res.failures.length ? 1 : 0; }
  for (const f of res.failures) out(f.file + ':' + f.line + '  spec-check ' + f.k + ': ' + f.message);
  if (!res.failures.length) out('spec-check: ok (' + res.rows + ' rows)');
  return res.failures.length ? 1 : 0;
}

// ─── 9. append: entry, addendum, baseline (D4, D8) ──────────────────────────

function flags(argv, name) { const r = []; for (let i = 0; i < argv.raw.length; i++) if (argv.raw[i] === name && i + 1 < argv.raw.length) r.push(argv.raw[i + 1]); return r; }
function writeLedger(ledger, text) { fs.writeFileSync(ledger.path, text); }
function ensureNl(s) { return s.endsWith('\n') ? s : s + '\n'; }
function parseEdgeArg(s) {
  const re = new RegExp('^(?:(' + ADVERBS.join('|') + ')\\s+)?(' + VERBS.join('|') + ')\\s+([A-Za-z]+\\d+)(?:\\s*\\(([^()]*)\\))?$');
  const m = re.exec(s.trim());
  return m ? { adverb: m[1] || '', verb: m[2], to: m[3], qualifier: m[4] || '' } : null;
}
function appendEntry(argv) {
  const { root, ledger } = ledgerFromCwd(argv);
  const title = flag(argv, '--title'), issue = flag(argv, '--issue'), principle = flag(argv, '--principle'), body = flag(argv, '--body');
  const edges = flags(argv, '--edge');
  if (!title || !title.trim()) die('append: --title is required (one line, the ruling in a phrase)', 2);
  if (title.includes(' (')) die('append: --title may not contain " (" — the title rule would cut it there; put the parenthetical in the body', 2);
  if (!issue || !issue.trim()) die('append: --issue is required (an issue number, or a phrase naming the context the ruling answers)', 2);
  if (!principle || !principle.trim()) die('append: --principle is required (one of `docket principles`)', 2);
  const prin = principlesOf(ledger);
  if (!prin.list.length) die('append: no principles list found (the first section of PRD.md, or a "Principles" list in the ledger preamble)', 2);
  const pr = principleNamed(prin.list, principle);
  if (!pr) die('append: principle "' + principle + '" is not one of: ' + prin.list.map(p => p.name).join(' · '), 2);
  if (!body || !body.trim()) die('append: --body is required (the ruling in prose, with its Reason:)', 2);
  if (!/Reason:/.test(body)) die('append: --body must state the reason as a sentence beginning "Reason:"', 2);
  const parsedEdges = [];
  for (const e of edges) {
    const p = parseEdgeArg(e);
    if (!p) die('append: --edge "' + e + '" is not "<verb> <id>" with a verb from: ' + VERBS.join(', '), 2);
    if (!ledger.byId.has(p.to)) die('append: --edge "' + e + '" names ' + p.to + ', which is not in ' + rel(root, ledger.path), 2);
    parsedEdges.push(p);
  }
  let prefix = flag(argv, '--prefix');
  if (!prefix) prefix = ledger.rulings.length ? ledger.rulings[ledger.rulings.length - 1].prefix : null;
  if (!prefix) die('append: --prefix is required for an empty ledger', 2);
  if (!/^[A-Za-z]+$/.test(prefix)) die('append: --prefix must be letters', 2);
  const n = ledger.rulings.filter(r => r.prefix === prefix).reduce((m, r) => Math.max(m, r.n), 0) + 1;
  const grounding = /^#?\d+$/.test(issue.trim()) ? 'issue #' + issue.trim().replace('#', '') : issue.trim();
  const metaParts = [grounding].concat(parsedEdges.map(e => (e.adverb ? e.adverb + ' ' : '') + e.verb + ' ' + e.to + (e.qualifier ? ' (' + e.qualifier + ')' : '')));
  const entry = '### ' + prefix + n + '. ' + title.trim() + ' (' + metaParts.join('; ') + ')\n' + 'Principle: ' + pr.name + '.\n' + body.trim() + '\n';
  const text = ensureNl(ledger.text) + '\n' + entry;
  writeLedger(ledger, text);
  return afterWrite(argv, root, ledger, entry);
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
  const { root, ledger } = ledgerFromCwd(argv);
  const id = flag(argv, '--addendum'), text = flag(argv, '--text');
  const r = ledger.byId.get(id);
  if (!r) die('append: --addendum ' + id + ' names no ruling in ' + rel(root, ledger.path), 2);
  if (!text || !text.trim()) die('append: --text is required (why the entry\'s reason no longer holds, or what changed)', 2);
  const lines = ledger.lines.slice();
  let end = r.endLine;                       // index of the next heading line (exclusive end of the entry)
  while (end > r.line && lines[end - 1].trim() === '') end--;
  const line = '> Addendum ' + today() + ': ' + text.trim().replace(/\s*\n\s*/g, ' ');
  lines.splice(end, 0, line);
  writeLedger(ledger, ensureNl(lines.join('\n')));
  return afterWrite(argv, root, ledger, line);
}
function rewriteBaseline(argv) {
  const { root, ledger } = ledgerFromCwd(argv);
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

// ─── 10. diff: two versions of a ledger ─────────────────────────────────────

function diffLedgers(a, b) {
  const added = b.rulings.filter(r => !a.byId.has(r.id));
  const removed = a.rulings.filter(r => !b.byId.has(r.id));
  const keyE = e => e.from + '|' + e.adverb + '|' + e.verb + '|' + e.to + '|' + e.qualifier;
  const aEdges = new Set(a.rulings.flatMap(r => r.edges.map(keyE)));
  const edgesAdded = b.rulings.flatMap(r => r.edges).filter(e => !aEdges.has(keyE(e)));
  const keyA = (r, x) => r.id + '|' + x.date + '|' + x.text;
  const aAdd = new Set(a.rulings.flatMap(r => r.addenda.map(x => keyA(r, x))));
  const addendaAdded = b.rulings.flatMap(r => r.addenda.filter(x => !aAdd.has(keyA(r, x))).map(x => Object.assign({ id: r.id }, x)));
  const changed = [];
  for (const o of a.rulings) {
    const c = b.byId.get(o.id);
    if (!c) continue;
    if (c.heading !== o.heading) changed.push({ id: o.id, what: 'heading', from: o.heading, to: c.heading, line: c.line });
    if (!bodyOnlyAppended(o.bodyLines, c.bodyLines)) changed.push({ id: o.id, what: 'body', line: c.line });
  }
  return { added, removed, edgesAdded, addendaAdded, changed, unchanged: a.rulings.length - removed.length - changed.length };
}
function diff(argv) {
  const root = enumerationRoot(process.cwd());
  let a, b, labelA, labelB;
  if (has(argv, '--files')) {
    const i = argv.raw.indexOf('--files');
    const fa = argv.raw[i + 1], fb = argv.raw[i + 2];
    if (!fa || !fb) die('usage: docket diff --files <a> <b>', 2);
    a = parseLedger(readText(path.resolve(fa)), path.resolve(fa)); b = parseLedger(readText(path.resolve(fb)), path.resolve(fb));
    labelA = fa; labelB = fb;
  } else {
    const revA = argv._[1], revB = argv._[2];
    if (!revA || !revB) die('usage: docket diff <revA> <revB> [--ledger <path>] | docket diff --files <a> <b>', 2);
    const { ledger } = ledgerFromCwd(argv);
    const relL = rel(root, ledger.path);
    const ra = sh('git', ['show', revA + ':' + relL], root), rb = sh('git', ['show', revB + ':' + relL], root);
    if (ra.status !== 0) die('diff: cannot read ' + relL + ' at ' + revA + ': ' + ra.stderr.trim(), 2);
    if (rb.status !== 0) die('diff: cannot read ' + relL + ' at ' + revB + ': ' + rb.stderr.trim(), 2);
    a = parseLedger(ra.stdout, ledger.path); b = parseLedger(rb.stdout, ledger.path);
    labelA = revA; labelB = revB;
  }
  const d = diffLedgers(a, b);
  if (argv.json) {
    out(JSON.stringify({ from: labelA, to: labelB, added: d.added.map(rulingJson), removed: d.removed.map(r => r.id), edgesAdded: d.edgesAdded.map(e => ({ from: e.from, adverb: e.adverb, verb: e.verb, to: e.to, qualifier: e.qualifier, clause: e.clause })), addendaAdded: d.addendaAdded, changed: d.changed, unchanged: d.unchanged }, null, 2));
    return 0;
  }
  const L = [];
  L.push('docket diff ' + labelA + ' → ' + labelB);
  L.push('Rulings added: ' + (d.added.length ? '' : 'none'));
  for (const r of d.added) L.push('  ' + r.id + '  ' + r.title + (r.issue !== null ? '  · issue #' + r.issue : ''));
  L.push('Edges added: ' + (d.edgesAdded.length ? '' : 'none'));
  for (const e of d.edgesAdded) L.push('  ' + renderEdge(e) + '  — "' + e.clause + '"');
  L.push('Addenda added: ' + (d.addendaAdded.length ? '' : 'none'));
  for (const x of d.addendaAdded) L.push('  ' + x.id + ' (' + x.date + '): ' + x.text);
  for (const r of d.removed) L.push('REMOVED: ' + r.id + '  ' + r.title + '  (append only: a ruling is superseded, never removed)');
  for (const c of d.changed) L.push('CHANGED ' + c.what + ': ' + c.id + (c.what === 'heading' ? '  "' + c.from + '" → "' + c.to + '"' : '') + '  (append only: an existing entry changes only by an appended addendum)');
  L.push('Unchanged: ' + d.unchanged + ' ruling' + (d.unchanged === 1 ? '' : 's'));
  out(L.join('\n'));
  return 0;
}

// ─── 11. status: the docket ─────────────────────────────────────────────────

function statePath(root) { return path.join(root, '.docket', 'verdict.json'); }
function loadState(root) { try { return JSON.parse(readText(statePath(root))); } catch (e) { return { last: null, lastPassHash: null, sessions: {} }; } }
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
  const cwd = process.cwd();
  const root = enumerationRoot(cwd);
  const lp = flag(argv, '--ledger') ? path.resolve(cwd, flag(argv, '--ledger')) : findLedger(path.join(cwd, 'x'), root);
  if (!lp || !isFile(lp)) return 0;                                   // ungoverned project: the docket is silent
  const ledger = loadLedger(lp);
  const ctx = loadContext(root);
  const cited = new Set(codeCites(ctx, ledger).map(c => c.id));
  const uncited = ledger.rulings.filter(r => !cited.has(r.id)).map(r => r.id);
  const pend = pendingAddenda(ledger);
  const st = loadState(root);
  const surfaced = !!(st.last && st.sessions[st.last.session] && st.sessions[st.last.session].surfaced);   // D11: the surfaced state is the one the docket exists to show
  const check_ = runCheck(root, { ctx });
  const spec_ = runSpecCheck(root, ctx, lp);
  const witness = { ok: check_.failures.length === 0 && spec_.failures.length === 0, failures: check_.failures.concat(spec_.failures) };
  if (argv.json) {
    out(JSON.stringify({ ledger: rel(root, lp), rulings: ledger.rulings.length, prefixes: ledger.prefixes, last: ledger.rulings.slice(-3).map(r => ({ id: r.id, title: r.title })), uncited, pendingAddenda: pend, lastVerdict: st.last, surfaced, witness }, null, 2));
    return 0;
  }
  const L = [];
  L.push('Docket — ' + rel(root, lp) + ' (' + ledger.rulings.length + ' ruling' + (ledger.rulings.length === 1 ? '' : 's') + '; prefix' + (ledger.prefixes.length === 1 ? ' ' : 'es ') + ledger.prefixes.join(', ') + ')');
  L.push('Last rulings:');
  for (const r of ledger.rulings.slice(-3).reverse()) L.push('  ' + r.id + '  ' + r.title + (r.issue !== null ? '  · issue #' + r.issue : ''));
  L.push('Cited nowhere: ' + (uncited.length ? uncited.join(', ') + ' (' + uncited.length + ' of ' + ledger.rulings.length + ')' : 'none'));
  L.push('Addenda pending: ' + (pend.length ? '' : 'none'));
  for (const a of pend) L.push('  ' + a.id + ' (' + a.date + '): ' + a.text);
  L.push('Last verdict: ' + (st.last ? st.last.verdict + ' at ' + st.last.at + ' (' + st.last.failures + ' located failure' + (st.last.failures === 1 ? '' : 's') + ')' + (surfaced ? '; session ' + st.last.session + ' is SURFACED — its residue waits for the human' : '') : 'none'));
  L.push('Witness: ' + (witness.ok ? 'ok' : 'FAIL (' + witness.failures.length + ')'));
  for (const f of witness.failures.slice(0, 5)) L.push('  ' + f.file + ':' + f.line + '  ' + (typeof f.k === 'number' ? 'check ' : 'spec-check ') + f.k + ': ' + f.message);
  out(L.join('\n'));
  return 0;
}

// ─── 12. gate / verdict: the judge's two commands (D10, D11) ────────────────

function sessionId(argv) {
  const s = flag(argv, '--session');
  if (s) return s;
  if (process.env.DOCKET_SESSION) return process.env.DOCKET_SESSION;
  return 'default';
}
// The diff since the committed head over every governed file and every ledger, plus untracked governed content.
function governedDiff(root) {
  const ctx = loadContext(root, { includeUntracked: true });
  const tracked = new Set(trackedFiles(root) || []);
  const files = new Set();
  for (const [lp, ledger] of ctx.ledgers) { files.add(lp); for (const f of governedFiles(ctx, ledger)) files.add(f); }
  const rels = Array.from(files).map(f => rel(root, f)).sort();
  const trackedRels = rels.filter(r => tracked.has(path.join(root, r)));
  const untrackedRels = rels.filter(r => !tracked.has(path.join(root, r)));
  let diffText = '', touched = [];
  if (trackedRels.length) {
    const r = sh('git', ['diff', 'HEAD', '--'].concat(trackedRels), root);
    if (r.status === 0) {
      diffText = r.stdout;
      const n = sh('git', ['diff', 'HEAD', '--name-only', '--'].concat(trackedRels), root);
      touched = n.stdout.split('\n').map(s => s.trim()).filter(Boolean);
    } else {                                                          // no commit yet: everything governed is new
      for (const f of trackedRels) diffText += '+++ ' + f + '\n' + readText(path.join(root, f));
      touched = trackedRels.slice();
    }
  }
  let untrackedText = '';
  for (const f of untrackedRels) { untrackedText += '+++ ' + f + '\n' + readText(path.join(root, f)); touched.push(f); }
  const empty = diffText === '' && untrackedText === '';
  return { hash: sha256(diffText + untrackedText), touched: uniq(touched), empty };
}
function gate(argv) {
  const root = enumerationRoot(process.cwd());
  const id = sessionId(argv);
  const st = loadState(root);
  const d = governedDiff(root);
  const sess = st.sessions[id] || { blocks: 0, history: [], surfaced: false };
  if (d.empty || d.hash === st.lastPassHash) { out('SKIP'); return 0; }                         // D10
  if (sess.surfaced) { out('SKIP'); return 0; }                                                   // D11: surfaced until a PASS or a new session
  const h = sess.history;
  const stuck = sess.blocks >= THIRD_CYCLE && h.length >= 2 && h[h.length - 1] >= h[h.length - 2];
  if (sess.blocks >= BLOCK_CAP || stuck) {                                                        // D11
    sess.surfaced = true; st.sessions[id] = sess; saveState(root, st);
    const L = ['SURFACE'];
    L.push('residue: ' + sess.blocks + ' block' + (sess.blocks === 1 ? '' : 's') + ' this session since the last PASS; located failures per verdict: ' + (h.length ? h.join(' → ') : 'none recorded'));
    if (st.last) L.push('last verdict: ' + st.last.verdict + ' at ' + st.last.at + ' (' + st.last.failures + ' located failures)');
    L.push('report this to the user verbatim, then stop again');
    out(L.join('\n'));
    return 0;
  }
  out('JUDGE ' + d.hash + (d.touched.length ? ' ' + d.touched.join(' ') : ''));
  return 0;
}
function verdict(argv) {
  const v = (argv._[1] || '').toUpperCase();
  if (!['PASS', 'FAIL', 'STALE'].includes(v)) die('usage: docket verdict <PASS|FAIL|STALE> --hash <hash> --failures <n> [--session <id>]', 2);
  const root = enumerationRoot(process.cwd());
  const id = sessionId(argv);
  const failures = Number(flag(argv, '--failures') || 0);
  if (!Number.isInteger(failures) || failures < 0) die('verdict: --failures must be a non-negative integer', 2);
  const hash = flag(argv, '--hash') || governedDiff(root).hash;
  const st = loadState(root);
  const sess = st.sessions[id] || { blocks: 0, history: [], surfaced: false };
  st.last = { verdict: v, hash, failures, at: new Date().toISOString(), session: id };
  if (v === 'PASS') { st.lastPassHash = hash; sess.blocks = 0; sess.history = []; sess.surfaced = false; }   // reset only on PASS (D11)
  else { sess.blocks += 1; sess.history.push(failures); }
  st.sessions[id] = sess;
  saveState(root, st);
  out('verdict recorded: ' + v + ' (' + failures + ' located failure' + (failures === 1 ? '' : 's') + '); session ' + id + ': ' + sess.blocks + ' block' + (sess.blocks === 1 ? '' : 's') + ' since the last PASS');
  return 0;
}

// ─── 13. cli ────────────────────────────────────────────────────────────────

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
  '  docket diff <revA> <revB>           rulings, edges and addenda added; existing entries changed, listed loudly',
  '  docket diff --files <a> <b>',
  '  docket principles                   the principle list',
  '  docket append --title --issue --principle [--edge "<verb> <id>"]... --body   a new entry, checked',
  '  docket append --addendum <id> --text "..."   a dated addendum under an entry',
  '  docket append --baseline            rewrite the bare-cite baseline',
  '  docket gate --session <id>          SKIP | SURFACE | JUDGE <hash> <files...>',
  '  docket verdict <PASS|FAIL|STALE> --hash <h> --failures <n> --session <id>',
  '',
  'Options: --json on every subcommand; --ledger <path> where a ledger is read.',
  'Exit codes: 0 success · 1 a failed check · 2 usage error.',
].join('\n');
function parseArgv(args) {
  const raw = args.slice();
  const _ = [];
  const takesValue = new Set(['--ledger', '--session', '--hash', '--failures', '--title', '--issue', '--principle', '--edge', '--body', '--prefix', '--addendum', '--text', '--answers', '--target']);
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (a === '--json' || a === '--baseline' || a === '--files' || a === '--text-only') continue;
    if (takesValue.has(a)) { i++; continue; }
    if (a.startsWith('--')) continue;
    _.push(a);
  }
  return { raw, _, json: raw.includes('--json') };
}
function witness(argv) {
  const root = enumerationRoot(process.cwd());
  const c = runCheck(root);
  const s = runSpecCheck(root, c.ctx, nearestLedger(argv, root));
  for (const f of c.failures) out(f.file + ':' + f.line + '  check ' + f.k + ': ' + f.message);
  for (const f of s.failures) out(f.file + ':' + f.line + '  spec-check ' + f.k + ': ' + f.message);
  for (const i of c.info) out('info  ' + i);
  const n = c.failures.length + s.failures.length;
  out(n ? 'witness: ' + n + ' failure' + (n === 1 ? '' : 's') : 'witness: ok (' + c.ctx.ledgers.size + ' ledger' + (c.ctx.ledgers.size === 1 ? '' : 's') + ', ' + s.rows + ' spec rows)');
  return n ? 1 : 0;
}
function main() {
  const argv = parseArgv(process.argv.slice(2));
  const sub = argv._[0];
  const table = { near, index: indexOf_, check, 'spec-check': specCheck, append, query, governs, diff, principles, status, gate, verdict };
  if (!sub) return witness(argv);
  if (sub === 'help' || sub === '--help' || sub === '-h') { out(USAGE); return 0; }
  if (!table[sub]) die('docket: unknown subcommand "' + sub + '"\n\n' + USAGE, 2);
  return table[sub](argv);
}
if (require.main === module) process.exitCode = main();   // exitCode, not exit(): a piped stdout must flush first
module.exports = { parseLedger, titleOf, findLedger, projectRoot, contrast, luminance, VERBS, ADVERBS };
