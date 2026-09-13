# DECISIONS.md — Lot

The ledger of the Lot: a page where a typed thought becomes a framed note at
once, and structure is asserted afterwards by where things sit. Where `PRD.md`
or `UIUX.md` rules, it is followed; this file records the one place they
conflict (A) and every choice they leave silent (R), each resolved against the
principles in `PRD §1`.

| Question | Authority |
|---|---|
| What the Lot is for | `PRD.md` |
| What it renders, in what values | `UIUX.md` |
| Why it does what it does, and what was already tried | **this file** |

**Append only.** A ruling is superseded, waived or reversed by a later ruling
that names it; it is never edited away. A ruling whose reason no longer holds
gets a dated addendum first.

**Header contract.** Entries from R8 on satisfy the header contract.
<!-- docket: contract from R8 -->
<!-- docket: bare-cites app.js=3 -->

---

## A. Resolved conflict

### A1. Long-press menu order (PRD §1 and UIUX §2 disagree on the first item)
PRD §1 puts capture first; UIUX §2 puts the colour swatches first. The menu opens on capture, because the principle outranks the rendering note. Reason: capture precedes structure.

## R. Rulings

### R1. Capture before shape
Any typed thought becomes a framed note the instant it is typed; shape, size and place are asserted afterwards. Reason: capture precedes structure, and a frame that waits for a shape loses the thought.

### R2. Positions are never mutated on read
Rendering reads a note's logical position and writes nothing back; only a drag writes. Reason: positions are permanent, and a render pass that rounds and stores would drift a note a pixel per frame.
> Addendum 2026-09-11: the render pass now rounds to the device pixel for drawing only; reading still writes nothing, and the rule stands as written.

### R3. Fold similarity, by shape and by size (issue #4)
Notes fold together by shape and by size: two notes fold when their frames are alike in both. Reason: one similarity law, not two, keeps the fold predictable.

### R4. Fold similarity: shape held, size uniform (supersedes R3)
The shape clause of R3 stands; only its size clause is superseded: within a fold every note takes the fold's size, so size never decides membership. Reason: a fold that admits by size splits when a note is resized, and a split fold is a lost relation.

### R5. Three tabs because the lot has three sections (issue #8)
The parking lot shows three tabs, one per section, and the count is the section count in `app.js`. Reason: one tab per section and no more, so the tabs are the sections and nothing has to be learned.

### R6. The toolbar replaces the long-press menu (issue #12)
On the spatial plane a toolbar above the selection carries every action the long-press menu carried, and the menu is gone there. Reason: zero cognitive tax; a menu that must be held open hides the note it acts on.

### R7. The relational plane keeps its long-press menu (issue #14)
This partially reverses R6 (relational plane only): where notes are related by lines rather than placed, the long-press menu stays, because a toolbar above a line has nothing to sit above. The spatial plane keeps the toolbar. Reason: the toolbar's reason (it shows the note it acts on) does not hold for a line.

### R8. The frame that was never typed into is discarded on blur, and the capture rule that frames a thought the instant it is typed does not apply to it: an empty frame is not a thought, it is a tap that landed nowhere, and keeping it would fill the lot with blank rectangles that assert nothing and cost a read each; the discard happens on blur rather than on the next tap so that a thought typed after a pause is still framed, and the frame is discarded rather than hidden so that the lot never carries invisible weight; the rule holds at every viewport width and at every note count, and the one measurement underneath it is that a blank frame costs the same read as a full one while carrying nothing, so the count of blank frames a person will tolerate is zero; this waives the capture rule for exactly that case and for no other, and the three rulings around it keep thei (issue #16; waives R1)
Principle: Capture precedes structure.
An empty frame is discarded on blur. This waives R1 for a frame never typed into, and only for that case; R1 holds for every frame that received a character. Reason: a blank frame costs a read and carries nothing, so the number of blank frames a person will tolerate is zero.
