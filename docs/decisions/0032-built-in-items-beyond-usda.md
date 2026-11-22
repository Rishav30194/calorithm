# 0032. Built-in items beyond USDA: CoFID values and labelled estimates

- **Status:** Accepted
- **Date:** 2026-11-22
- **Supersedes:** none

## Context

The built-in list comes from USDA FoodData Central (decision 0027), which lacks common Indian
spices: garam masala, chaat masala, curry leaves, black salt, amchur, ajwain, kalonji, and
hing. A teaspoon of any of them is under 10 kcal, but the user wants them findable. India's
own tables (IFCT 2017) state no reuse licence, so they can't be copied into a public app.

## Decision

Items USDA doesn't have live in `scripts/catalog/other.json` with per-100 g values and a
recorded source, and the build adds them to the list:

- **CoFID 2021** (the UK's composition dataset, Open Government Licence v3.0) for garam
  masala and curry leaves. The picker credits it with the licence's attribution statement.
- **Black salt** takes USDA table salt's values (none), which is exact for a mineral salt.
- **Estimates**, approved by the user on 2026-11-22: amchur from USDA raw mango dried to 8%
  water, ajwain from caraway seed, kalonji from cumin seed, and chaat masala from a usual mix
  of USDA spices. Their names end "(estimate)", so the label follows a copied food and its
  log entries, and each records its basis.
- **Hing** stays out: CoFID gives its protein and fat but not its energy or carbs.

## Alternatives

| Option | Why not |
|---|---|
| Copy IFCT 2017 values | No reuse licence is stated |
| Estimate garam masala from its spices | CoFID has values from literature sources |
| Leave the gaps for users to fill | The user asked for these spices; most have an open or derivable value |
| Mark estimates only in the data | The name is what a log entry keeps and what the user sees |

## Consequences

- `CatalogFood.source` is a USDA id, a CoFID food code, or an estimate's basis.
- `node scripts/build-catalog.mjs --keep-usda` rebuilds the list from `other.json` without
  the USDA downloads.
- Ajwain, kalonji, and amchur are stand-ins, not measurements; revisit if an openly
  licensed source measures them, or if IFCT states reuse terms.
