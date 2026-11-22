# 0031. An amount step for foods measured by weight

- **Status:** Accepted
- **Date:** 2026-11-22
- **Supersedes:** none

## Context

Phase 3 made a saved food two taps from the log screen: **Add**, then the food, which logs
one serving. Foods measured by weight, such as chicken breast at 100 g, are rarely eaten in
exactly one serving; the user eats 70 g or 150 g and had to work out 0.7 or 1.5 servings
afterwards in the entry dialog. Log entries also didn't record the serving they were logged
with, so grams couldn't be shown reliably once the food changed.

## Decision

A food whose serving is a weight or volume (unit g, gm, gms, gram, grams, kg, ml, l, litre,
or liter) opens an amount step when picked, prefilled with one serving, or with the servings
last logged for a recent pick. It
has **Amount (g)** linked to **Servings** and a live preview of the four values. Count foods
(1 roti, "tsp (3 g)") still log in one tap. Each log entry copies the food's serving size
and unit (nullable `serving_size` and `serving_unit`, schema version 3), and the entry
dialog offers grams whenever that serving has a weight, including a bracketed one.

## Alternatives

| Option | Why not |
|---|---|
| Ask for every food | An extra tap on every log, including re-logging the same roti |
| Keep one tap; set grams afterwards in the entry dialog | Two dialogs for the most common case of a weighed food |
| Work out grams from the food's current serving | Wrong once the food's serving is edited |
| Store grams instead of servings | Every total, copy, and recipe uses servings; a second unit would split them |

## Consequences

- A weighed food takes three taps, against phase 3's two; the user chose this on 2026-11-22.
- Servings keep two decimals, so grams round to the nearest step: 1 g for a 100 g serving,
  0.03 g for a 3 g one.
- Entries logged before 0.10.0 have no serving and show servings only.
- A recent pick carries over its servings, not its grams: if the food's serving changed
  since, the prefilled grams follow the new serving.
- A food saved and logged from a barcode scan or a nutrition label logs one serving without
  the amount step; the entry can then be edited in grams.
- Revisit if the extra tap proves slower than the arithmetic it saves.
