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
// 16  gate/verdict/stop    the mechanical gate, the verdict file, the stop that refuses silence (D10, D11)
// 17  protocol/pack/transcript   what the judge reads, printed by the core
//
// Exit codes: 0 success · 1 a failed check · 2 usage error.

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const os = require('os');

// ─── 0. utilities ───────────────────────────────────────────────────────────

// D14: each number below preserves a stated property; a change to one is a new ruling, never an edit here.
const WINDOW = 20;        // D2: ±20 lines; D16: two to five rulings is what this yields, measured
const CAP = 8;            // D2: at most eight rulings listed; D16: the fixture never reaches it, a denser window would
const TITLE_MAX = 72;     // D7: the title rule's cut
const BLOCK_CAP = 5;      // D11: five blocks per session since its last PASS
const THIRD_CYCLE = 3;    // D11: after the third block, failures must decrease
const STOP_WAIT = 700;    // D14, logged in D19 and D37: the seconds `stop` gives the judge it starts before it stops it — more than twice the longest judge measured at a stop (330, D37's addendum)
const SNIFF_BYTES = 8000;   // git's own binary sniff: a file with a NUL in its first 8000 bytes is not text
const REFUSALS_MIN = 3;   // a constitution names at least three refusals: one is a mood, two a pair, three a boundary
const GLANCE = 100;       // D14: one glance — governs cuts a cited line here, and status each pending addendum; the ledger holds the rest

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
let TRAIL = null;                                                      // the trail this run wrote to, when DOCKET_TRAIL is set (D25)
function die(msg, code) {
  if (TRAIL) { try { fs.appendFileSync(TRAIL, '  refused (exit ' + (code === undefined ? 2 : code) + '): ' + plain(msg).replace(/\s+/g, ' ').slice(0, 400 /* a refusal's first sentence: the line and the rule (D14's addendum) */) + '\n'); } catch (e) { /* the measurement's, not the command's */ } }
  process.stderr.write(plain(msg) + '\n'); process.exit(code === undefined ? 2 : code);
}
function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch (e) { return ''; } }
function readText(p) { return fs.readFileSync(p, 'utf8'); }
function exists(p) { try { fs.accessSync(p); return true; } catch (e) { return false; } }
function isFile(p) { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } }
function today() { return process.env.DOCKET_TODAY || new Date().toISOString().slice(0, 10); }
function sh(cmd, args, cwd) {
  const r = cp.spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });   // 256 MiB: past any diff, blame or listing a session makes (D14's addendum)
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
    const buf = Buffer.alloc(SNIFF_BYTES);                           // git's own binary sniff
    const n = fs.readSync(fd, buf, 0, SNIFF_BYTES, 0);
    for (let i = 0; i < n; i++) if (buf[i] === 0) return false;
    return true;
  } catch (e) { return false; } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function rel(from, to) { const r = path.relative(from, to); return r === '' ? '.' : r.split(path.sep).join('/'); }
