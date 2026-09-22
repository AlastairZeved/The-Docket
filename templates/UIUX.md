# UIUX.md — {{name}}

The rendering authority: every design value — a colour, a size, a duration, a
floor — lives here and nowhere else, and code cites it as `UIUX §x`. The
witness reads two kinds of row in this file: a token row, whose first two
cells are a `--token` and a hex colour, checked against every CSS declaration
of that token; and a contrast row, naming two tokens and an `N:1` ratio,
recomputed from their hexes. A table with no rows is checked and found empty;
a value stated in prose is not checked at all.

## §2 Design tokens

| Token | Value | Use |
|---|---|---|

| Pair | Ratio |
|---|---|

## §4.5 The minimum

State each floor as one sentence carrying its number, so that code can cite
`UIUX §4.5` and a reader can check the number against the screen.
