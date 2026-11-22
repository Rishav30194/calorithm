# 0027. Built-in foods from USDA FoodData Central

- **Status:** Accepted
- **Date:** 2026-11-22
- **Supersedes:** none

## Context

Phase 10 adds a built-in list of common Indian groceries, dishes, and gym foods, so they can
be picked without typing their numbers. The user eats mostly Indian food and doesn't want a
bulk database, beef, or pork. The values must come from a source the app may ship.

## Decision

A curated list of 192 foods, each pinned to a USDA FoodData Central food: SR Legacy for
groceries and FNDDS 2021-2023 for prepared dishes. USDA's data is public domain (CC0), and
the app credits it. `scripts/build-catalog.mjs` turns `scripts/catalog/items.json` and USDA's
CSV downloads into `src/data/catalog/foods.json`, using USDA's own portion weights for
servings where it has one, and 100 g otherwise.

## Alternatives

| Option | Why not |
|---|---|
| Indian Food Composition Tables 2017 (NIN) | Its copyright page forbids reuse in a product without NIN's written permission |
| Indian Nutrient Databank (INDB, 2024) | About 1,000 Indian recipes, but no license is published, and its recipes build on IFCT values; it needs the authors' permission first |
| All of USDA | Hundreds of thousands of foods, mostly irrelevant to the user, and far too large to load on a phone |

## Consequences

- Some Indian foods have no USDA match and are left out; `docs/catalog.md` lists them.
- A few values are USDA's generic food, not the Indian product: paneer (FNDDS) has 22.5 g
  carbs per 100 g, where Indian labels show about 2 g. Picking an item copies it into the
  user's foods, where it can be corrected.
- USDA uses food-specific energy factors, so kcal for fruit and vegetables is below
  4 × protein + 4 × carbs + 9 × fat; the catalog test allows for that.
- Revisit if INDB's authors grant permission, which would add foods USDA lacks, such as poha,
  khichdi, and dhokla.