// One trailing newline ends the last line; it does not open another. A file of 260 lines that
// ends as files do read as 260 here, which is what the ledger says the witness counts and what
// every window bound and every line number is measured against (FORMAT.md 1).
function splitLines(text) { return text.replace(/\r?\n$/, '').split(/\r?\n/); }
// A leading U+FEFF is the byte order mark an editor may write: an encoding mark, not text, so a heading on a ledger's or a spec
// document's first line is read past it (FORMAT.md 1); the ledger's writer keeps it
function unBom(s) { return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function uniq(arr) { return Array.from(new Set(arr)); }
function stripMarks(s) { return s.replace(/`/g, '').replace(/\*\*/g, ''); }
// One glance (D14): a text of more than GLANCE characters — code points (FORMAT.md 3), so no character is split — keeps
// GLANCE - 1 of them and a mark, so the cut is never silent; governs cuts a cited line and status a pending addendum by it
function glance(s) { const t = Array.from(s); return t.length > GLANCE ? t.slice(0, GLANCE - 1).join('').trimEnd() + '\u2026' : s; }

// ─── 1. discovery (D5) ──────────────────────────────────────────────────────

// The project root of `dir` (D44): the git root of `dir`, whatever project directory the host names, so every command
// reads the tree the stop judges, and the maker is shown at the edit the law it is judged by (D1, D28); outside a
// repository, CLAUDE_PROJECT_DIR when set and `dir` lies under it; else null. Zero config: nothing else is consulted.
// The host's variable bounds only the tree it holds — a value naming some other directory neither redirects a walk nor
// empties an enumeration (a check run under it would pass with nothing to check). Discovery walks up to the root, or
// to the filesystem root when there is none; file enumeration never does — see enumerationRoot.
function projectRoot(dir) {
  const g = gitRoot(dir);
  if (g) return g;
  const v = process.env.CLAUDE_PROJECT_DIR;                            // outside a repository, the host's project directory, when it names one
  if (v && isDir(v) && isWithin(path.resolve(dir), path.resolve(v))) return path.resolve(v);   // a value that is not a directory names no tree
  return null;
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
// The root the stop's commands share — gate, verdict and stop, and the state, log and trail under its .docket/ (D28,
// D44): the git root of `cwd`, as every command's; outside a repository, the root the stop passed to the judge it
// started, DOCKET_ROOT, when `cwd` lies under it, else the enumeration root. The host names its project directory to its
// command hooks and none to the judge's shell, so the stop hands its root down, and its two halves read one state.
function stopRoot(cwd) {
  const g = gitRoot(cwd);
  if (g) return g;
  const v = process.env.DOCKET_ROOT;
  if (v && isDir(v) && isWithin(path.resolve(cwd), path.resolve(v))) return path.resolve(v);
  return enumerationRoot(cwd);
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
const HEADING_RE = /^### ([A-Za-z]+)([1-9]\d{0,14})\.[ \t]+((?:.*[^ \t])?)[ \t]*$/s;   // the title to its last non-blank character, read in one pass: a long run of spaces inside it costs no backtracking   // s: a U+2028/U+2029 inside a heading is content to this reader, as it is to splitLines   // a heading ends at spaces and tabs: a bare CR is content, not the end of a line (1)   // ASCII prefix, no leading zero, at most fifteen digits so n is exact (FORMAT.md 2)
// An entry heading written in another form — another number of #, no space after them, bold, or the id alone at a line's
// start — read only to name it in an entry-less ledger (D45): it opens no entry (FORMAT.md 2)
const OTHER_HEADING_RE = /^(?:#{1,6}[ \t]*|\*\*)?[A-Za-z]+[1-9][0-9]*\.(?:\*\*)?(?:[ \t]|$)/;
const SECTION_RE = /^## ([A-Za-z]+)\.\s+((?:.*\S)?)\s*$/;
const ADDENDUM_RE = /^> Addendum (\d{4}-\d{2}-\d{2}): ((?:.*\S)?)\s*$/;
const SPEC_HEADING_RE = /^#{1,6}\s+§(\d+(?:\.\d+){0,2})\s+((?:.*\S)?)\s*$/;   // three levels at most (FORMAT.md 7): `§4.5.1.1` is no spec heading
// One verb may name several targets joined by "/" ("keeps R1/R2"): one edge per target, the same clause.
// A verb or adverb may open a sentence with a capital — "Supersedes R1", "In part reverses R6" — and is recorded in
// lowercase; any other casing is no edge (FORMAT.md 5).
function caseHead(words) { return words.map(w => '[' + w[0] + w[0].toUpperCase() + ']' + w.slice(1)); }
const EDGE_RE = new RegExp('(?:' + NOT_WORD_BEFORE + '(' + caseHead(ADVERBS).join('|') + ')\\s+)?' + NOT_WORD_BEFORE + '(' + caseHead(VERBS).join('|') + ')\\s+([A-Za-z]+)([1-9]\\d{0,14})((?:/[A-Za-z]+[1-9]\\d{0,14})*)' + NOT_WORD_AFTER + '(?:\\s*\\(([^()]*)\\))?', 'gu');

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
      // A capital opens a sentence and nowhere else (FORMAT.md 5): a capitalised verb or adverb is an edge only as its unit's first
      // word — the meta clause, the title's sentence, the body's — and one inside a sentence ("The Lot Keeps R5") is a word of it.
      // The scan goes on from the next character, so a lowercase edge after a capitalised adverb is still read, without it.
      const first = m[1] || m[2];
      if ((m[1] && /^\p{Lu}/u.test(m[2])) || (/^\p{Lu}/u.test(first) && /[\p{L}\p{N}]/u.test(scan.slice(0, m.index)))) { EDGE_RE.lastIndex = m.index + 1; continue; }
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
  const lines = splitLines(unBom(text));
  const rulings = [], sections = [];
  // Keyed by the ledger's own text, a prefix or a path: a map with no prototype, where `constructor` or `__proto__` is a
  // key like any other and not a property every object already has (D1).
  const contractFrom = Object.create(null), baseline = Object.create(null);
  let hasBaseline = false;
  let firstHeading = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (isBoundary(lines[i])) { firstHeading = i; break; }
  }
  const preambleLines = lines.slice(0, firstHeading);
  const directiveFaults = [];                                          // {k, line, message}: check reports them, parse reads the first directive
  const contractFromLine = Object.create(null);                        // where each contract line sits, so check can name it
  const firstAt = Object.create(null);                                 // the line of each prefix's first contract line
  let firstBareCites = 0;                                              // and of the first bare-cites comment: a prefix may be any letters
  for (let li = 0; li < preambleLines.length; li++) {
    const l = preambleLines[li];
    let m = /<!--\s*docket:\s*contract from ([A-Za-z]+)([1-9]\d{0,14})\s*-->/.exec(l);   // a ruling number (2): a zero names no entry, so it binds none
    if (m) {
      if (contractFrom[m[1]] !== undefined) directiveFaults.push({ k: 6, line: li + 1, message: 'a second contract line for prefix ' + m[1] + ' (line ' + firstAt[m[1]] + ' binds); the preamble carries one per prefix (FORMAT.md 11)' });
      else { contractFrom[m[1]] = Number(m[2]); firstAt[m[1]] = li + 1; contractFromLine[m[1]] = li + 1; }
    }
    m = /<!--\s*docket:\s*bare-cites([^>]*)-->/.exec(l);
    if (m) {
      if (hasBaseline) { directiveFaults.push({ k: 4, line: li + 1, message: 'a second bare-cites comment (line ' + firstBareCites + ' is the baseline); the preamble carries one (FORMAT.md 9)' }); continue; }
      hasBaseline = true; firstBareCites = li + 1;
      for (const kv of m[1].trim().match(/"(?:[^"\\]|\\.)*"=\S*|\S+/g) || []) {
        // a path holding a space, a quote, a backslash or ">" is a JSON string, "Design Notes.md"=1 (FORMAT.md 9)
        const q = /^("(?:[^"\\]|\\.)*")=(\S*)$/.exec(kv), eq = q ? -1 : kv.lastIndexOf('=');
        let key = null; try { key = q ? JSON.parse(q[1]) : eq > 0 ? kv.slice(0, eq) : null; } catch (e) { key = null; }
        const count = q ? q[2] : kv.slice(eq + 1);
        // One file, one allowance: a repeated key would let the later number raise a reviewed allowance
        // in silence, as a second baseline comment or a second contract line would (FORMAT.md 9, 11).
        if (key && Object.prototype.hasOwnProperty.call(baseline, key)) directiveFaults.push({ k: 4, line: li + 1, message: 'bare-cites baseline: ' + key + ' is listed twice; a file carries one allowance (FORMAT.md 9)' });
        else if (key && /^\d+$/.test(count)) baseline[key] = Number(count);
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
      const mo = metaOf(heading), meta = mo.meta;
      const titleText = mo.start >= 0 ? heading.slice(0, mo.start) : heading;   // FORMAT.md 5: an edge anywhere in the heading, the title included
      const id = hm[1] + hm[2];
      const issueM = /issue #(\d+)/.exec(meta);
      const addenda = [];
      bodyLines.forEach((l, k) => { const am = ADDENDUM_RE.exec(l); if (am) addenda.push({ date: am[1], text: am[2], line: start + 2 + k }); });
      const rawEdges = edgesIn(meta, id, start + 1, true).concat(edgesIn(titleText, id, start + 1, false));
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
  return { path: ledgerPath, dir: path.dirname(ledgerPath), home: ledgerHome(ledgerPath), text, lines, preambleLines, prefixes, rulings, sections, byId, contractFrom, contractFromLine, baseline, hasBaseline, baselineLine: firstBareCites, directiveFaults };
}
// A pair of the bare-cites comment as it is written and read (FORMAT.md 9): a path holding a space, a quote, a backslash or ">"
// is a JSON string, so the writer, the reader and check 7's record of a rise agree on one spelling
function baselinePair(p, n) { return (/[\s"\\>]/.test(p) ? JSON.stringify(p).replace(/>/g, '\\u003e') : p) + '=' + n; }
function parseSpec(text) {
  const heads = [];
  splitLines(unBom(text)).forEach((l, i) => { const m = SPEC_HEADING_RE.exec(l); if (m) heads.push({ num: m[1], title: stripMarks(m[2]), line: i + 1 }); });
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
  const re = new RegExp(NOT_WORD_BEFORE + '(' + ledger.prefixes.map(escapeRe).join('|') + ')([1-9]\\d{0,14})' + NOT_WORD_AFTER, 'gu');   // FORMAT.md 2, 8: no leading zero, and fifteen digits at most — a longer numeral is no id
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
const SPEC_CITE_RE = /(?<![\p{L}\p{N}_])(UIUX|PRD) §(\d+(?:\.\d+){0,2})/gu;   // the heading's depth (FORMAT.md 8): `UIUX §4.5.1.1` cites `UIUX §4.5.1`
function specCitesIn(text) {
  const all = [], lines = splitLines(text), fenced = fencedLines(lines);
  lines.forEach((l, i) => { if (fenced[i]) return; SPEC_CITE_RE.lastIndex = 0; let m; while ((m = SPEC_CITE_RE.exec(maskCode(l))) !== null) all.push({ doc: m[1], num: m[2], line: i + 1 }); });
  return all;
}
const BARE_CITE_RE = /(?<!(?<![\p{L}\p{N}_])(?:UIUX|PRD) )(?<!(?<![\p{L}\p{N}_])(?:UIUX|PRD))§\d/gu;
const GLUED_CITE_RE = /(?<![\p{L}\p{N}_])(UIUX|PRD)§(\d+(?:\.\d+){0,2})/gu;   // the document's name against the mark, with the space missing
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
    // thrown, not died on: the command refuses at its top, exit 2, unless it reads a tree past the bound as ungoverned (FORMAT.md 1)
    if (++seen.n > WALK_MAX) throw Object.assign(new Error('the tree under ' + (root || dir) + ' holds more than ' + WALK_MAX + ' entries and is not a git repository, so there is no tracked set to enumerate; run the docket inside the repository, or set the project directory to it (FORMAT.md 1)'), { walkBound: true });
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
  // The judge's own state is never a governed file, whatever the project's .gitignore says: its verdicts and its trail
  // name rulings, and read as governed they would move the diff the judge is judging with every command it runs (D26).
  files = files.filter(f => !rel(root, f).split(path.sep).includes('.docket'));
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
// the host names or git tracks is enumerated for them; a bare directory is not searched, nor a tree past the walk's bound.
function ledgersBelow(dir, root) {
  if (!projectRoot(dir)) return [];
  let ctx;
  try { ctx = loadContext(root); } catch (e) { if (e && e.walkBound) return []; throw e; }
  return Array.from(ctx.ledgers.keys()).filter(lp => isWithin(path.dirname(lp), dir)).map(lp => rel(dir, lp)).sort();
}
function noLedgerMessage(cwd, root) {
  const below = ledgersBelow(cwd, root);
  return 'no ledger: no DECISIONS.md or docs/DECISIONS.md between ' + cwd + ' and ' + root
    + (below.length ? '; below the working directory: ' + below.join(', ') + ' — pass --ledger <path>, or run from inside' : '');
}

// ─── 5. near: the pre-edit window (D1, D2, D7) ──────────────────────────────

// Each match's line, counted forward from the last match: the matches come in order, so the file is read once however
// many there are — a replace_all over a long file stays inside the pre-edit call's five seconds (D14's addendum)
function findAll(text, needle) {
  const at = [];
  let i = 0, from = 0, line = 1;
  for (;;) {
    const j = text.indexOf(needle, i); if (j < 0) break;
    for (let k = from; k < j; k++) if (text.charCodeAt(k) === 10) line++;
    from = j; at.push(line); i = j + needle.length;
  }
  return at;
}
function near(argv) {
  const raw = readStdin();
  let input;
  try { input = JSON.parse(raw); } catch (e) { return 0; }            // D1: never a blocking exit
  if (!input || typeof input !== 'object') return 0;
  const tool = input.tool_name, ti = input.tool_input || {};
  // a NUL names no file and no directory: a path that holds one is an input near cannot use, silence (D1), and a directory that
  // holds one is no directory, read as a missing one is
  if (typeof ti.file_path !== 'string' || !ti.file_path || ti.file_path.includes('\0')) return 0;
  const cwd = typeof input.cwd === 'string' && input.cwd && !input.cwd.includes('\0') ? input.cwd : process.cwd();
  const file = path.resolve(cwd, ti.file_path);
  const startDir = exists(path.dirname(file)) ? path.dirname(file) : cwd;
  const pr = projectRoot(startDir);
  const lp = findLedger(file, pr || path.parse(path.resolve(startDir)).root);
  if (!lp) return 0;                                                   // ungoverned tree: silent
  recordCore(pr || ledgerHome(lp));                                    // the judge finds the core through this file (16)
  if (isLedgerDoc(file)) return 0;                                     // FORMAT.md 8: the ledger is amended through append; a direct edit is check 7's business
  if (isSelfCopy(file)) return 0;                                      // D9: the vendored witness cites another ledger; a list from it would be wrong, so there is none
  if (rel(pr || ledgerHome(lp), file).split('/').includes('.docket')) return 0;   // D26: the judge's state is outside the governed set, the window's as the walk's
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
    span = normEol(needle).replace(/\n$/, '').split('\n').length - 1;   // the edit covers these lines too; the window is ±WINDOW around the whole of it;
                                                                       // a final newline ends the last line and opens none, as splitLines reads a file
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
      // Each ruling keeps its ranked cites — the nearest to any match (nl, nc) and the nearest to the first (nl0, nc0), the
      // earlier line and then the earlier column among equals, since FORMAT.md 15 breaks a tie by that cite's line and not by
      // the ruling's earliest cite in the window — and first, its earliest cite, for the whole file's order.
      const closer = (dd, l0, c0, bd, bl, bc) => dd < bd || (dd === bd && (l0 < bl || (l0 === bl && c0 < bc)));
      if (!cur) byId.set(c.id, { id: c.id, count: 1, dist: d, nl: ln, nc: c.col, dist0: d0, nl0: ln, nc0: c.col, first: ln, col: c.col });
      else {
        cur.count++;
        if (closer(d, ln, c.col, cur.dist, cur.nl, cur.nc)) { cur.dist = d; cur.nl = ln; cur.nc = c.col; }
        if (closer(d0, ln, c.col, cur.dist0, cur.nl0, cur.nc0)) { cur.dist0 = d0; cur.nl0 = ln; cur.nc0 = c.col; }
        if (ln < cur.first || (ln === cur.first && c.col < cur.col)) { cur.first = ln; cur.col = c.col; }
      }
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
  if (mode === 'one') list.sort((a, b) => a.dist - b.dist || a.nl - b.nl || a.nc - b.nc);
  else if (mode === 'many') list.sort((a, b) => b.count - a.count || a.dist0 - b.dist0 || a.nl0 - b.nl0 || a.nc0 - b.nc0); // D7
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
// The header names the ledger relative to the project root, which holds every ledger the walk finds (D44); with no
// project root, relative to the ledger's git root, and absolute when there is none.
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
// A ruling's reason as the judge's step 4 reads it (D24): from `Reason:` to the end of its line, outside code spans and
// fenced blocks, and outside addenda; null for an entry that states none.
function reasonOf(r) {
  const fenced = fencedLines(r.bodyLines);
  for (let k = 0; k < r.bodyLines.length; k++) {
    const l = r.bodyLines[k];
    if (fenced[k] || ADDENDUM_RE.test(l)) continue;
    const at = maskCode(l).indexOf('Reason:');
    if (at >= 0) return l.slice(at).trim();
  }
  return null;
}
// Several ids print several blocks, each as one id prints it, a blank line between (D30): a judge whose turns a host
// caps reads every ruling the touched regions cite in one command.
function governs(argv) {
  const ids = argv._.slice(1);
  if (!ids.length) die('usage: docket governs <id> [<id>…]', 2);
  const { root, ledger } = ledgerFromCwd(argv);
  const rs = ids.map(id => {
    const res = resolveRuling(ledger, id);                              // an id is a name, and a name is read whatever its case, as query reads one
    if (res.ambiguous) die('no ruling ' + id + ' in ' + rel(root, ledger.path) + '; ' + res.ambiguous.join(' and ') + ' differ only in case — name one exactly', 2);
    if (!res.r) die('no ruling ' + id + ' in ' + rel(root, ledger.path), 2);
    return res.r;
  });
  const ctx = loadContext(root);
  const all = codeCites(ctx, ledger);
  if (argv.json) {
    const objs = rs.map(r => { const cites = all.filter(c => c.id === r.id); return { ruling: rulingJson(r), reason: reasonOf(r), outEdges: r.edges, inEdges: inEdges(ledger, r.id), addenda: r.addenda, cites: cites.map(c => ({ file: c.rel, line: c.line, text: c.text.trim() })) }; });
    out(JSON.stringify(objs.length === 1 ? objs[0] : objs, null, 2));
    return 0;
  }
  out(rs.map(r => governsBlock(root, ledger, r, all.filter(c => c.id === r.id))).join('\n\n'));
  return 0;
}
function governsBlock(root, ledger, r, cites) {
  const ins = inEdges(ledger, r.id);
  const lines = [];                                                    // D3: an edge list, never a status
  lines.push(r.id + '  ' + r.title + (r.issue !== null ? '  · issue #' + r.issue : '') + '  (' + rel(root, ledger.path) + ':' + r.line + ')');
  const why = reasonOf(r);
  if (why) lines.push(why);                                            // the premise the judge's step 4 asks after
  lines.push('Out-edges (what ' + r.id + ' does to earlier rulings):');
  if (!r.edges.length) lines.push('  none'); for (const e of r.edges) lines.push('  ' + renderEdge(e) + '  — "' + e.clause + '"');
  lines.push('In-edges (what later rulings do to ' + r.id + '):');
  if (!ins.length) lines.push('  none'); for (const e of ins) lines.push('  ' + renderEdge(e) + '  — "' + e.clause + '"');
  lines.push('Addenda:');
  if (!r.addenda.length) lines.push('  none'); for (const a of r.addenda) lines.push('  ' + a.date + ': ' + a.text);
  lines.push('Code cites:');
  if (!cites.length) lines.push('  none'); for (const c of cites) lines.push('  ' + c.rel + ':' + c.line + '  ' + glance(c.text.trim()));
  return lines.join('\n');
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
      const t = fileText(e);
      // the contract line's number is the directive's own: the first entry it binds, which may not be written yet (FORMAT.md 11)
      const own = c => e.path === lp && ledger.contractFromLine[c.prefix] === c.line && ledger.contractFrom[c.prefix] === c.n;
      for (const c of citesIn(t, ledger)) if (!c.exists && !own(c)) fail(e.path, c.line, 1, 'cite ' + c.id + ' names no ruling in ' + rel(root, lp));
      // a fence never closed quotes every line after it, cites included (FORMAT.md 8): in the ledger check 2 fails it; in any
      // other file the rule reads it so, and the line that opened it is named, so what it quotes is never quoted unseen
      if (e.path !== lp) {
        const fl = splitLines(t).map((l, i) => (/^\s*```/.test(l) ? i + 1 : 0)).filter(Boolean);
        if (fl.length % 2 === 1) info.push(rel(root, e.path) + ':' + fl[fl.length - 1] + ': a fence opened here is never closed; every line after it is quoted, cites included (FORMAT.md 8)');
      }
    }
    // 2. numbering contiguous per prefix, in order of appearance
    const seenN = Object.create(null);                                 // keyed by prefix, which may be any letters
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
    // D39: a ledger with no entries holds no line that begins "### ", fenced or not — a fence quotes cites, not headings, and
    // a fenced entry heading still opens an entry (FORMAT.md 8). One that does reads as though it rules and rules nothing: its
    // headings fail the grammar (FORMAT.md 2), or a bare CR began them, and a bare CR ends no line here (FORMAT.md 1). For this
    // one question its lines are read as its author ended them, a bare CR ending one; a ledger meant to govern nothing holds
    // no such line, and keeps its info line.
    if (empty) {
      const starts = [0]; for (const m of ledger.text.matchAll(/\r\n|\n|\r/g)) starts.push(m.index + m[0].length);
      const seen = ledger.text.split(/\r\n|\n|\r/);
      const at = seen.map((l, i) => (l.startsWith('### ') ? i : -1)).filter(i => i >= 0);
      if (at.length) {
        const s0 = starts[at[0]], viaCr = s0 > 0 && ledger.text[s0 - 1] === '\r';
        const line = (ledger.text.slice(0, s0).match(/\n/g) || []).length + 1;   // the line this reader numbers it on
        fail(lp, line, 2, 'no entries, yet ' + at.length + (at.length === 1 ? ' line begins' : ' lines begin') + ' "### ", the first "### ' + seen[at[0]].slice(4).split(/[ \t]/)[0] + '"' +
          (viaCr ? ' after a bare CR, which ends no line here (FORMAT.md 1)' : ', not an entry heading (FORMAT.md 2)') +
          ': a ledger with no entries governs nothing, and one meant to govern nothing holds no such line (D39)');
      } else {
        const other = seen.map((l, i) => (OTHER_HEADING_RE.test(l) ? i : -1)).filter(i => i >= 0);
        if (other.length) {
          const line = (ledger.text.slice(0, starts[other[0]]).match(/\n/g) || []).length + 1;
          fail(lp, line, 2, 'no entries, yet ' + other.length + (other.length === 1 ? ' line reads' : ' lines read') + ' as an entry heading in another form, the first "' + Array.from(seen[other[0]].trim()).slice(0, 40).join('') + '"; an entry heading is "### <P><n>. <title>" (FORMAT.md 2): a ledger with no entries governs nothing, and one meant to govern nothing holds no such line (D39, D45)');
        }
      }
    }
    // D45: a ledger is UTF-8 text; one saved as UTF-16, or holding a NUL byte, reads as no entries at all and would pass as
    // ungoverned — it fails here, at its first line, named
    { let b = null; try { b = fs.readFileSync(lp); } catch (e) { b = null; }
      if (b && ((b[0] === 0xFF && b[1] === 0xFE) || (b[0] === 0xFE && b[1] === 0xFF) || b.includes(0))) fail(lp, 1, 2, 'the ledger is not UTF-8 text' + ((b[0] === 0xFF && b[1] === 0xFE) || (b[0] === 0xFE && b[1] === 0xFF) ? ' — a UTF-16 byte order mark opens it' : ' — it holds a NUL byte') + '; save it as UTF-8 (FORMAT.md 1, D45)'); }
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
    let skipSaid = false;                                              // a skip committedText names itself is not said twice
    const committed = committedText(root, lp, ledger.text, (m, skip) => { skipSaid = skipSaid || !!skip; info.push(rel(root, lp) + ': check 7 ' + m); });
    if (committed === null && !skipSaid) info.push(rel(root, lp) + ': check 7 skipped — no earlier version to compare (the ledger is not yet committed, or the revision compared with has no such file: a first commit, or the commit that added it)');   // FORMAT.md 13: the skip is said, not silent
    if (committed !== null) {
      const old = parseLedger(committed, lp);
      for (const o of old.rulings) {
        const cur = ledger.byId.get(o.id);
        if (!cur) { fail(lp, o.line, 7, o.id + ' was removed (append only)'); continue; }
        if (cur.heading !== o.heading) fail(lp, cur.line, 7, o.id + ': heading changed (append only): "' + o.heading + '" → "' + cur.heading + '"');
        if (!bodyOnlyAppended(o.bodyLines, cur.bodyLines)) fail(lp, cur.line, 7, o.id + ': body changed other than by appended addendum lines (append only)');
      }
      // The preamble's directives are held as the entries are (D41): a contract line binds from where it was written, and does
      // not move or go; the bare-cites comment, once committed, does not go, and an allowance may fall but rises only when an
      // entry written since carries its new pair — the ratchet is loosened on the record, with its reason, or not at all
      for (const p of Object.keys(old.contractFrom)) {
        const was = p + old.contractFrom[p], now = ledger.contractFrom[p] === undefined ? null : p + ledger.contractFrom[p];
        if (now === null) fail(lp, 1, 7, 'the contract line for ' + p + ', from ' + was + ', is gone; the preamble\'s directives are held as its entries are (D41)');
        else if (now !== was) fail(lp, ledger.contractFromLine[p], 7, 'the contract line for ' + p + ' moved from ' + was + ' to ' + now + '; it binds from where it was written (D4, D41)');
      }
      if (old.hasBaseline) {
        const since = ledger.rulings.filter(r => !old.byId.has(r.id));
        // the pair as a word of its own: no path character before it, no digit after — `app.js=40` and `myapp.js=4` carry no `app.js=4`
        const recorded = pair => { const re = new RegExp('(?:^|[\\s(\\[{,;:`\'"])' + escapeRe(pair) + '(?![0-9])'); return since.some(r => re.test(r.heading) || r.bodyLines.some(l => re.test(l))); };
        if (!ledger.hasBaseline) fail(lp, 1, 7, 'the bare-cites comment is gone, and every allowance with it; an allowance may fall, and rises only on the record (FORMAT.md 9, D41)');
        else for (const f of Object.keys(ledger.baseline)) {
          const was = Object.prototype.hasOwnProperty.call(old.baseline, f) ? old.baseline[f] : 0, now = ledger.baseline[f];
          if (now > was && !recorded(baselinePair(f, now))) fail(lp, ledger.baselineLine, 7, 'bare-cites allowance for ' + f + ' rose from ' + was + ' to ' + now + ' with no entry recording it: an entry written since carries ' + baselinePair(f, now) + ' (FORMAT.md 9, D41)');
        }
      }
    }
  }
  // A ledger the compared revision has and the working tree lacks is the most complete amendment there is (D4).
  const groot = gitRoot(root);
  if (groot) {
    const base = baseRevision().base;
    const rev = base && sh('git', ['rev-parse', '--verify', '-q', base + '^{commit}'], groot).status === 0 ? base : 'HEAD';
    const ls = sh('git', ['ls-tree', '-r', '--name-only', '-z', rev], groot);   // -z: a name as it is, not quoted
    if (ls.status === 0) for (const p of ls.stdout.split('\0')) {
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
// or unreadable, the rule is HEAD's, or HEAD's parent's when the tree already equals HEAD; a revision the repository does
// not hold — a force-push leaves the commit before it behind — is said in an info line, since the comparison it asked for
// was not made. A revision it holds whose tree has no file of the ledger skips the check, and says so: nothing from
// before the push is there to compare, and the tip's parent, inside the push, is not the comparison asked for.
// Read as { base, refused }: the revision to compare with, or null; and, for a value that is set and names none, why —
// which check 7's info line says, since the comparison it asked for was not made (FORMAT.md 13). All zeros is a CI's word
// for no commit before a branch's first push; a revision holds no space, no control character and no colon — the core
// reads <base>:<path> — and opens with no "-"; anything else is git's to resolve, a long branch name and a reflog's @{…}
// among it, and one git does not hold is said as such.
function baseRevision() {
  const b = process.env.DOCKET_BASE;
  if (b === undefined || b === '') return { base: null, refused: null };
  if (/^0+$/.test(b)) return { base: null, refused: 'DOCKET_BASE is all zeros, a CI\'s word for no commit before a branch\'s first push' };
  if (/[\s:\u0000-\u001f\u007f]/.test(b) || b.startsWith('-')) return { base: null, refused: 'DOCKET_BASE is ' + JSON.stringify(b) + ', which is no revision: a revision holds no space, no control character and no colon, and opens with no "-"' };
  return { base: b, refused: null };
}
function namesHead(rev, groot) {
  const a = sh('git', ['rev-parse', '--verify', '--quiet', rev + '^{commit}'], groot), h = sh('git', ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], groot);
  return a.status === 0 && h.status === 0 && a.stdout.trim() === h.stdout.trim();
}
function committedText(root, filePath, workingText, note) {
  const groot = gitRoot(path.dirname(filePath)) || root;               // git resolves <rev>:<path> from the repository root, whatever the enumeration root is
  const p = rel(groot, filePath);
  const { base, refused } = baseRevision();
  let why = refused, self = false;                                     // why a named base was not the one compared with: said beside what was
  // a base that names HEAD itself would compare a clean commit with itself and witness nothing: read as unset, so the parent rule
  // below applies, and said when that rule compares with the parent
  if (base && namesHead(base, groot)) { self = true; why = 'DOCKET_BASE names HEAD itself, and a clean commit compared with itself witnesses nothing'; }
  else if (base) {
    const b = sh('git', ['show', base + ':' + p], groot); if (b.status === 0) return b.stdout;
    if (sh('git', ['rev-parse', '--verify', '--quiet', base + '^{commit}'], groot).status !== 0) why = 'DOCKET_BASE names ' + base + ', which this repository does not hold';
    else { if (note) note('skipped — DOCKET_BASE names ' + base + ', which has no such file, so no version from before the push is there to compare', true); return null; }   // FORMAT.md 13
  }
  const said = what => { if (why && note && !(self && what === 'HEAD')) note('compared with ' + what + ': ' + why); };
  const none = what => { if (why && note && !self) note('skipped — ' + why + ', and ' + what + ' has no such file, so no earlier version is there to compare', true); return null; };
  const head = sh('git', ['show', 'HEAD:' + p], groot);
  if (head.status !== 0) return none('HEAD');
  let working = workingText;                                           // the caller's own reading: one run holds one version of a ledger, the comparison included
  if (working === undefined) { try { working = readText(filePath); } catch (e) { said('HEAD'); return head.stdout; } }
  if (normEol(working) !== normEol(head.stdout)) { said('HEAD'); return head.stdout; }   // FORMAT.md 1: both sides normalised
  const parent = sh('git', ['show', 'HEAD~1:' + p], groot);
  if (parent.status !== 0) return none('HEAD\'s parent');
  said('HEAD\'s parent'); return parent.stdout;
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
// An N:1 value (FORMAT.md 13): the 1 ends it — no digit, and no decimal point with a digit, after it — so 4.5:10 is not one
const CONTRAST_RE = /(\d+(?:\.\d+)?):1(?!\d|\.\d)/;
const CONTRAST_RE_ALL = /(\d+(?:\.\d+)?):1(?!\d|\.\d)/g;
function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// A colour, not its spelling (FORMAT.md 13): shorthand expanded, lower case, an opaque alpha dropped — #fff, #FFFFFF and
// #ffffffff are one value, and a token row matches the declaration that says its colour however either writes it
function colourOf(hex) { let h = hex.replace('#', '').toLowerCase(); if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join(''); return '#' + (h.length === 8 && h.endsWith('ff') ? h.slice(0, 6) : h); }
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
    for (const e of cssFiles) splitLines(fileText(e).replace(/\/\*[\s\S]*?(?:\*\/|$)/g, m => m.replace(/[^\n]/g, ' '))).forEach((l, i) => {   // a comment is not a declaration, and one never closed runs to the end of the file, as CSS reads it; blanked, so line numbers hold
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
      else if (!d.some(x => colourOf(x.value) === colourOf(hex))) failures.push({ file: rel(root, docs.uiux), line: i + 1, k: 'a', message: token + ' is ' + hex + ' in the spec but ' + d.map(x => x.value + ' at ' + rel(root, x.file) + ':' + x.line).join(', ') });
      else for (const x of d) if (colourOf(x.value) !== colourOf(hex)) info.push(rel(root, docs.uiux) + ':' + (i + 1) + ': ' + token + ' is ' + hex + ' in the spec and one declaration matches; ' + x.value + ' at ' + rel(root, x.file) + ':' + x.line + ' is a second value (a theme, or a stray)');
    });
    const valueOf = t => specValue.get(t) || (decls.get(t) ? decls.get(t)[0].value : null);
    specLines.forEach((l, i) => {
      if (!/^\|/.test(l)) return;
      const toksAll = uniq(Array.from(l.matchAll(/`(--[A-Za-z0-9_-]+)`/g)).map(m => m[1]));
      const cm = CONTRAST_RE.exec(l);
      if (!cm) {
        // two tokens and no ratio the grammar reads: the row means to assert one and does not.
        if (toksAll.length === 2 && /\d\s*(?::\s*\d|to\s+1\b)/.test(l)) { rows++; failures.push({ file: rel(root, docs.uiux), line: i + 1, k: 'b', message: toksAll.join(' on ') + ': the ratio is not written as <n>:1, so no ratio is read from this row' }); }
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
  if (ledger.text.charCodeAt(0) === 0xFEFF && text.charCodeAt(0) !== 0xFEFF) text = '\uFEFF' + text;   // the mark it was saved with stays (FORMAT.md 1)
  let target = ledger.path, mode = null;                              // a ledger that is a link is written where it points, and keeps its mode
  try { target = fs.realpathSync(ledger.path); } catch (e) { target = ledger.path; }
  try { mode = fs.statSync(target).mode & 0o7777; } catch (e) { mode = null; }
  const tmp = target + '.docket-' + process.pid;
  fs.writeFileSync(tmp, text);
  if (mode !== null) fs.chmodSync(tmp, mode);
  fs.renameSync(tmp, target);
}
// A ledger that two sessions can append to at once is a ledger that can lose an entry: each would read the same last
// id, compute the same next one, and the later write would carry the earlier one away while both callers were told the
// entry was written. So a write command takes an exclusive lock beside the ledger and re-reads it inside the lock: the
// id it computes is the id it writes (D4 — append, never amend; a record that can be rewritten proves nothing).
const LOCK_WAIT_MS = 5000;
const SESSION_START_WAIT_MS = 1000;   // D14's addendum: a fifth of the session-start hook's five seconds; the rest are the docket's to print in
// One lock rule for the ledger and the state: an exclusive file beside the one it guards, naming its holder, so a release
// frees its own lock and no other, and a lock whose holder is gone — a run that was killed — is taken over. It waits up to
// `ms`, and answers null when the lock is still held then.
function takeLock(lockPath, ms) {
  const mine = 'docket ' + process.pid + '\n';
  let waited = 0;
  for (;;) {
    try { const fd = fs.openSync(lockPath, 'wx'); fs.writeSync(fd, mine); return { fd, mine }; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let holder = 0; try { holder = Number((/^docket (\d+)$/m.exec(fs.readFileSync(lockPath, 'utf8')) || [])[1]); } catch (e2) { /* released between the two calls: try again */ }
      let alive = true; if (holder) { try { process.kill(holder, 0); } catch (e2) { alive = e2.code === 'EPERM'; } }
      if (holder && !alive) { try { fs.unlinkSync(lockPath); } catch (e2) { /* another took it over first */ } continue; }
      if (waited >= ms) return null;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25); waited += 25;   // a plain sleep, no dependency
    }
  }
}
function releaseLock(lockPath, lock) {
  if (!lock) return;
  try { fs.closeSync(lock.fd); } catch (e) { /* closed already */ }
  try { if (fs.readFileSync(lockPath, 'utf8') === lock.mine) fs.unlinkSync(lockPath); } catch (e) { /* gone already */ }
}
function lockedLedger(argv) {
  const scoped = ledgerFromCwd(argv);
  const lockPath = scoped.ledger.path + '.lock';
  const lock = takeLock(lockPath, LOCK_WAIT_MS);
  if (!lock) die('append: ' + rel(scoped.root, scoped.ledger.path) + ' is held by another append that has not finished; if none is running, remove ' + rel(scoped.root, lockPath), 2);
  // Released once, and only while it is still ours: a second release at exit, after another append has
  // taken the lock, would unlink that one's and let two writers read the same last id.
  let released = false;
  const release = () => { if (released) return; released = true; releaseLock(lockPath, lock); };
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
  entryArgs(argv);                                                     // usage first, outside the lock
  const { root, ledger, release } = lockedLedger(argv);
  const entry = buildEntry(argv, root, ledger);
  const text = (ledger.text.trim() ? ensureNl(ledger.text) + '\n' : '') + entry;   // an empty ledger opens with its entry, not with blank lines
  writeLedger(ledger, text);
  release();
  return afterWrite(argv, root, ledger, entry);
}
// Everything append refuses, it refuses here, before any write; constitute builds its first entry through
// this same function so a constitution cannot carry what a ruling could not.
// The refusals that read the arguments alone: append makes them before it takes the ledger's lock, so a malformed call
// never waits on the lock, or holds it, while another append needs it; buildEntry makes them again, for constitute
function entryArgs(argv) {
  const title = flag(argv, '--title'), issue = flag(argv, '--issue'), principle = flag(argv, '--principle'), body = flag(argv, '--body');
  const edges = flags(argv, '--edge');
  if (!title || !title.trim()) die('append: --title is required (one line, the ruling in a phrase)', 2);
  if (/[\r\n\u2028\u2029]/.test(title)) die('append: --title is one line — a line break would open a second heading (FORMAT.md 2, 3)', 2);
  if (!stripMarks(title.trim()).trim()) die('append: --title renders empty — marks alone are no title; give the ruling in words (FORMAT.md 3)', 2);
  if (metaStart(title) >= 0) die('append: --title may not contain " (" outside a code span — the title rule would cut it there; put the parenthetical in the body', 2);   // the same reader as the title rule
  if (!issue || !issue.trim()) die('append: --issue is required (an issue number, or a phrase naming the context the ruling answers)', 2);
  if (/[\r\n\u2028\u2029]/.test(issue)) die('append: --issue is one line — the meta sits on the heading line (FORMAT.md 4)', 2);
  if (/[;()]/.test(issue)) die('append: --issue may not contain ";", "(" or ")" — the meta is one parenthetical whose clauses are split on ";" (FORMAT.md 4)', 2);
  if (isEdgeClause(issue.trim())) die('append: --issue "' + issue.trim() + '" reads as an edge; the meta opens with a grounding — an issue number or the context the ruling answers — and an edge goes in --edge (FORMAT.md 4, 11)', 2);
  if (!principle || !principle.trim()) die('append: --principle is required (one of `docket principles`)', 2);
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
  return { title, issue, principle, body, edges };
}
function buildEntry(argv, root, ledger) {
  const { title, issue, principle, body, edges } = entryArgs(argv);
  const prin = principlesOf(ledger);
  if (!prin.list.length) die('append: no principles list found (the first section of PRD.md, or a "Principles" list in the ledger preamble)', 2);
  const pr = principleNamed(prin.list, principle);
  if (!pr) die('append: principle "' + principle + '" is not one of: ' + prin.list.map(p => p.name).join(' · '), 2);
  let prefix = flag(argv, '--prefix');
  if (!prefix) prefix = ledger.rulings.length ? ledger.rulings[ledger.rulings.length - 1].prefix : null;
  if (!prefix) die('append: --prefix is required for an empty ledger', 2);
  if (!/^[A-Za-z]+$/.test(prefix)) die('append: --prefix must be letters', 2);
  const n = ledger.rulings.filter(r => r.prefix === prefix).reduce((m, r) => Math.max(m, r.n), 0) + 1;
  if (String(n).length > NUMERAL_MAX_DIGITS) die('append: the ' + prefix + ' entries end at ' + (n - 1) + ', the largest number the grammar allows (' + NUMERAL_MAX_DIGITS + ' digits); a further ruling needs a new prefix — pass --prefix (FORMAT.md 2, 12)', 2);
  const selfId = prefix + n;                                           // the id this entry will receive
  const parsedEdges = [], edgeKeys = new Set();
  for (const e of edges) {
    if (/[\r\n\u2028\u2029]/.test(e)) die('append: --edge "' + e.replace(/[\r\n]+/g, ' ') + '" is one line — the meta sits on the heading line (FORMAT.md 4)', 2);
    const p = parseEdgeArg(e);
    if (!p) die('append: --edge "' + e + '" is not "<verb> <id>" with a verb from: ' + VERBS.join(', '), 2);
    if (/;/.test(p.qualifier)) die('append: --edge "' + e + '": a qualifier may not contain ";" — the meta\'s clauses are split on it (FORMAT.md 4)', 2);
    p.tos = p.tos.map(to => {                                           // the target is read whatever its case, as governs reads one
      const res = resolveRuling(ledger, to);
      if (res.ambiguous) die('append: --edge "' + e + '" names ' + to + '; ' + res.ambiguous.join(' and ') + ' differ only in case — name one exactly', 2);
      if (!res.r && to.toLowerCase() === selfId.toLowerCase()) die('append: --edge "' + e + '" names ' + selfId + ', the id this entry will receive — an edge from ' + selfId + ' to itself; a ruling may not name itself (FORMAT.md 5)', 2);
      if (!res.r) die('append: --edge "' + e + '" names ' + to + ', which is not in ' + rel(root, ledger.path), 2);
      return res.r.id;
    });
    const k = [p.adverb, p.verb, p.tos.join('/'), p.qualifier].join('|');
    if (edgeKeys.has(k)) continue;                                      // the same edge given twice is one edge
    edgeKeys.add(k); parsedEdges.push(p);
  }
  // The ledger is append only: an entry whose text names a ruling that does not exist is refused before it is written,
  // not failed by check 1 after (FORMAT.md 8). The entry's own id may appear in its body.
  const probe = parseLedger(ledger.text + '\n### ' + prefix + n + '. x\n', ledger.path);
  for (const c of citesIn(title + '\n' + body, probe)) if (!c.exists) die('append: the entry names ' + c.id + ', which is not in ' + rel(root, ledger.path), 2);
  for (const li of splitLines(body)) for (const ed of edgesIn(li, selfId, 0, false)) {
    if (ed.to === selfId) die('append: --body says "' + ed.clause.trim() + '", which is an edge from ' + selfId + ' to itself; a ruling may not name itself (FORMAT.md 5), and once written the ledger could never stop failing check 5', 2);
    if (!probe.byId.has(ed.to)) die('append: --body says "' + ed.clause.trim() + '", naming ' + ed.to + ', which is not in ' + rel(root, ledger.path), 2);
  }
  const grounding = /^#?\d+$/.test(issue.trim()) ? 'issue #' + issue.trim().replace('#', '') : issue.trim();
  const metaParts = [grounding].concat(parsedEdges.map(e => (e.adverb ? e.adverb + ' ' : '') + e.verb + ' ' + e.tos.join('/') + (e.qualifier ? ' (' + e.qualifier + ')' : '')));   // one clause, the targets joined as the grammar reads them (5)
  const entry = '### ' + prefix + n + '. ' + title.trim() + ' (' + metaParts.join('; ') + ')\n' + 'Principle: ' + pr.name + '.\n' + body.trim() + '\n';
  refuseFailing(root, ledger, selfId, entry);
  return entry;
}
// FORMAT.md 11: an entry append writes satisfies the header contract and adds no failure to check — the ledger is append only, so
// what check would fail is refused before the write, read as check reads it, on the ledger as it would stand: the title, the
// grounding and every edge's qualifier are the entry's text as much as its body is.
function refuseFailing(root, ledger, selfId, entry) {
  const before = ledger.text, after = (before.trim() ? ensureNl(before) + '\n' : '') + entry;
  const parsed = parseLedger(after, ledger.path), r = parsed.byId.get(selfId), why = [];
  if (!r) why.push('the entry would not read as ' + selfId + ' (FORMAT.md 2)');
  else {
    const { meta, end } = metaOf(r.heading);
    if (!meta || end !== r.heading.length - 1) why.push('the heading would not end with its parenthetical meta — a code span or a parenthesis in --title or --issue runs into it (FORMAT.md 4, 11)');
    else { const cl = clausesOf(meta); if (!cl.length || isEdgeClause(cl[0])) why.push('the meta would open with an edge, not a grounding (FORMAT.md 11)'); for (const c of cl.slice(1)) if (!isEdgeClause(c)) why.push('a meta clause would not be an edge: "' + c + '" (FORMAT.md 11)'); }
  }
  const run = (text, led) => runCheck(root, { ctx: { root, ledgers: new Map([[ledger.path, led]]), files: [{ path: ledger.path, ledger: ledger.path, rel: rel(root, ledger.path), text }], vendored: [] } }).failures;
  const key = f => f.k + '|' + f.line + '|' + f.message, had = new Set(run(before, ledger).map(key));
  for (const f of run(after, parsed)) if (f.k !== 7 && !had.has(key(f))) why.push('check ' + f.k + ', line ' + f.line + ': ' + f.message);
  if (why.length) die('append: the entry would fail as written, and the ledger is append only, so nothing is written (FORMAT.md 11):\n  ' + uniq(why).join('\n  '), 2);
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
  const id = flag(argv, '--addendum'), text = flag(argv, '--text');
  if (!text || !text.trim()) die('append: --text is required (why the entry\'s reason no longer holds, or what changed)', 2);   // usage first, outside the lock
  const { root, ledger, release } = lockedLedger(argv);
  const res = resolveRuling(ledger, id || '');                        // an id is read as governs and --edge read it (FORMAT.md 12)
  if (res.ambiguous) die('append: --addendum ' + id + ' names ' + res.ambiguous.join(' and ') + ', which differ only in case — name one exactly', 2);
  const r = res.r;
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
    const p = rel(ledger.home, e.path);
    if (n > 0) counts.push(baselinePair(p, n));
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
// Each of append's three modes takes its own options, and refuses another's: an option accepted and dropped would let a reader
// believe it had an effect (FORMAT.md 11).
const ENTRY_OPTS = ['--title', '--issue', '--principle', '--body', '--edge', '--prefix'];
function append(argv) {
  const mode = has(argv, '--addendum') ? '--addendum' : has(argv, '--baseline') ? '--baseline' : null;
  const foreign = mode === '--addendum' ? ENTRY_OPTS.concat(['--baseline']) : mode === '--baseline' ? ENTRY_OPTS.concat(['--text']) : ['--text'];
  const extra = foreign.filter(o => has(argv, o));
  if (extra.length) die('append: ' + (mode ? mode + ' does not take ' : 'an entry does not take ') + extra.join(', ') + ' — the option would be dropped, and a dropped option reads as one that worked (FORMAT.md 11)', 2);
  if (mode === '--addendum') return appendAddendum(argv);
  if (mode === '--baseline') return rewriteBaseline(argv);
  return appendEntry(argv);
}

// ─── 10. status: the docket ─────────────────────────────────────────────────

function statePath(root) { return path.join(root, '.docket', 'verdict.json'); }
// .docket/ is the docket's own and never the project's: it is made with a .gitignore of "*" inside it, so git ignores it
// whatever the project's own .gitignore says, and an `add -A` never tracks a verdict or the core's path (FORMAT.md 16)
function docketDir(root) {
  const d = path.join(root, '.docket');
  fs.mkdirSync(d, { recursive: true });
  const gi = path.join(d, '.gitignore');
  if (!exists(gi)) { try { fs.writeFileSync(gi, '*\n'); } catch (e) { /* the state is written without it */ } }
  return d;
}
function loadState(root) {
  let st = null;
  try { st = JSON.parse(readText(statePath(root))); } catch (e) { st = null; }
  if (!st || typeof st !== 'object' || Array.isArray(st)) st = {};
  // Every field is filled here so that a file written by hand, or half-written, informs rather than throws (D1).
  // A session id is the host's text, or a person's: a map with no prototype, where a session named __proto__ or
  // constructor is stored and read like any other and not the prototype of the map (D11).
  // Each session is read field by field: a count that is not a whole number, a history that is not a list of them, a mark
  // that is not true — hand-edited or half-written — holds nothing and is read as nothing (FORMAT.md 16).
  const sessions = Object.create(null);
  if (st.sessions && typeof st.sessions === 'object' && !Array.isArray(st.sessions)) for (const k of Object.keys(st.sessions)) {
    const s = st.sessions[k];
    if (!s || typeof s !== 'object' || Array.isArray(s)) continue;
    sessions[k] = Object.assign({ blocks: Number.isInteger(s.blocks) && s.blocks >= 0 ? s.blocks : 0, history: Array.isArray(s.history) ? s.history.filter(n => Number.isInteger(n) && n >= 0) : [], surfaced: s.surfaced === true },
      typeof s.base === 'string' && /^[0-9a-f]{40,64}$/.test(s.base) ? { base: s.base } : {});   // the commit its diff runs from (D40)
  }
  const last = st.last && typeof st.last === 'object' && !Array.isArray(st.last) ? st.last : null;
  return { last, lastPassHash: typeof st.lastPassHash === 'string' ? st.lastPassHash : null, sessions };
}
function saveState(root, st) { const p = statePath(root); docketDir(root); const tmp = p + '.' + process.pid; fs.writeFileSync(tmp, JSON.stringify(st, null, 2) + '\n'); fs.renameSync(tmp, p); }
// The state is one file the gate, the verdict and the stop each read, change and write: two judges recording at once would
// each read the same state, and the later write would carry the earlier away — a session's count, a surfaced mark, the last
// PASS (D11). So each change is made under a lock beside the file, the state re-read inside it and written whole, as the
// ledger's append is (D4), by the one lock rule both keep (takeLock). One held past the wait is written through, with a
// note, because a stop that died on it would be allowed unjudged; the call at a session's start waits a second and records
// nothing past it (`orSkip`), since its hook's five seconds are the docket's to print in (D14's addendum).
function withState(root, change, opts) {
  const p = statePath(root), lockPath = p + '.lock', wait = opts && opts.wait !== undefined ? opts.wait : LOCK_WAIT_MS;
  if (exists(path.dirname(p)) && !isDir(path.dirname(p))) throw Object.assign(new Error(rel(root, path.dirname(p)) + ' is a file, not a directory: the state has nowhere to go; move it aside'), { docket: true });
  docketDir(root);
  const lock = takeLock(lockPath, wait);
  if (!lock) {
    if (opts && opts.orSkip) return null;
    process.stderr.write('note: ' + rel(root, lockPath) + ' was held past ' + wait / 1000 + ' seconds; the state is changed without it\n');
  }
  try { const st = loadState(root); change(st); saveState(root, st); return st; }
  finally { releaseLock(lockPath, lock); }
}
// An addendum is pending until a ruling written after it has an edge into its entry (FORMAT.md 6, D21). Which came
// first is read from history: the edge's line was added in a commit that descends from the one that added the
// addendum's line, or in that same commit (the preamble's order: the addendum, then the ruling), or it is not committed
// yet. An in-edge older than the addendum answered something else: supersession is clause-level (D3), and a ruling that
// once named an entry has not moved the law past the clause a later addendum is about. With no history to read — no
// repository, or a ledger never committed — a later entry's edge resolves it, as before.
function blameCommits(ledgerPath) {
  // -w: a commit that changes only a line's whitespace or ending — CRLF, a renormalisation — wrote no line, so each keeps the
  // commit that wrote its words, and an addendum is not answered by the commit that re-ended it (FORMAT.md 6, D21)
  const r = sh('git', ['blame', '-w', '--porcelain', '--', path.basename(ledgerPath)], path.dirname(ledgerPath));
  if (r.status !== 0) return null;
  const m = new Map();
  for (const line of r.stdout.split('\n')) { const h = /^([0-9a-f]{40}(?:[0-9a-f]{24})?) \d+ (\d+)(?: \d+)?$/.exec(line); if (h) m.set(Number(h[2]), h[1]); }   // SHA-1 or SHA-256 names
  return m;
}
function pendingAddenda(ledger) {
  const pend = [], anc = new Map();
  let blame;                                                          // read once, and only for a ledger that carries an addendum
  const writtenAfter = (edgeLine, addLine) => {
    if (blame === undefined) blame = blameCommits(ledger.path);
    if (!blame) return true;
    const a = blame.get(addLine), e = blame.get(edgeLine), zero = /^0+$/;
    if (!a || !e || zero.test(e) || a === e) return true;             // unknown, not committed yet, or one commit
    if (zero.test(a)) return false;                                   // the addendum is not committed and the edge is: the edge came first
    // the commits after the addendum's, asked once for each addendum's commit and not once per pair: the edge's commit is one
    // of them when the addendum's is its ancestor (blame names only ancestors of HEAD, or none)
    if (!anc.has(a)) { const d = sh('git', ['rev-list', '--ancestry-path', a + '..HEAD'], path.dirname(ledger.path)); anc.set(a, d.status === 0 ? new Set(d.stdout.split('\n').filter(Boolean)) : null); }
    const after = anc.get(a);
    return after === null ? sh('git', ['merge-base', '--is-ancestor', a, e], path.dirname(ledger.path)).status === 0 : after.has(e);
  };
  for (const r of ledger.rulings) {
    for (const a of r.addenda) {
      const resolved = ledger.rulings.some(o => o.line > r.line && o.edges.some(e => e.to === r.id && writtenAfter(e.line, a.line)));
      if (!resolved) pend.push({ id: r.id, date: a.date, text: a.text });
    }
  }
  return pend;
}
// The session-start call's input on stdin (D40): the session's identifier, why it starts, and the project directory. A session
// that starts afresh — a new one, or one cleared — records HEAD as the base its diff runs from; one resumed or compacted
// keeps the base it has, and takes HEAD only when it has none. It prints nothing: the docket is the hook's output.
function recordSessionBase() {
  let input = {};
  try { input = JSON.parse(readStdin()) || {}; } catch (e) { input = {}; }
  if (typeof input !== 'object' || Array.isArray(input) || typeof input.session_id !== 'string' || !input.session_id) return;
  const root = stopRoot(typeof input.cwd === 'string' && isDir(input.cwd) ? input.cwd : process.cwd());   // the stop's root (D28)
  const head = headCommit(root);
  if (!head) return;
  const afresh = input.source === 'startup' || input.source === 'clear', sid = sessionKey(input.session_id);
  // a lock held past a second is another session's write: this one records no base, and its diff reads from HEAD (D40)
  try { withState(root, st => { const x = Object.assign(freshSession(), st.sessions[sid] || {}); if (afresh || !x.base) x.base = head; st.sessions[sid] = x; }, { wait: SESSION_START_WAIT_MS, orSkip: true }); } catch (e) { /* the docket prints without it */ }
}
function status(argv) {
  const s = scope(argv), cwd = s.cwd, root = s.root, lp = s.ledger;
  const below = lp ? [] : ledgersBelow(cwd, root);                    // a walk goes up: a ledger below is named, not found
  if (lp || below.length) recordCore(root);                            // the judge finds the core through this file (16): the tree is governed somewhere
  if (has(argv, '--session-start') && (lp || below.length)) recordSessionBase();   // the call at a session's start: the session's base (D40)
  if (!lp) {                                                          // no ledger governs the working directory
    const groot = gitRoot(cwd);
    const ls = groot ? sh('git', ['ls-tree', '-r', '--name-only', '-z', 'HEAD'], groot) : null;
    const gone = ls && ls.status === 0 ? ls.stdout.split('\0').filter(p => /(^|\/)DECISIONS\.md$/.test(p) && !isFile(path.join(groot, p))) : [];
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
  const st = loadState(stopRoot(cwd));                                 // the verdict the stop's commands keep (D28)
  const surfaced = !!(st.last && st.sessions[st.last.session] && st.sessions[st.last.session].surfaced);   // D11: the surfaced state is the one the docket exists to show; a verdict naming a session the file never recorded is not surfaced
  // `last` names one session; every surfaced session waits for the human, and the protocol's release says status names it (D11)
  const surfacedAll = Object.keys(st.sessions).filter(k => st.sessions[k] && st.sessions[k].surfaced).sort();
  const surfacedOthers = surfacedAll.filter(k => !(st.last && k === st.last.session));
  const check_ = runCheck(root, { ctx });
  const spec_ = runSpecCheck(root, ctx, lp);
  const witness = { ok: check_.failures.length === 0 && spec_.failures.length === 0, ledgers: check_.ctx.ledgers.size, failures: check_.failures.concat(spec_.failures) };
  if (argv.json) {
    out(JSON.stringify({ ledger: rel(root, lp), rulings: ledger.rulings.length, prefixes: ledger.prefixes, last: ledger.rulings.slice(-3).reverse().map(r => ({ id: r.id, title: r.title })), uncited, pendingAddenda: pend, lastVerdict: st.last, surfaced, surfacedSessions: surfacedAll, witness }, null, 2));
    return 0;
  }
  const L = [];
  L.push('Docket — ' + rel(root, lp) + ' (' + ledger.rulings.length + ' ruling' + (ledger.rulings.length === 1 ? '' : 's') + (ledger.prefixes.length ? '; prefix' + (ledger.prefixes.length === 1 ? ' ' : 'es ') + ledger.prefixes.join(', ') : '; no prefix') + ')');
  L.push('Last rulings:');
  for (const r of ledger.rulings.slice(-3).reverse()) L.push('  ' + r.id + '  ' + r.title + (r.issue !== null ? '  · issue #' + r.issue : ''));
  L.push('Cited nowhere: ' + (uncited.length ? uncited.join(', ') + ' (' + uncited.length + ' of ' + ledger.rulings.length + ')' : 'none'));
  L.push('Addenda pending: ' + (pend.length ? '' : 'none'));
  for (const a of pend) {                                              // D14: one line each, cut at a glance; governs <id> prints the whole, and --json carries it
    L.push('  ' + a.id + ' (' + a.date + '): ' + glance(a.text));
  }
  L.push('Last verdict: ' + (st.last ? st.last.verdict + ' at ' + st.last.at + ' (' + st.last.failures + ' located failure' + (st.last.failures === 1 ? '' : 's') + ')' + (surfaced ? '; session ' + st.last.session + ' is SURFACED — its residue waits for the human' : '') : 'none'));
  // the last judge's own report — what it scored, and a check it could not run — kept for the person to read (D46)
  const jlog = path.join(stopRoot(cwd), '.docket', 'judge.log');
  if (isFile(jlog)) L.push('Judge\'s report: ' + rel(root, jlog) + ' — the last judge\'s own words, a check it could not run named there');
  if (surfacedOthers.length) L.push('Surfaced: ' + surfacedOthers.map(k => { const x = st.sessions[k]; return k + ' (' + x.blocks + ' block' + (x.blocks === 1 ? '' : 's') + ' since its last PASS; located failures per verdict: ' + (x.history && x.history.length ? x.history.join(' → ') : 'none recorded') + ')'; }).join(', ') + ' — each waits for the human, who releases it with a PASS naming it');
  // a check 7 the run skipped is said beside an ok, as check's info line says it, so a skip is never read as a pass (FORMAT.md 13)
  const skipped7 = check_.info.filter(i => /: check 7 skipped/.test(i)).length;
  L.push('Witness: ' + (witness.ok ? 'ok (' + witness.ledgers + ' ledger' + (witness.ledgers === 1 ? '' : 's') + (skipped7 ? '; check 7 skipped for ' + skipped7 + ' — docket check says why' : '') + ')' : 'FAIL (' + witness.failures.length + ')'));
  for (const f of witness.failures.slice(0, 5)) L.push('  ' + f.file + ':' + f.line + '  ' + (typeof f.k === 'number' ? 'check ' : 'spec-check ') + f.k + ': ' + f.message);
  if (witness.failures.length > 5) L.push('  +' + (witness.failures.length - 5) + ' more — docket check lists them all');   // D14's addendum: five, then the pointer
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
    const had = new Map();                                             // counted, not a set: one that repeats an earlier one, date and words, is added too
    for (const x of o.addenda) { const k = x.date + '|' + x.text; had.set(k, (had.get(k) || 0) + 1); }
    for (const x of cur.addenda) { const k = x.date + '|' + x.text, n = had.get(k) || 0; if (n > 0) had.set(k, n - 1); else addenda.push({ id: o.id, date: x.date, text: x.text, line: x.line }); }
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
  '        env:',
  '          DOCKET_BASE: ${{ github.event.pull_request.base.sha || github.event.before }}   # the commit before the push, or a pull request\'s base: the seventh check compares a pushed range with it',
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
// cooks"); when it opens with a word that can only open a crowd, whatever follows ("everyone at the company"); and when
// its last word is a crowd's plural, whatever qualifies it ("non-technical users", "busy people"). A role that holds a
// crowd's word in front of a person's noun — "a people manager", "users researcher", "the public defender", "a
// non-technical founder" — names a person and is not this shape check's to refuse; the semantic line is the intake's (D13).
const CROWD_OPENERS = ['everyone', 'anyone', 'all users', 'someone curious', 'general audience'], CROWD_PLURALS = ['users', 'people'];
function invalidRole(role) {
  const strip = t => t.replace(/^(a|an|the)\s+/, '');
  const raw = role.toLowerCase().replace(/[.]+$/, '').trim(), forms = [raw, strip(raw)];
  const words = raw.split(/[\s,]+/).filter(Boolean), last = words[words.length - 1];
  for (const bad of INVALID_ROLES) {
    for (const b of [bad, strip(bad)]) for (const f of forms) {
      if (f === b || f.startsWith(b + ',')) return bad;
      if (f.startsWith(b + ' ') && /^(who|that|which|whom|whose)\b/.test(f.slice(b.length + 1))) return bad;
      if (CROWD_OPENERS.includes(bad) && f.startsWith(b + ' ')) return bad;
    }
    if (CROWD_PLURALS.includes(bad) && last === bad) return bad;
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
  // a ledger at the directory itself is the one discovery tries first there (FORMAT.md 1): docs/DECISIONS.md written beside
  // it would govern nothing, and the check that follows would pass over a constitution no file reads
  if (isFile(path.join(dir, 'DECISIONS.md'))) die('constitute: DECISIONS.md already exists here, and it is the ledger discovery finds before docs/DECISIONS.md (FORMAT.md 1): a constitution written under docs/ would govern nothing; the ledger is append only (D4), so what comes after is docket append, not a second constitution', 2);
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
    'reads nothing and says so. Add `.docket/` to .gitignore: the judge keeps its verdicts there.',
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
  const text = readText(p);
  if (argv.json) { out(JSON.stringify({ intake: which, file: 'intake/' + which.toUpperCase() + '.md', text }, null, 2)); return 0; }
  out(text);
  return 0;
}

// ─── 16. gate and verdict: the mechanical gate, the verdict file (D10, D11) ──

// The judge is a subagent the host runs at a stop. The host gives it a shell and the project directory and nothing
// else: not where the plugin is, in its prompt or in its environment, and no reading outside the project. So the core,
// when it runs as the plugin's own hook — the binding passes the plugin root as DOCKET_PLUGIN_ROOT, taken from whatever
// the host calls it (D13), and this file is under it — leaves its own path in the project, at .docket/core, and the
// judge reads that (D20). Written only where a ledger governs (an ungoverned project gets no .docket/), and rewritten only
// when it changes. A maker can overwrite it: that is a visible Write in its transcript, the boundary the protocol gives
// a forged verdict.
function recordCore(root) {
  const pr = process.env.DOCKET_PLUGIN_ROOT;
  if (!pr) return;
  const me = path.resolve(__filename);
  if (!me.startsWith(path.resolve(pr) + path.sep)) return;
  const p = path.join(root, '.docket', 'core');
  try {
    if (isFile(p) && readText(p) === me + '\n') return;
    docketDir(root); fs.writeFileSync(p, me + '\n');
  } catch (e) { /* a tree that cannot be written to: the judge says the file is missing */ }
}
// A session's identifier is text: a control character in it — a NUL in a hook's input among them — is kept as its escape,
// \u0000, so the state, the judge's environment, its prompt and the verdict name one session, and none of them throws
// (FORMAT.md 16)
function sessionKey(s) { return String(s).replace(/[\u0000-\u001f\u007f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')); }
function sessionId(argv) {
  const s = flag(argv, '--session');
  if (s) return sessionKey(s);
  if (process.env.DOCKET_SESSION) return sessionKey(process.env.DOCKET_SESSION);
  return 'default';
}
// The commit a session's diff runs from (D40): the base recorded at its start — moved to HEAD by a PASS recorded while
// nothing governed differs from HEAD — while that commit is an ancestor of HEAD; else HEAD. A maker that commits its work
// before it stops commits into the range the gate reads, so the stop still judges it; a base the history no longer holds,
// after a reset or a rebase, is dropped for HEAD.
function sessionBase(root, st, id) {
  const s = st.sessions[id], b = s && s.base;
  if (b && sh('git', ['merge-base', '--is-ancestor', b, 'HEAD'], root).status === 0) return b;
  return 'HEAD';
}
function headCommit(root) { const r = sh('git', ['rev-parse', '--verify', '-q', 'HEAD'], root); return r.status === 0 ? r.stdout.trim() : null; }
// Files the base governed that the working tree does not show as governed — deleted, stripped of their last cite, or under
// a ledger that is gone — a ledger the base held that is gone, and a spec document beside it that is gone. A diff that
// removes a governed file touches a governed file (D10), so each is in the diff (D22). Governed is read at the base: the
// file's text there cites a ruling that its ledger there holds.
function governedAt(root, have, base) {
  // --no-renames: a rename is the deletion it is, so the old path — governed at the base — is a candidate like any deleted file
  const ch = sh('git', ['diff', base, '--no-renames', '--relative', '--name-only', '-z'], root);
  if (ch.status !== 0) return [];
  const cand = ch.stdout.split('\0').filter(p => p && !have.has(p) && !p.split('/').includes('.docket'));
  if (!cand.length) return [];
  const ls = sh('git', ['ls-tree', '-r', '--name-only', '-z', base], root);
  const atBase = new Set(ls.status === 0 ? ls.stdout.split('\0').filter(Boolean) : []);
  const show = p => { const r = sh('git', ['show', base + ':./' + p], root); return r.status === 0 ? r.stdout : null; };
  const showBytes = p => { const r = cp.spawnSync('git', ['show', base + ':./' + p], { cwd: root, maxBuffer: 1 << 28 }); return r.status === 0 && r.stdout ? r.stdout : null; };   // the sniff is over bytes (FORMAT.md 1)
  const ledgers = new Map();
  const ledgerAt = p => {                                             // the nearest DECISIONS.md or docs/DECISIONS.md above p, at the base
    for (let dir = path.posix.dirname(p); ; dir = path.posix.dirname(dir)) {
      for (const c of dir === '.' ? ['DECISIONS.md', 'docs/DECISIONS.md'] : [dir + '/DECISIONS.md', dir + '/docs/DECISIONS.md']) {
        if (!atBase.has(c)) continue;
        if (!ledgers.has(c)) { const t = show(c); ledgers.set(c, t === null ? null : parseLedger(t, path.join(root, c))); }
        return ledgers.get(c);
      }
      if (dir === '.' || dir === '/') return null;
    }
  };
  const out = [];
  for (const p of cand) {
    if (!atBase.has(p)) continue;                                     // new since the base: the working tree's reading decides it
    const name = path.posix.basename(p), dir = path.posix.dirname(p);
    if (name === 'DECISIONS.md') { out.push(p); continue; }           // a ledger the base held
    if ((name === 'UIUX.md' || name === 'PRD.md') && atBase.has(dir === '.' ? 'DECISIONS.md' : dir + '/DECISIONS.md')) { out.push(p); continue; }   // a spec document beside it (D40)
    if (isLedgerDoc(p)) continue;                                      // a ledger document is never governed code, its name read in any case (FORMAT.md 8)
    const b = showBytes(p);
    if (b === null || b.subarray(0, SNIFF_BYTES).includes(0)) continue;   // binary at the base, as isTextFile reads the working tree
    const t = b.toString('utf8');
    const L = ledgerAt(p);
    if (L && citesIn(t, L).some(c => c.exists)) out.push(p);
  }
  return out;
}
// `git diff <base>` over the given paths, one run for each list of extra arguments, with every untracked path among them read
// as if added — intent to add, in a copy of the index, so the repository's own index is never touched: an untracked file's
// diff is then the one `git add` gives it, and the gate's hash is the same before the add and after it (D40).
function diffsFrom(root, base, rels, untracked, runs) {
  let env = process.env, tmp = null;
  // A copy that is not made, or an add that fails, leaves git an index with nothing in it, and every tracked file would read as
  // deleted: the diff would be another diff, and the stop would start a judge on it, so it is refused (FORMAT.md 16)
  const refuse = why => { if (tmp) { try { fs.rmSync(tmp, { force: true }); } catch (e) { /* never made */ } } throw Object.assign(new Error('the gate could not read the untracked governed files as added, in a copy of the index: ' + why + '; a diff read without them would be another diff, so none is judged (FORMAT.md 16)'), { refusal: true }); };
  // Where git reads no repository — none at all, or one it will not read — there is no index to copy, and the diff below
  // fails: governedDiff reads which of the two it is (FORMAT.md 16)
  const ip = untracked.length ? sh('git', ['rev-parse', '--git-path', 'index'], root) : null;
  if (ip && ip.status === 0) {
    tmp = path.join(os.tmpdir(), 'docket-index-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'));
    const src = path.resolve(root, ip.stdout.trim());
    if (isFile(src)) { try { fs.copyFileSync(src, tmp); } catch (e) { refuse('the copy could not be written at ' + tmp + ' (' + (e.code || e.message) + ')'); } }   // no index yet: git starts one
    env = Object.assign({}, process.env, { GIT_INDEX_FILE: tmp });
    const add = cp.spawnSync('git', ['add', '-N', '--'].concat(untracked), { cwd: root, env, encoding: 'utf8' });
    if (add.status !== 0) refuse('git add -N failed — ' + (String(add.stderr || (add.error && add.error.message) || '').trim().split('\n')[0] || 'exit ' + add.status));
  }
  try {
    return runs.map(extra => { const r = cp.spawnSync('git', ['diff', base, '--no-renames'].concat(extra, ['--'], rels), { cwd: root, env, encoding: 'utf8', maxBuffer: 1 << 28 }); return { status: r.status === null ? 1 : r.status, stdout: r.stdout || '', stderr: r.stderr || '' }; });
  } finally { if (tmp) { try { fs.rmSync(tmp, { force: true }); } catch (e) { /* the copy is the reading's own */ } } }
}
// The diff the judge reads and the gate hashes (D40): `git diff <base>` — the session's base, HEAD when it has none — over
// every governed file, every ledger and the spec documents beside it: those the working tree holds, and those the base
// governed that it no longer shows (D22), every untracked one among them read as if added. Empty when nothing governed moved.
function governedDiff(root, base) {
  base = base || 'HEAD';
  const ctx = loadContext(root, { includeUntracked: true });
  const tracked = new Set(trackedFiles(root) || []);
  const files = new Set();
  for (const [lp, ledger] of ctx.ledgers) {
    files.add(lp);
    const sd = specDocs(lp); for (const s of [sd.uiux, sd.prd]) if (s) files.add(s);   // the spec documents beside it, as the ledger (D40)
    for (const f of governedFiles(ctx, ledger)) files.add(f);
  }
  const now = Array.from(files).map(f => rel(root, f));
  const gone = governedAt(root, new Set(now), base);
  const rels = uniq(now.concat(gone)).sort();
  const untracked = rels.filter(r => !tracked.has(path.join(root, r)) && !gone.includes(r));
  let text = '', touched = [], fromGit = true;
  if (rels.length) {
    const [dr, nr] = diffsFrom(root, base, rels, untracked, [[], ['--name-only', '-z']]);
    if (dr.status === 0) { text = dr.stdout; touched = nr.stdout.split('\0').filter(Boolean); }
    else {
      // no commit yet, or no repository at all: everything governed is new. A repository git will not read — its ownership, its
      // config — is neither, and read as either its diff would be another diff: refused, with git's own line (FORMAT.md 16). git
      // is asked in its own words, whatever the locale, so "not a git repository" is read as written
      const C_ = Object.assign({}, process.env, { LC_ALL: 'C', LANGUAGE: '' });
      const gd = cp.spawnSync('git', ['rev-parse', '--git-dir'], { cwd: root, encoding: 'utf8', env: C_ });
      const noRepo = gd.status !== 0 && /not a git repository/i.test(gd.stderr || '');
      const unborn = gd.status === 0 && cp.spawnSync('git', ['rev-parse', '--verify', '-q', base + '^{commit}'], { cwd: root, encoding: 'utf8', env: C_ }).status !== 0;
      if (!noRepo && !unborn) throw Object.assign(new Error('git will not read the repository at ' + root + ' — ' + (String(gd.status !== 0 ? gd.stderr : dr.stderr).trim().split('\n')[0] || 'git diff ' + base + ' failed') + '; the gate reads no diff it cannot read whole (FORMAT.md 16)'), { refusal: true });
      fromGit = false;
      for (const f of rels) if (isFile(path.join(root, f))) { text += '+++ ' + f + '\n' + readText(path.join(root, f)); touched.push(f); }
    }
  }
  return { hash: sha256(text), touched: uniq(touched), empty: text === '', text, base, rels: fromGit ? rels : [], untracked };
}
// The diff the judge reads: the hashed text with each touched function whole, so that a ruling's premise in the same
// function is on the page and not a file read away; a host caps a judge's turns (D30). Beneath it, each ruling cited
// within the window of a hunk, as governs prints it — the rulings the judge's step 4 reads (D33). The hash never reads it.
function wideDiff(root, d) {
  const w = d.rels.length ? diffsFrom(root, d.base, d.rels, d.untracked, [['--function-context']])[0] : null;
  const body = w && w.status === 0 ? w.stdout : d.text;
  const rs = touchedRulings(root, d);
  if (!rs.length) return body;
  let ctx = null;
  const blocks = rs.map(({ ledger, r }) => { ctx = ctx || loadContext(root); return governsBlock(root, ledger, r, codeCites(ctx, ledger).filter(c => c.id === r.id)); });
  return body.replace(/\n*$/, '\n') + '\nThe rulings cited within ' + WINDOW + ' lines of each hunk, each as governs prints it (D33):\n\n' + blocks.join('\n\n');
}
// The rulings cited within WINDOW lines of each hunk of each touched file — read as near reads an edit (D7), a new file
// whole — each once, in the order of the files and their lines. A hunk has two sides: its lines in the working tree, and
// the lines it removed, read in the base's version of the file, so a ruling cited only on a removed line — the thing a
// removal contradicts — is listed too (D33); a deleted file is its base version, whole.
function touchedRulings(root, d) {
  const found = [], ledgers = new Map(), untracked = new Set(d.untracked);
  const read = (ledger, lines, ranges) => {
    const fenced = fencedLines(lines);
    for (const [a, b] of ranges) for (let ln = a; ln <= b; ln++) {
      if (fenced[ln - 1]) continue;
      for (const c of citesInLine(lines[ln - 1], ledger)) {
        if (!c.exists || found.some(x => x.ledger === ledger && x.r.id === c.id)) continue;
        const r = resolveRuling(ledger, c.id).r;
        if (r) found.push({ ledger, r });
      }
    }
  };
  for (const rf of d.touched) {
    const abs = path.join(root, rf), lp = findLedger(abs, root);
    if (!lp) continue;
    if (!ledgers.has(lp)) ledgers.set(lp, loadLedger(lp));
    const ledger = ledgers.get(lp);
    const now = isFile(abs) && isTextFile(abs) ? splitLines(normEol(readText(abs))) : null;
    if (!d.rels.length || untracked.has(rf)) { if (now) read(ledger, now, [[1, now.length]]); continue; }   // a new file whole, as near reads a Write
    const b = cp.spawnSync('git', ['show', d.base + ':' + rf], { cwd: root, maxBuffer: 1 << 28 });
    const was = b.status === 0 && !b.stdout.subarray(0, SNIFF_BYTES).includes(0) ? splitLines(normEol(b.stdout.toString('utf8'))) : null;
    if (!now) { if (was) read(ledger, was, [[1, was.length]]); continue; }   // deleted: its base version, whole
    const h = sh('git', ['diff', d.base, '--no-renames', '-U0', '--', rf], root);
    const nowR = [], wasR = [];
    for (const m of (h.status === 0 ? h.stdout : '').matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
      const oc = Number(m[1]), on = m[2] === undefined ? 1 : Number(m[2]), nc = Number(m[3]), nn = m[4] === undefined ? 1 : Number(m[4]);
      nowR.push([Math.max(1, nc - WINDOW), Math.min(now.length, nc + Math.max(nn, 1) - 1 + WINDOW)]);
      if (was && on > 0) wasR.push([Math.max(1, oc - WINDOW), Math.min(was.length, oc + on - 1 + WINDOW)]);   // the removed lines, in the base
    }
    read(ledger, now, nowR);
    if (was) read(ledger, was, wasR);
  }
  return found;
}
function freshSession() { return { blocks: 0, history: [], surfaced: false }; }
// The residue a surfaced session reports: its blocks since its last PASS, how many of them had no verdict recorded (D38),
// the failures per verdict, and the last verdict with the lines it was recorded with (D11). The gate prints it at SURFACE,
// and `stop` relays it (D22).
function residueLines(st, sess, id) {
  const h = sess.history, L = [], none = sess.blocks - h.length;
  L.push('residue: ' + sess.blocks + ' block' + (sess.blocks === 1 ? '' : 's') + ' this session since its last PASS' + (none > 0 ? ', ' + none + ' of them with no verdict recorded' : '') + '; located failures per verdict: ' + (h.length ? h.join(' → ') : 'none recorded'));
  if (st.last) {
    const other = st.last.session !== id;                              // `last` is one for the repository: a verdict another session recorded is named as its (FORMAT.md 16)
    L.push('last verdict: ' + st.last.verdict + ' at ' + st.last.at + ' (' + st.last.failures + ' located failure' + (st.last.failures === 1 ? '' : 's') + ')' +
      (other ? ', recorded by another session' + (st.last.session ? ', ' + st.last.session : '') + ', not this one' : ''));
    if (st.last.reason) for (const line of String(st.last.reason).split('\n')) if (line.trim()) L.push('  ' + line.trim());
  }
  return L;
}
// The gate's decision (D10, D11), `gate`'s and `stop`'s alike: SKIP; SURFACE, with the session marked surfaced here; or JUDGE.
function gateDecide(root, id) {
  const st = loadState(root), sess = Object.assign(freshSession(), st.sessions[id] || {});
  let d;
  try { d = governedDiff(root, sessionBase(root, st, id)); }          // from the session's base (D40)
  catch (e) {
    // past the walk's bound, a tree with no ledger between the working directory and the root is read as the ungoverned tree
    // it would be: the stop is a hook, and a hook does not tax a project the docket does not govern; with a ledger there the
    // refusal stands (FORMAT.md 1)
    if (!e || !e.walkBound || findLedger(path.join(process.cwd(), 'x'), root)) throw e;
    d = { hash: sha256(''), touched: [], empty: true, text: '', base: 'HEAD', rels: [], untracked: [] };
    return { decision: 'SKIP', reason: 'no ledger governs the working directory, and the tree past the walk\'s bound is not read', d, st, sess };
  }
  if (d.empty || d.hash === st.lastPassHash) return { decision: 'SKIP', reason: d.empty ? 'nothing governed changed' : 'the last PASS judged this diff', d, st, sess };   // D10
  if (sess.surfaced) return { decision: 'SKIP', reason: 'this session is surfaced until a PASS or a new session', d, st, sess };   // D11
  const h = sess.history;
  const stuck = sess.blocks >= THIRD_CYCLE && h.length >= 2 && h[h.length - 1] >= h[h.length - 2];   // failures not falling after the third block
  if (sess.blocks >= BLOCK_CAP || stuck) {                           // D11: the mark made under the state's lock
    let now;
    try { now = withState(root, s => { s.sessions[id] = Object.assign(freshSession(), s.sessions[id] || {}, { surfaced: true }); }); }
    catch (e) { if (!e.docket) throw e; now = st; now.sessions[id] = Object.assign(freshSession(), st.sessions[id] || {}, { surfaced: true }); }   // the answer stands; the mark has nowhere to go
    return { decision: 'SURFACE', d, st: now, sess: now.sessions[id] };
  }
  return { decision: 'JUDGE', d, st, sess };
}
function gate(argv) {
  const root = stopRoot(process.cwd());                               // D28
  const id = sessionId(argv);
  const g = gateDecide(root, id), d = g.d;
  const say = (decision, extra) => { if (argv.json) out(JSON.stringify(Object.assign({ decision, session: id, hash: d.hash, files: d.touched }, extra || {}), null, 2)); };
  if (g.decision === 'SKIP') { say('SKIP', { reason: g.reason }); if (!argv.json) out('SKIP'); return 0; }
  if (g.decision === 'SURFACE') {
    const L = ['SURFACE'].concat(residueLines(g.st, g.sess, id));
    L.push('report this to the user verbatim, then stop again');
    say('SURFACE', { residue: L.slice(1, -1) }); if (!argv.json) out(L.join('\n'));
    return 0;
  }
  say('JUDGE', has(argv, '--diff') ? { diff: wideDiff(root, d) } : null);   // an option accepted is an option honoured, --json or not
  if (!argv.json) { out('JUDGE ' + d.hash + (d.touched.length ? ' ' + d.touched.join(' ') : '')); if (has(argv, '--diff')) out(wideDiff(root, d)); }
  return 0;
}
// A verdict is held to its lines (D23). Each is one located failure in the protocol's form — pack · F<n> · file:line ·
// what · … · route — and their count is --failures. A code-pack line that names a ruling answers the question of the
// protocol's step 4 in so many words, after what the diff breaks and before the route: "reason holds" (a failure), or
// "reason gone" or "cite stale" (a stale one, whose route is an addendum). The verdict follows from its lines: STALE
// when every failure is a stale one, FAIL when any is not. A judge that named the contradiction and never asked
// whether its reason still stood was the failure measured most often; the form asks, and the record refuses an answer
// that skipped the question.
const LOCATED_SEP = ' · ';
// The answer to the reason question carries its evidence (D27): a field of its own, `reason holds: <the premise> (<file:line>)`
// or `reason gone: <what changed> (<file:line>)`, the location a line of a file in the repository before or after the diff,
// a ledger's included (D29).
// The answer's field: the token, the premise in words, and its line in parentheses anywhere in the field — one
// location or several, each `<file>:<line>` or `<file>:<first>-<last>`, with words beside them if the judge adds
// some, each a line of the file as the diff leaves it or as it stood at HEAD.
// A path in backticks is one path, a space or a parenthesis in it or not: `app/(group)/login.js`:46 (D23)
const LOC_RE = /(?:`([^`\n]+)`|([^\s(),;`]+?)):(\d+)(?:\s*[-–]\s*(\d+))?/g;
const locPath = L => (L[1] !== undefined ? L[1] : L[2]).trim();
function lineCount(text) { return text === null ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0); }
// A location is the file it resolves to, as FORMAT.md 1 reads a link for the walk: a link out of the tree is not the tree's
// file, and a link to a ledger is that ledger. A path that resolves to nothing is kept as written (read at HEAD, or refused).
function realOr(p) { try { return fs.realpathSync(p); } catch (e) { return p; } }
function evidenceOf(root, fields, at) {
  const a = fields.map(x => x.trim()).find(x => /^reason (?:holds|gone)\b/i.test(x));
  const groups = a ? [...a.matchAll(/\(((?:`[^`\n]*`|[^()`])*)\)/g)].filter(g => /:\d/.test(g[1])) : [];   // a backticked path may hold a parenthesis
  const g = groups.length ? groups[groups.length - 1] : null;
  const premise = a && g ? a.replace(g[0], ' ').replace(/^reason (?:holds|gone)\b[\s:—–-]*/i, '').trim() : '';
  const locs = g ? [...g[1].trim().matchAll(LOC_RE)] : [], ev = [];
  if (!a || !g || !/[\p{L}\p{N}]/u.test(premise) || !locs.length) die(at + ' answers the reason question without its evidence' + (a ? ' (read: "' + a + '")' : '') + ': the answer is a field of its own, `reason holds: <the premise, as the code the diff leaves shows it> (<file:line>)` or `reason gone: <what the diff changed> (<file:line>)`; a range `<file:first-last>`, or several locations with commas, will do (protocol step 4, D27)', 2);
  for (const L of locs) ev.push(heldLine(root, L, at + ' points its evidence'));
  return ev;
}
// A location held as evidence (D27): a line of a file in the repository, before or after the diff, the file its path
// resolves to (FORMAT.md 1). `lead` says what points there, so a refusal names it.
function heldLine(root, L, lead) {
  const p = locPath(L), first = Number(L[3]), last = L[4] === undefined ? first : Number(L[4]), abs = path.resolve(root, p), where = L[0].trim();
  if (!isWithin(abs, root)) die(lead + ' outside the repository: ' + where, 2);
  const real = realOr(abs);
  if (!isWithin(real, realOr(root))) die(lead + ' outside the repository: ' + where + ' is a link to a file outside it (FORMAT.md 1)', 2);
  let now = null, then = null;
  if (isFile(abs)) { try { now = fs.readFileSync(abs, 'utf8'); } catch (e) { now = null; } }
  const h = sh('git', ['cat-file', 'blob', 'HEAD:./' + rel(root, abs).split(path.sep).join('/')], root); if (h.status === 0) then = h.stdout;
  const count = Math.max(lineCount(now), lineCount(then));
  // a bare path that follows a space or a parenthesis may be the tail of one that holds them: the refusal says how to write it whole
  const cut = L[1] === undefined && L.index > 0 && /[\s(]/.test(L.input[L.index - 1]) ? '; a path with a space or a parenthesis is written in backticks, `like this.js`:12 (D23)' : '';
  if (!(first >= 1 && last >= first && last <= count)) die(lead + ' at ' + where + ', which is not a line of a file in this repository, before or after the diff (D27)' + cut, 2);
  return { abs: real, first, last };
}
// An answer's evidence is never its own claim (D36): a "reason holds" whose every location lies in the entry of a ruling
// the line names — the ruling restated — or in the failure's own located lines — the contradiction itself — shows no
// premise, and is refused with what to point at instead. A "reason gone" may point at the diff's own line: the change is
// its evidence.
function ownClaim(root, f, ev, at) {
  const named = new Set(f[3].match(/(?<![\p{L}\p{N}_])[A-Za-z]+[1-9]\d*(?![\p{L}\p{N}_])/gu) || []);
  const entries = [];
  for (const [lp, L] of loadContext(root).ledgers) for (const r of L.rulings) if (named.has(r.id)) entries.push({ abs: realOr(path.resolve(lp)), first: r.line, last: r.endLine, id: r.id, lp });
  const own = [...String(f[2]).matchAll(LOC_RE)].map(L => ({ abs: realOr(path.resolve(root, locPath(L))), first: Number(L[3]), last: L[4] === undefined ? Number(L[3]) : Number(L[4]) }));   // compared as the files they resolve to, the evidence's included
  const inside = (e, s) => e.abs === s.abs && e.first >= s.first && e.last <= s.last;
  const why = ev.map(e => {
    const en = entries.find(s => inside(e, s));
    if (en) return 'the entry of ' + en.id + ' itself (' + rel(root, en.lp) + ':' + en.first + '-' + en.last + ')';
    return own.some(s => inside(e, s)) ? 'the failure\'s own line (' + f[2] + ')' : null;
  });
  if (ev.length && why.every(Boolean)) die(at + ' answers "reason holds" with its own claim as the evidence — ' + Array.from(new Set(why)).join(' and ') + ': a ruling\'s text restates the claim and the failure\'s own line is the contradiction, so neither shows the premise; point the evidence at the line that shows it, as the code the diff leaves shows it, and record again (D36)', 2);
}
function holdToLines(root, v, failures, lines) {
  if (!lines.length) die('verdict: a ' + v + ' names its located failures: --reason "<one per line: pack · F<n> · file:line · what · route>"', 2);
  if (lines.length !== failures) die('verdict: --failures ' + failures + ' but --reason carries ' + lines.length + ' line' + (lines.length === 1 ? '' : 's') + ': one located failure per line, and the count is theirs', 2);
  let ids = null;
  const rulingIds = () => { if (!ids) { ids = new Set(); for (const [, L] of loadContext(root).ledgers) for (const r of L.rulings) ids.add(r.id); } return ids; };
  let stale = 0;
  lines.forEach((l, i) => {
    const f = l.split(LOCATED_SEP).map(x => x.trim()), at = 'verdict: line ' + (i + 1);
    if (f.length < 5 || !/^[a-z][a-z0-9-]*$/.test(f[0]) || !/^F\d+[a-z]?$/.test(f[1]) || !f[2] || !f[f.length - 1]) die(at + ' is not a located failure: <pack> · F<n> · <file:line> · <what> · <fix route>, its fields joined by " · " (the protocol\'s form)', 2);
    // The answer is a field of its own (protocol step 4), read there and nowhere else: prose that says the words is not an
    // answer, and an answer on any line, of any pack, is held to its line (D27)
    const mid = f.slice(3, -1), said = mid.filter(x => /^(?:reason (?:holds|gone)|cite stale)\b/i.test(x)).join(LOCATED_SEP);
    const gone = /\b(?:reason gone|cite stale)\b/i.test(said), holds = /\breason holds\b/i.test(said);
    if (gone && holds) die(at + ' says both that the reason holds and that it is gone', 2);
    const names = f[0] === 'code' && (f[3].match(/(?<![\p{L}\p{N}_])[A-Za-z]+[1-9]\d*(?![\p{L}\p{N}_])/gu) || []).some(t => rulingIds().has(t));
    if (names && !gone && !holds && /\b(?:reason (?:holds|gone)|cite stale)\b/i.test(mid.join(LOCATED_SEP))) evidenceOf(root, mid, at);   // an answer said inside another field is told where it goes
    if (names && !gone && !holds) die(at + ' names a ruling and says nothing of its reason: after what the diff breaks, write "reason holds: <the premise> (<file:line>)", or "reason gone: <what changed> (<file:line>)" (or "cite stale"), then the route (protocol step 4)', 2);
    if (holds || /\breason gone\b/i.test(said)) { const ev = evidenceOf(root, mid, at); if (holds) ownClaim(root, f, ev, at); }
    else if (gone) {                                                   // `cite stale`: the failure's own location is its evidence (D27)
      const own = [...String(f[2]).matchAll(LOC_RE)];
      if (!own.length) die(at + ' says cite stale, whose evidence is its own location, and ' + f[2] + ' names no line of a file (D27)', 2);
      for (const L of own) heldLine(root, L, at + ' says cite stale, whose evidence is its own location, and points');
    }
    if (gone) stale += 1;
    // the failure's own location is held as its evidence is (D23, D27): a line of a file in the repository, before or after the
    // diff — read after the answer, so a line that skipped the question is told so first
    const own = [...String(f[2]).matchAll(LOC_RE)];
    if (!own.length) die(at + ' locates its failure at "' + f[2] + '", which names no line of a file: the third field is <file:line> — a range <file:first-last>, or several with commas, will do, and a path with a space or a parenthesis is written in backticks, `like this.js`:12 (protocol step 4, D23)', 2);
    for (const L of own) heldLine(root, L, at + ' locates its failure');
  });
  if (v === 'STALE' && stale < lines.length) die('verdict: STALE is the verdict only when every failure is a stale one (protocol step 6); ' + (lines.length - stale) + ' of these ' + lines.length + (lines.length - stale === 1 ? ' is' : ' are') + ' not: record FAIL, with the stale ones and their addendum route among its lines', 2);
  if (v === 'FAIL' && stale === lines.length) die('verdict: every failure here is a stale one: the verdict is STALE, not FAIL (protocol step 6)', 2);
}
function verdict(argv) {
  const v = (argv._[1] || '').toUpperCase();
  if (!['PASS', 'FAIL', 'STALE'].includes(v)) die('usage: docket verdict <PASS|FAIL|STALE> --hash <hash> --failures <n> [--session <id>] [--reason "<the located failures>"]', 2);
  const root = stopRoot(process.cwd());                               // D28
  const id = sessionId(argv);
  const fRaw = flag(argv, '--failures'), failures = fRaw === null ? 0 : /^\d+$/.test(String(fRaw)) ? Number(fRaw) : NaN;   // a whole number, written as one
  if (!Number.isInteger(failures) || failures < 0) die('verdict: --failures must be a non-negative integer', 2);
  if (v === 'PASS' && failures !== 0) die('verdict: a PASS has no located failures; this names ' + failures, 2);
  if (v !== 'PASS' && failures === 0) die('verdict: a ' + v + ' names at least one located failure; --failures is 0', 2);
  const reason = flag(argv, '--reason');
  if (reason !== null && UNSAFE_RE.test(reason)) die('verdict: --reason carries a control or bidi character', 2);
  const lines = reason === null ? [] : String(reason).split('\n').map(x => x.trim()).filter(Boolean);
  if (v === 'PASS' && lines.length) die('verdict: a PASS names no located failures; --reason is for a FAIL or a STALE', 2);
  if (v !== 'PASS') holdToLines(root, v, failures, lines);            // D23
  // A verdict is the judgement of the diff in front of the judge: a hash the working tree does not hash to is another diff's,
  // and counted here it would be counted again by the stop, which reads no record for its own, or reset the count at every
  // stop and never surface the session (D11, D38). It is refused, with the way to record it.
  const now = governedDiff(root, sessionBase(root, loadState(root), id)).hash, given = flag(argv, '--hash');
  if (given && given !== now) die('verdict: --hash ' + given + ' is not the diff in front of you: the working tree\'s governed diff hashes to ' + now + ' now; run `docket gate` for the hash, judge the diff it names, and record again', 2);
  const hash = now;
  const moveTo = v === 'PASS' && governedDiff(root, 'HEAD').empty ? headCommit(root) : null;   // a PASS on a committed tree: the diff since it runs from HEAD (D40)
  let sess, st;
  try { st = withState(root, s => {
    sess = Object.assign(freshSession(), s.sessions[id] || {});
    s.last = { verdict: v, hash, failures, at: new Date().toISOString(), session: id };
    if (reason) s.last.reason = reason;
    if (v === 'PASS') { s.lastPassHash = hash; sess.blocks = 0; sess.history = []; sess.surfaced = false; if (moveTo) sess.base = moveTo; }   // reset only on PASS (D11); a changed hash never resets
    else { sess.blocks += 1; sess.history.push(failures); }
    s.sessions[id] = sess;
  }); } catch (e) { if (e.docket) die('verdict: ' + e.message, 2); throw e; }
  // Every verdict, in order, one JSON line each: the judge's record for a person to read and for a measurement to score
  // the judge's first answer by. Nothing in the core reads it (D22).
  try { fs.appendFileSync(path.join(root, '.docket', 'verdicts.jsonl'), JSON.stringify(st.last) + '\n'); } catch (e) { process.stderr.write('note: .docket/verdicts.jsonl could not be appended to (' + e.code + '); the verdict is recorded in .docket/verdict.json\n'); }
  const left = v === 'PASS' && !flag(argv, '--session') ? Object.keys(st.sessions).filter(k => k !== id && st.sessions[k].surfaced) : [];   // a PASS releases the session it names, and this one was not named
  if (argv.json) { out(JSON.stringify({ verdict: v, failures, session: id, blocks: sess.blocks, hash, stillSurfaced: left }, null, 2)); return 0; }
  out('verdict recorded: ' + v + ' (' + failures + ' located failure' + (failures === 1 ? '' : 's') + '); session ' + id + ': ' + sess.blocks + ' block' + (sess.blocks === 1 ? '' : 's') + ' since its last PASS');
  for (const k of left) out('note: session ' + k + ' is still surfaced; a PASS releases it only with --session ' + k);
  return 0;
}

// The stop (D37). The host runs `stop` at "done" with its hook input on stdin, `--judge`: the command that starts its agent
// as the judge — headless, a session of its own with a turn limit of its own, reading its prompt on stdin — and
// `--permission`: the rule that command grants the judge. A stop the protocol says stands with no judge is allowed at once;
// for any other the core starts the judge with the prompt below, waits for it to end, up to `--wait` seconds, and reads
// its record: the judge's answer is that record and nothing else it says. A judge that ends with none — refused, stopped
// at its own limit, or at the bound — does not let the stop stand, once, and the block says so and counts as one of the
// session's five (D38). The judge's own output is kept in .docket/judge.log for a person to read; the stop judges nothing,
// and writes nothing else but that count.
function surfacedReason(st, sess, tail, id) {
  return 'The docket surfaced this session: its located failures have not fallen, or it has been blocked ' + BLOCK_CAP + ' times, since its last PASS.\n' + residueLines(st, sess, id).join('\n') + '\nreport this to the user verbatim, then stop again\n' + tail.trimStart();   // the gate's relay line, as written (D11)
}
// The hook input's fields the judge reads — the session, the transcript it reads at step 5, the directory — and nothing
// else: a field the maker wrote, as the host's copy of its last message is, would reach the judge before its own reading.
function hookFields(input) { const o = {}; for (const k of ['session_id', 'transcript_path', 'cwd']) if (typeof input[k] === 'string') o[k] = input[k]; return o; }
function judgePrompt(core, perm, input) {
  core = /^[\w\/.@:+-]+$/.test(core) ? core : JSON.stringify(core);   // a path the shell would split is written quoted, as the rule allows
  return [
    'You are the docket\'s judge for this stop.',
    'Run `node ' + core + ' protocol` with the path written out — no $( ), no variable, no cd or other prefix' + (perm ? ': your one permission, ' + perm + ', matches that shape alone' : '') + '.',
    'Follow the protocol to its end: your answer is the record `node ' + core + ' verdict` makes, and the stop reads that record and nothing else you say.',
    'If a command of that shape is denied, record nothing, and say in one line that the judge could not run the core.',
    'Hook input: ' + JSON.stringify(hookFields(input)),
  ].join('\n') + '\n';
}
// The judge is one command (D37). The stop runs it as `exec <command>`, so that the process it waits on, and stops at the
// bound, is the judge and its exit status is the judge's: an operator outside quotes would leave the shell as a parent the
// bound does not reach, or run a second command whose status hides the judge's, and an assignment before the command is no
// command to exec. Read as the shell reads quotes and a backslash; null when the command is one.
function judgeShapeFault(cmd) {
  let q = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q === "'") { if (c === "'") q = null; continue; }
    if (c === '\\') { i++; continue; }
    if (q === '"') { if (c === '"') q = null; continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (c === '\n' || c === ';' || c === '|' || c === '<' || c === '(' || c === ')' || (c === '&' && cmd[i - 1] !== '>')) return 'the operator "' + (c === '\n' ? '\\n' : c) + '" outside quotes';
  }
  if (q) return 'a quote that is never closed';
  if (/^\s*[A-Za-z_][A-Za-z0-9_]*=/.test(cmd)) return 'an assignment before the command';
  return null;
}
// A block, made and written to the trail when one is kept (D25), so a measurement reads the blocks the stop made from the
// core's own record, beside the host's wording of them
function blockStop(reason) {
  if (TRAIL) { try { fs.appendFileSync(TRAIL, '  blocked: ' + plain(String(reason).split('\n')[0]).slice(0, 200) + '\n'); } catch (e) { /* the measurement's, not the stop's */ } }
  out(JSON.stringify({ decision: 'block', reason })); return 0;
}
function stop(argv) {
  let input = {};
  try { input = JSON.parse(readStdin()) || {}; } catch (e) { input = {}; }
  if (typeof input !== 'object' || Array.isArray(input)) input = {};
  const waitRaw = flag(argv, '--wait');
  const waitS = waitRaw === null ? STOP_WAIT : Number(waitRaw);
  if (!(Number.isInteger(waitS) && waitS >= 1)) die('stop: --wait takes a whole number of seconds, one or more: the bound on the judge it starts', 2);
  const allow = () => { if (argv.json) out('{}'); return 0; };      // an allowed stop prints nothing; with --json, an object with no decision
  if (input.stop_hook_active === true) return allow();                                           // D11: blocked at most once per turn
  const root = stopRoot(process.cwd());                               // D28: the judge's root, whatever the host tells this hook
  const id = sessionKey(flag(argv, '--session') || (typeof input.session_id === 'string' && input.session_id) || process.env.DOCKET_SESSION || 'default');
  const g = gateDecide(root, id), d = g.d;                             // the gate's own decision, before any judge starts
  if (g.decision === 'SKIP') return allow();                                                     // D10, D11: nothing to judge, or surfaced before this stop
  const files = d.touched.join(', ');
  const tail = ' This stop cannot stand; the stop that follows this block in the same turn is allowed.';
  if (g.decision === 'SURFACE') return blockStop(surfacedReason(g.st, g.sess, tail, id));   // D11: no judge; the residue goes to the maker
  const judge = flag(argv, '--judge');
  if (!judge) die('stop: this stop is judged, and --judge names no command to start the judge: the host\'s binding gives one, which reads its prompt on stdin (docs/FORMAT.md 16)', 2);
  const fault = judgeShapeFault(judge);
  if (fault) die('stop: --judge is one command, run as `exec <command>` so that the judge is the process the stop waits on and stops at the bound, and its exit status the judge\'s; this one holds ' + fault + ': set a variable as `env NAME=value <command>`, and put anything more in a script the command runs (docs/FORMAT.md 16)', 2);
  const perm = flag(argv, '--permission');
  const cwd = typeof input.cwd === 'string' && isDir(input.cwd) ? input.cwd : process.cwd();
  const start = Date.now();
  // The judge runs with the stop's session as its default, so a verdict that names none is this session's (D11)
  // and the stop's root (D44); its prompt names the session as the stop keys it
  const r = cp.spawnSync('/bin/sh', ['-c', 'exec ' + judge], { cwd, input: judgePrompt(path.resolve(__filename), perm, Object.assign({}, input, { session_id: id })), env: Object.assign({}, process.env, { DOCKET_SESSION: id, DOCKET_ROOT: root }), encoding: 'utf8', timeout: waitS * 1000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024 });   // 64 MiB: a judge's whole record, many times over (D14's addendum)
  const secs = Math.round((Date.now() - start) / 1000);
  const unread = !!(r.error && r.error.code === 'EPIPE');             // it ended before it read its whole prompt: started, ended, its status its own
  const ended = r.error && r.error.code === 'ETIMEDOUT' ? 'was stopped at the bound, ' + waitS + ' second' + (waitS === 1 ? '' : 's')
    : r.error && !unread ? 'could not be started (' + (r.error.code || r.error.message) + ')'
    : 'ended after ' + secs + ' second' + (secs === 1 ? '' : 's') + (r.status === 0 ? '' : r.status === null ? ', on ' + r.signal : ', exit ' + r.status) + (unread ? ', before it read its prompt' : '');
  try { docketDir(root); fs.writeFileSync(path.join(root, '.docket', 'judge.log'), '$ ' + judge + '\nthe judge ' + ended + (r.error && r.error.code === 'ETIMEDOUT' ? '' : ' (its bound: ' + waitS + ' seconds)') + '\n' + (r.stdout || '') + (r.stderr || '')); } catch (e) { /* the log is a person's; the stop decides without it */ }
  const st = loadState(root), l = st.last;
  if (st.sessions[id] && st.sessions[id].surfaced) return blockStop(surfacedReason(st, st.sessions[id], tail, id));   // surfaced while the judge ran (D11)
  if (st.lastPassHash === d.hash) return allow();                                                // the judge's PASS
  if (l && l.hash === d.hash && l.session === id && Date.parse(l.at) >= start && (l.verdict === 'FAIL' || l.verdict === 'STALE')) {   // this session's record of this diff, and no other's
    const n = l.failures;
    const reason = 'The docket\'s judge recorded ' + l.verdict + ' for this stop\'s diff (' + files + '), ' + n + ' located failure' + (n === 1 ? '' : 's') + ':\n' + (l.reason ? String(l.reason) : '(no reason was recorded with it)') + '\n' + (l.verdict === 'STALE' ? 'The route is an addendum through /rule, not a rewrite.' : 'Change the code, or supersede the ruling through /rule.') + tail;
    return blockStop(reason);
  }
  // A block with no record is a block (D38): it counts toward the session's five as a recorded one does, so a judge that
  // never records surfaces the session, and its residue reaches the person, as a judge that never passes does (D11).
  let sess = Object.assign(freshSession(), st.sessions[id] || {}, { blocks: (st.sessions[id] ? st.sessions[id].blocks : 0) + 1 });
  try { withState(root, s => { sess = Object.assign(freshSession(), s.sessions[id] || {}); sess.blocks += 1; s.sessions[id] = sess; }); } catch (e) { /* the block stands without its count */ }
  // The maker reads this. Told that the judge could not run, a maker tried to run the judge itself; so the reason says
  // whose job it is, what to do — nothing, then stop again — and where a person finds the judge's own words.
  const reason = 'The docket\'s judge recorded no verdict for this stop\'s diff (' + files + '): it ' + ended + ', so this stop cannot stand: a governed stop is judged, and the judge is not you. Do not run the core yourself; stop again, and this block will not repeat in this turn. This block is ' + sess.blocks + ' of the ' + BLOCK_CAP + ' a session may take since its last PASS before the docket surfaces it; the judge\'s own output is in .docket/judge.log.';
  return blockStop(reason);
}

// ─── 17. protocol, pack, transcript: what the judge reads, printed by the core ─

// The judge's shell is allowed one thing — this program — and it may read nothing outside the project. So the protocol,
// the packs and the maker's transcript reach it through here. The vendored copy carries neither judge/ nor packs/ and
// says so, as intake does.
function besideMe(dir, file, what) {
  const p = path.join(__dirname, '..', dir, file);
  if (!isFile(p)) die(what + ': ' + dir + '/' + file + ' is not beside this file\'s bin/ — it lives in the plugin; the vendored witness at test/docket.js carries none', 2);
  return p;
}
function protocol(argv) {
  const text = readText(besideMe('judge', 'PROTOCOL.md', 'protocol'));
  if (argv.json) { out(JSON.stringify({ file: 'judge/PROTOCOL.md', text }, null, 2)); return 0; }
  out(text); return 0;
}
function pack(argv) {
  const dir = path.join(__dirname, '..', 'packs');
  if (has(argv, '--list') || !argv._[1]) {
    if (!isDir(dir)) die('pack: packs/ is not beside this file\'s bin/ — the packs live in the plugin; the vendored witness at test/docket.js carries none', 2);
    const names = fs.readdirSync(dir).filter(f => /\.md$/.test(f)).sort();
    const rows = names.map(f => { const m = /^Domain:\s*(.+)$/m.exec(readText(path.join(dir, f))); return { name: f.replace(/\.md$/, ''), domain: m ? m[1].trim() : '' }; });
    if (argv.json) { out(JSON.stringify(rows, null, 2)); return 0; }
    for (const r of rows) out(r.name + '  ' + r.domain);
    return 0;
  }
  const names = argv._.slice(1);                                      // several names, one command (D30)
  for (const name of names) if (!/^[a-z][a-z0-9-]*$/.test(name)) die('pack: a pack is named by its file: docket pack code | design | prose | decisions (docket pack --list)', 2);
  if (isDir(dir)) {                                                    // the plugin's packs are here: a name none has is a name to correct
    const unknown = names.filter(name => !isFile(path.join(dir, name + '.md')));
    if (unknown.length) die('pack: no pack named ' + unknown.join(', ') + '; the packs are ' + fs.readdirSync(dir).filter(f => /\.md$/.test(f)).map(f => f.replace(/\.md$/, '')).sort().join(', ') + ' (docket pack --list)', 2);
  }
  const texts = names.map(name => readText(besideMe('packs', name + '.md', 'pack')));
  if (argv.json) { out(JSON.stringify(names.map((name, i) => { const m = /^Domain:\s*(.+)$/m.exec(texts[i]); return { name, domain: m ? m[1].trim() : '', text: texts[i] }; }), null, 2)); return 0; }
  out(texts.join('\n')); return 0;
}
// A JSON-lines log of messages, as a host writes one: each line an object; the ones whose `type` is `assistant` carry
// `message.content`, a list of blocks — `text`, and `tool_use` with a `name` and an `input` — and a user turn carries the
// `tool_result` of each call. Printed in order: the text; each tool call naming the tool, then every line of its command
// or its file, pattern or prompt, a line after the first indented under it; and each result, marked as one. The judge
// checks the maker's claims against the commands the transcript shows were run and their output (code F6), and a call
// that writes the ledger on its second line is still the maker's call (protocol step 5): a first line alone hid both.
// A call or a result over TRANSCRIPT_LINES lines prints that many in all: its first TRANSCRIPT_HEAD, the count between,
// and the rest from its end — its head names what ran, and a runner prints its verdict last — so the mark stands for two
// lines or more and the cut never prints more than it keeps out; and a line over TRANSCRIPT_WIDTH characters is cut,
// marked (D14, D42). A line that is not JSON, or a file that is not such a log, is printed as it is. `--last <n>` keeps
// the last n assistant turns.
const TRANSCRIPT_LINES = 40, TRANSCRIPT_HEAD = 10, TRANSCRIPT_WIDTH = 400;
function transcriptItem(label, text) {
  let ls = String(text).replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
  const tail = TRANSCRIPT_LINES - TRANSCRIPT_HEAD - 1;                 // twenty-nine: forty lines in all, the mark among them
  if (ls.length > TRANSCRIPT_LINES) ls = ls.slice(0, TRANSCRIPT_HEAD).concat(['\u2026 ' + (ls.length - TRANSCRIPT_HEAD - tail) + ' lines \u2026'], ls.slice(-tail));
  ls = ls.map(l => { const a = Array.from(l); return a.length > TRANSCRIPT_WIDTH ? a.slice(0, TRANSCRIPT_WIDTH - 1).join('') + '\u2026' : l; });
  return label + ' ' + ls[0] + ls.slice(1).map(l => '\n    ' + l).join('');
}
function resultText(c) { return typeof c === 'string' ? c : Array.isArray(c) ? c.filter(x => x && x.type === 'text' && typeof x.text === 'string').map(x => x.text).join('\n') : ''; }
function transcript(argv) {
  const given = argv._[1];
  if (!given) die('usage: docket transcript <path> [--last <n>]', 2);
  const p = path.resolve(process.cwd(), given);
  if (!isFile(p)) die('transcript: cannot read ' + given, 2);
  const last = flag(argv, '--last'); const keep = last === null ? Infinity : Number(last);
  if (!(Number.isInteger(keep) && keep > 0) && last !== null) die('transcript: --last takes a positive integer', 2);
  const lines = splitLines(readText(p)); const turns = []; let plain_ = true;
  for (const line of lines) {
    if (!line.trim()) continue;
    let o = null; try { o = JSON.parse(line); } catch (e) { o = null; }
    if (!o || typeof o !== 'object') { turns.push({ raw: line }); continue; }
    plain_ = false;
    const m = o.message && typeof o.message === 'object' ? o.message : null;
    const role = o.type === 'assistant' || (m && m.role === 'assistant') ? 'assistant' : (o.type === 'user' || (m && m.role === 'user') ? 'user' : null);
    if (!role || !m) continue;
    const blocks = Array.isArray(m.content) ? m.content : (typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : []);
    const L = [];
    for (const b of blocks) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) L.push(b.text.trim());
      if (b.type === 'tool_use') { const inp = b.input || {}; L.push(transcriptItem('[' + b.name + ']', (inp.command || inp.file_path || inp.pattern || inp.prompt || '').toString())); }
      if (b.type === 'tool_result') L.push(transcriptItem(b.is_error === true ? '[result, error]' : '[result]', resultText(b.content)));
    }
    if (L.length) turns.push({ role, lines: L });
  }
  if (plain_ && turns.every(t => t.raw !== undefined)) { out(argv.json ? JSON.stringify(lines.map(raw => ({ raw })), null, 2) : lines.join('\n')); return 0; }
  const aTurns = turns.filter(t => t.role === 'assistant');
  const whole = keep === Infinity || keep >= aTurns.length;          // the last n turns, n at or past the count, are the whole transcript
  const start = whole ? 0 : aTurns.length - keep;
  const firstKept = aTurns[start];
  const outL = [], kept = [];
  let seen = 0;
  for (const tn of turns) {
    if (tn.raw !== undefined) { if (whole) { outL.push(tn.raw); kept.push({ raw: tn.raw }); } continue; }
    if (tn.role === 'assistant') { if (tn === firstKept) seen = 1; if (!seen && !whole) continue; }
    else if (!seen && !whole) continue;
    outL.push((tn.role === 'assistant' ? '── assistant' : '── user') + '\n' + tn.lines.join('\n'));
    kept.push({ role: tn.role, lines: tn.lines });
  }
  out(argv.json ? JSON.stringify(kept, null, 2) : outL.join('\n'));
  return 0;
}

