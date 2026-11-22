# 0030. Reading nutrition labels on the device, leaving doubtful values empty

- **Status:** Accepted
- **Date:** 2026-11-22
- **Supersedes:** none

## Context

Phase 13 fills the food form from a pack's nutrition label, for packs with no barcode or
none Open Food Facts knows. Labels come in several layouts (US Nutrition Facts, EU and UK
tables, Indian FSSAI tables), often with two columns, kJ beside kcal, and sub-rows such as
sugars and saturates. Text recognition adds slips such as a letter O for a zero. A wrong
number that looks right is worse than an empty field, because the user may not check it.

## Decision

A pure parser, `parseNutritionLabel` in `src/domain/label.ts`, reads label text into a basis
(100 g, 100 ml, or the label's serving weight) and kcal, protein, carbs, and fat. It reads a
row only when the nutrient's name comes before its first number, prefers the per-100 column,
converts kJ to kcal only when the label gives no kcal, skips sub-rows, % Daily Value, and
footnotes, and leaves empty any value it can't read: a "<" amount, a row missing the chosen
column, or a value no food can have (over 100 g per 100 g, or over 900 kcal per 100 g). Text
comes from the user pasting it, through the iPhone's Live Text, or from on-device text
recognition (phase 13, PR 2). Nothing is sent to a server, and no AI reads the label.

## Alternatives

| Option | Why not |
|---|---|
| A vision AI model reads the photo | The user wants no AI in logging, and a static app can't hide an API key |
| A server-side text recognition API | Sends photos of the user's food off the device, and needs a key |
| Guess unreadable values from the others | A plausible wrong number is worse than an empty field |
| Only text recognition, no paste | Paste costs no download and works with the iPhone's own text reader |

## Consequences

- The form is filled for checking, never saved without the user's tap; the message says
  which values were left empty.
- A label whose rows are split from their numbers, as text recognition sometimes reads a
  table column by column, leaves those values empty. PR 2's tests with real photos show how
  often.
- Revisit if text recognition proves too weak on the user's labels.
