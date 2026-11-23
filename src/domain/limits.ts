import { type Nutrients, scaleNutrients } from './nutrition'

// The database's range checks on foods, recipes, recipe items, and log entries, in one place.
// The database is the authority: src/data/limits.integration.test.ts fails when these stop
// matching its CHECK constraints, so change both in the same PR.
export const limits = {
  // Name and unit lengths, in characters.
  nameLength: 100,
  unitLength: 20,
  // Servings on a log entry, a recipe, or a recipe item; at least 0.01, since two decimals
  // are stored.
  servings: 1_000,
  // One serving of a food.
  food: { servingSize: 10_000, kcal: 10_000, grams: 1_000 },
  // A log entry's totals, and the values per serving it stores.
  entry: { kcal: 100_000, grams: 10_000 },
} as const

const MIN_SERVINGS = 0.01

const gramsFit = (grams: number | null): boolean => grams === null || grams <= limits.entry.grams

const nutrientsFit = ({ kcal, proteinG, carbsG, fatG }: Nutrients): boolean =>
  kcal <= limits.entry.kcal && gramsFit(proteinG) && gramsFit(carbsG) && gramsFit(fatG)

// True when an entry of these servings would pass the database's checks, so the log refuses
// it up front instead of saving one that sync refuses later.
export const entryFits = (perServing: Nutrients, servings: number): boolean =>
  servings >= MIN_SERVINGS &&
  servings <= limits.servings &&
  nutrientsFit(perServing) &&
  nutrientsFit(scaleNutrients(perServing, servings))