// ─── 11. cli ────────────────────────────────────────────────────────────────

const USAGE = [
  'docket — the ledger of rulings that governs a codebase',
  '',
  '  docket                              the witness: check, and spec-check when a UIUX.md sits beside a ledger',
  '  docket near                         stdin: an edit; stdout: what governs the region (silent when nothing does)',
  '  docket status                       the docket: last rulings, uncited rulings, pending addenda, last verdict, witness',
  '                                      (--session-start, the call at a session\'s start: its input on stdin records the session\'s base)',
  '  docket check                        the seven checks (exit 1 on a failure)',
  '  docket spec-check [--all]           token rows and contrast rows of UIUX.md against the CSS (the nearest ledger; --all for every ledger)',
  '  docket index                        the whole parse as JSON',
  '  docket query <term>                 rulings whose heading or body match, with edges and addenda',
  '  docket governs <id> [<id>…]         edges in and out with their clauses, addenda, code cites',
  '  docket principles                   the principle list',
  '  docket append --title --issue --principle [--edge "<verb> <id>"]... --body   a new entry, checked',
  '  docket append --addendum <id> --text "..."   a dated addendum under an entry',
  '  docket append --baseline            rewrite the bare-cite baseline',
  '  docket diff <revA> <revB>           what changed in the law: rulings, edges and addenda added; any existing entry changed, listed first (exit 1)',
  '  docket diff --files <a> <b>         the same, between two ledger files',
  '  docket vendor <dir>                 copy the witness to <dir>/test/docket.js and print the CI step',
  '  docket constitute --answers <json>  a new project\'s PRD, UIUX and DECISIONS from the four answers, the witness vendored, check run (--target <dir>)',
  '  docket intake rule|constitute       print an intake file, for a skill to splice at load',
  '  docket gate --session <id> [--diff] SKIP, SURFACE, or JUDGE <hash> <files…> — the session\'s diff from its base, decided mechanically (D10, D11, D40); --diff prints it',
  '  docket verdict PASS|FAIL|STALE --hash <h> --failures <n> --session <id> [--reason "…"]   record the judge\'s verdict in .docket/verdict.json',
  '  docket stop --judge "<command>" [--permission "<rule>"] [--wait <s>]   stdin: the stop hook\'s input; starts the judge on a governed stop and turns its record into the stop\'s answer',
  '  docket protocol                     print judge/PROTOCOL.md',
  '  docket pack <name>… | --list        print packs, or the packs with their domains',
  '  docket transcript <path> [--last n] the assistant text and tool calls of a JSON-lines message log',
  '',
  'Options: --json on every subcommand; --ledger <path> where a ledger is read.',
  'Exit codes: 0 success · 1 a failed check · 2 usage error.',
].join('\n');
const TAKES_VALUE = new Set(['--ledger', '--session', '--hash', '--failures', '--title', '--issue', '--principle', '--edge', '--body', '--prefix', '--addendum', '--text', '--answers', '--target', '--reason', '--last', '--wait', '--permission', '--judge']);
const BARE_FLAGS = new Set(['--json', '--baseline', '--files', '--text-only', '--all', '--help', '--diff', '--list', '--session-start']);
// The options each subcommand reads. One it does not read is a usage error, not a silence: an option accepted and
// ignored would let a reader believe it had an effect.
const OPTIONS = {
  near: ['--json'], index: ['--json', '--ledger'], check: ['--json'], 'spec-check': ['--json', '--all', '--ledger'],
  append: ['--json', '--ledger', '--title', '--issue', '--principle', '--edge', '--body', '--prefix', '--addendum', '--text', '--baseline'],
  query: ['--json', '--ledger'], governs: ['--json', '--ledger'], principles: ['--json', '--ledger'], status: ['--json', '--ledger', '--session-start'],
  diff: ['--json', '--ledger', '--files'], vendor: ['--json'], constitute: ['--json', '--answers', '--target'], intake: ['--json'],
  gate: ['--json', '--session', '--diff'], verdict: ['--json', '--session', '--hash', '--failures', '--reason'], protocol: ['--json'], pack: ['--json', '--list'], transcript: ['--json', '--last'],
  stop: ['--json', '--session', '--wait', '--permission', '--judge'],
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
// The core's trail (D25): with DOCKET_TRAIL set, each run of the core in a project that has a .docket/ appends one
// line there — the time and the command — so a measurement can read what a judge ran when its host keeps no
// transcript of it. Off by default; a failure to write is not the command's failure.
function leaveTrail() {
  if (!process.env.DOCKET_TRAIL) return;
  try {
    const d = path.join(stopRoot(process.cwd()), '.docket');         // with the state it measures (D28)
    if (isDir(d)) { fs.appendFileSync(path.join(d, 'trail.log'), new Date().toISOString() + ' ' + process.argv.slice(2).map(a => a.length > 40 /* what ran, not a body (D14's addendum) */ ? a.slice(0, 40) + '…' : a).join(' ').replace(/\s+/g, ' ') + '\n'); TRAIL = path.join(d, 'trail.log'); }
  } catch (e) { /* the trail is the measurement's; the command runs whatever it does */ }
}
function main() {
  leaveTrail();
  const argv = parseArgv(process.argv.slice(2));
  if (argv.raw.includes('--help')) { out(USAGE); return 0; }
  const sub = argv._[0];
  const table = { near, index: indexOf_, check, 'spec-check': specCheck, append, query, governs, principles, status, diff, vendor, constitute, intake, gate, verdict, protocol, pack, transcript, stop };
  if (!sub) return witness(argv);
  if (sub === 'help' || sub === '-h') { out(USAGE); return 0; }
  if (!Object.prototype.hasOwnProperty.call(table, sub)) die('docket: unknown subcommand "' + sub + '"\n\n' + USAGE, 2);   // `constructor` is no subcommand
  const allowed = OPTIONS[sub] || [];
  for (let i = 0; i < argv.raw.length; i++) {
    const a = argv.raw[i];
    if (sub === 'check' && a === '--ledger') { i++; continue; }          // check refuses --ledger itself, naming the subcommands that take it
    if (a.startsWith('--') && a !== '--help' && !allowed.includes(a)) die(sub + ': ' + a + ' is not an option of ' + sub + '; its options are ' + (allowed.join(', ') || 'none'), 2);
    if (TAKES_VALUE.has(a)) i++;                                        // the value after a flag is a value, whatever it looks like
  }
  return table[sub](argv);
}
// The walk's bound is thrown, so that a command that reads a tree past it as ungoverned can; any other refuses here, exit 2,
// the bound named (FORMAT.md 1), as a diff the gate cannot read whole is refused (FORMAT.md 16). exitCode, not exit(): a
// piped stdout must flush first.
if (require.main === module) { try { process.exitCode = main(); } catch (e) { if (e && (e.walkBound || e.refusal)) die(e.message, 2); throw e; } }
module.exports = { parseLedger, titleOf, findLedger, projectRoot, contrast, luminance, VERBS, ADVERBS };
