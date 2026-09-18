'use strict';
// app.js — the Lot: one page, framed notes, structure asserted after capture.
// Fixture for the witness; governed by ../DECISIONS.md (prefixes A, R).

const CAPTURE_AT_ONCE = true; // R1: capture before shape
const LOGICAL_W = 1440, LOGICAL_H = 2560;
let scale = 1, offX = 0, offY = 0;
const notes = new Map(); // R2: the map is read, never mutated in place

// The parking lot at the foot of the page has three sections, and one tab per section.

const SECTIONS = ['now', 'next', 'later']; // R5: three tabs because the lot has three sections
const TABS = SECTIONS.length; // R5: the tab count follows the section count


const MENU_ORDER = ['capture', 'colour', 'copy']; // A1: capture first in the long-press menu

const HIT_FLOOR = 44; // §4 minimum hit target, in CSS pixels

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function toLogical(clientX, clientY) {
  return { x: (clientX - offX) / scale, y: (clientY - offY) / scale };
}

function renderX(n) { return n.x * scale + offX; }
function renderY(n) { return n.y * scale + offY; }


function place(el, n) { el.style.left = renderX(n) + 'px'; el.style.top = renderY(n) + 'px'; } // R2: positions are never mutated on read


function selection() { return Array.from(notes.values()).filter(n => n.selected); }


function foldSize(sel) {
  let w = 0, h = 0;
  for (const n of sel) { w = Math.max(w, n.w); h = Math.max(h, n.h); }
  return { w, h };
}
function makeToolbar(sel) { // R6: the toolbar replaces the long-press menu
  const bar = document.createElement('div');
  bar.className = 'toolbar';
  const top = Math.min(...sel.map(n => n.y));
  const left = Math.min(...sel.map(n => n.x));
  bar.style.left = renderX({ x: left }) + 'px';
  const size = foldSize(sel); // R4: shape held, size uniform — the bar spans the fold's width
  bar.style.width = size.w * scale + 'px';
  bar.style.top = renderY({ y: top }) - 48 * scale + 'px';
  for (const action of ['fold', 'colour', 'copy', 'delete']) {
    const b = document.createElement('button');
    b.textContent = action;
    bar.appendChild(b);
  }
  bar.style.minHeight = HIT_FLOOR + 'px'; // UIUX §4.5 the minimum: every hit target is at least 44 px
  return bar;
}


function frame(text) {
  const el = document.createElement('div');
  el.textContent = text;







  el.classList.add('note');
  el.style.minWidth = 88 * scale + 'px';
  return el;
}


function plane() { return document.body.dataset.plane || 'spatial'; }



function openMenu(n, at) { // R7: the relational plane keeps its long-press menu
  if (plane() !== 'relational') return null;
  const m = document.createElement('ul');
  for (const item of MENU_ORDER) { const li = document.createElement('li'); li.textContent = item; m.appendChild(li); }
  m.style.left = at.x + 'px'; m.style.top = at.y + 'px';
  return m;
}



function alike(a, b) {
  return a.shape === b.shape;
}


function canFold(a, b) { return alike(a, b); } // R3: fold similarity — shape decides; size no longer does (R4)




function onBlur(n, el) { // R8: the blur handler owns the empty-frame rule
  if (el.textContent.trim() !== '') return;








  notes.delete(n.id); el.remove(); // R8: an empty frame is discarded on blur
}








function capture(text, at) {
  const n = { id: String(Date.now()), x: at.x, y: at.y, w: 220, h: 120, shape: 'card', selected: false };



  notes.set(n.id, n);




  const el = frame(text); // R1: framed the instant it is typed









  el.classList.add('note');
  document.getElementById('page').appendChild(el);








  place(el, n); // R2: read the position, write nothing
  return n;
}







function tabs() {
  const row = document.createElement('nav'); // R5: one row of tabs for the lot








  for (let i = 0; i < TABS; i++) { // R5: one tab per section
    const t = document.createElement('button'); t.textContent = SECTIONS[i]; row.appendChild(t);
  }
  return row;
}





function principlesBanner() { // R1: the banner states the first principle before the first note




  return 'capture precedes structure'; // PRD §1: the first principle, shown once at first launch
}



function relate(a, b) {
  const line = document.createElement('div');



  if (!canFold(a, b)) line.classList.add('dashed'); // R3: unlike shapes relate by a dashed line




  line.style.minHeight = HIT_FLOOR + 'px'; // §4 the line is a hit target too




  place(line, { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }); // R2 again: the line reads positions, writes none
  return line;
}

function ghost(el) {
  el.classList.add('note');




  el.style.minWidth = 88 + 'px'; // §4 minimum frame width
  return el;
}


function hideToolbar(bar) {




  bar.remove(); // R6: the toolbar, being the menu's replacement, is the only chrome to remove
}



function fit() {
  const vw = window.innerWidth, vh = window.innerHeight;
  scale = Math.min(vw / LOGICAL_W, vh / LOGICAL_H);
  offX = (vw - LOGICAL_W * scale) / 2;
  offY = (vh - LOGICAL_H * scale) / 2;
}




function boot() {
  fit();
  document.body.appendChild(tabs());
  window.addEventListener('resize', fit);
}





function save() {
  const out = [];
  for (const n of notes.values()) out.push({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, shape: n.shape });
  return JSON.stringify(out);
}



boot();

module.exports = { toLogical, renderX, renderY, makeToolbar, frame, capture, relate, tabs, fit, save, clamp };
