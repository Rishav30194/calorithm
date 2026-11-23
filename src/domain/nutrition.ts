import { daysBetween } from './dates'

export const meals = ['breakfast', 'lunch', 'dinner', 'snacks'] as const

export type Meal = (typeof meals)[number]

export const isMeal = (value: string): value is Meal => (meals as readonly string[]).includes(value)

// Carbs and fat are null when not set, as on foods saved before they existed (decision 0025).
export type Nutrients = {
  kcal: number
  proteinG: number
  carbsG: number | null
  fatG: number | null
}

// The check-in sets kcal and protein targets only; carbs and fat have none (decision 0025).
export type DailyTargets = Pick<Nutrients, 'kcal' | 'proteinG'>

export type Source = { kind: 'food' | 'recipe'; id: string }

// A log entry as the calculations see it: values were copied when it was logged.
export type Entry = {
  date: string
  meal: Meal
  source: Source
  name: string
  servings: number
  kcal: number
  proteinG: number
  carbsG: number | null
  fatG: number | null
}

// Rounds half away from zero. toPrecision first removes float noise such as
// 1.005 * 100 = 100.49999999999999, which would otherwise round down.
export const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals
  const scaled = Number((Math.abs(value) * factor).toPrecision(12))
  // Adding 0 turns -0 into 0.
  return (Math.sign(value) * Math.round(scaled)) / factor + 0
}

// The column types: kcal integer, protein numeric(…, 1), servings numeric(…, 2).
export const roundKcal = (kcal: number): number => roundTo(kcal, 0)
export const roundProtein = (grams: number): number => roundTo(grams, 1)
export const roundServings = (servings: number): number => roundTo(servings, 2)
// Carbs and fat, stored like protein.
export const roundGrams = (grams: number): number => roundTo(grams, 1)

const roundOptional = (grams: number | null): number | null =>
  grams === null ? null : roundGrams(grams)

const rounded = ({ kcal, proteinG, carbsG, fatG }: Nutrients): Nutrients => ({
  kcal: roundKcal(kcal),
  proteinG: roundProtein(proteinG),
  carbsG: roundOptional(carbsG),
  fatG: roundOptional(fatG),
})

// The known values added up, or not set when none is known (no values included), so meal
// totals add up to the day's total.
const sumKnown = (values: readonly (number | null)[]): number | null => {
  const known = values.filter((value) => value !== null)
  return known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0)
}

const exactSum = (items: readonly Nutrients[]): Nutrients => ({
  kcal: items.reduce((sum, item) => sum + item.kcal, 0),
  proteinG: items.reduce((sum, item) => sum + item.proteinG, 0),
  carbsG: sumKnown(items.map((item) => item.carbsG)),
  fatG: sumKnown(items.map((item) => item.fatG)),
})

const times = (grams: number | null, factor: number): number | null =>
  grams === null ? null : grams * factor

const exactScale = (perServing: Nutrients, servings: number): Nutrients => ({
  kcal: perServing.kcal * servings,
  proteinG: perServing.proteinG * servings,
  carbsG: times(perServing.carbsG, servings),
  fatG: times(perServing.fatG, servings),
})

export const scaleNutrients = (perServing: Nutrients, servings: number): Nutrients =>
  rounded(exactScale(perServing, servings))

// True when any item has carbs or fat not set, so a total of them is only partial.
export const missingCarbsOrFat = (items: readonly Pick<Nutrients, 'carbsG' | 'fatG'>[]): boolean =>
  items.some((item) => item.carbsG === null || item.fatG === null)

export type Ingredient = { perServing: Nutrients; servings: number }

// Unlike a day's total, a recipe is logged as one entry, so a partial sum of its carbs or fat
// would look complete. Any ingredient with them not set leaves the recipe's not set; no
// ingredients at all gives 0 g, like its kcal.
const allOrNothing = (values: readonly (number | null)[]): number | null =>
  values.some((value) => value === null)
    ? null
    : values.reduce<number>((sum, value) => sum + (value ?? 0), 0)

const exactRecipeTotals = (ingredients: readonly Ingredient[]): Nutrients => {
  const scaled = ingredients.map(({ perServing, servings }) => exactScale(perServing, servings))
  return {
    ...exactSum(scaled),
    carbsG: allOrNothing(scaled.map((item) => item.carbsG)),
    fatG: allOrNothing(scaled.map((item) => item.fatG)),
  }
}

export const recipeTotals = (ingredients: readonly Ingredient[]): Nutrients =>
  rounded(exactRecipeTotals(ingredients))

// One serving's share of the exact totals, unrounded, to store with an entry so it can be
// rescaled later without drift.
export const recipePerServing = (
  ingredients: readonly Ingredient[],
  recipeServings: number,
): Nutrients => {
  return exactScale(exactRecipeTotals(ingredients), 1 / recipeServings)
}

// Scales the exact totals and rounds once, so half a recipe isn't half of a rounded number.
export const recipeEntryNutrients = (
  ingredients: readonly Ingredient[],
  recipeServings: number,
  servingsLogged: number,
): Nutrients => scaleNutrients(recipePerServing(ingredients, recipeServings), servingsLogged)

export const sumNutrients = (items: readonly Nutrients[]): Nutrients => rounded(exactSum(items))

export const totalsByMeal = (
  entries: readonly Pick<Entry, 'meal' | 'kcal' | 'proteinG' | 'carbsG' | 'fatG'>[],
): Record<Meal, Nutrients> => {
  const forMeal = (meal: Meal) => sumNutrients(entries.filter((entry) => entry.meal === meal))
  return {
    breakfast: forMeal('breakfast'),
    lunch: forMeal('lunch'),
    dinner: forMeal('dinner'),
    snacks: forMeal('snacks'),
  }
}

export type QuickPick = { source: Source; name: string; servings: number; count: number }

export const sourceKey = (source: Source): string => `${source.kind}:${source.id}`

// A log counts 1 on the day and half as much every this many days older, so last month's
// habit outranks last year's.
const HALF_LIFE_DAYS = 30

// How much each food or recipe has been used up to `today`, weighting recent logs more.
// Entries after `today` don't count.
export const useScores = (entries: readonly Entry[], today: string): Map<string, number> => {
  const scores = new Map<string, number>()
  for (const entry of entries) {
    const age = daysBetween(entry.date, today)
    if (age < 0) continue
    const key = sourceKey(entry.source)
    scores.set(key, (scores.get(key) ?? 0) + 0.5 ** (age / HALF_LIFE_DAYS))
  }
  return scores
}

type Seen = { latest: Entry; count: number; order: number }

// Each source once, with the name and servings from its latest entry: the latest date, and
// on one date the later in the list, since entries come in the order they were logged.
const bySource = (entries: readonly Entry[]): Map<string, Seen> => {
  const seen = new Map<string, Seen>()
  entries.forEach((entry, order) => {
    const key = sourceKey(entry.source)
    const previous = seen.get(key)
    const count = (previous?.count ?? 0) + 1
    seen.set(
      key,
      !previous || entry.date >= previous.latest.date
        ? { latest: entry, count, order }
        : { ...previous, count },
    )
  })
  return seen
}

const toPick = ({ latest, count }: Seen): QuickPick => ({
  source: latest.source,
  name: latest.name,
  servings: latest.servings,
  count,
})

// The foods and recipes logged most, by use score, then the most recent, then the name.
export const mostUsed = (entries: readonly Entry[], today: string, limit: number): QuickPick[] => {
  const scores = useScores(entries, today)
  const scoreOf = (seen: Seen) => scores.get(sourceKey(seen.latest.source)) ?? 0
  return [...bySource(entries).values()]
    .sort(
      (a, b) =>
        scoreOf(b) - scoreOf(a) ||
        // YYYY-MM-DD strings sort as dates.
        b.latest.date.localeCompare(a.latest.date) ||
        a.latest.name.localeCompare(b.latest.name),
    )
    .slice(0, Math.max(0, limit))
    .map(toPick)
}

// The foods and recipes logged most recently, each once, newest first.
export const recentPicks = (entries: readonly Entry[], limit: number): QuickPick[] =>
  [...bySource(entries).values()]
    .sort((a, b) => b.latest.date.localeCompare(a.latest.date) || b.order - a.order)
    .slice(0, Math.max(0, limit))
    .map(toPick)

// How far back the meal list looks (phase 15).
const USUAL_DAYS = 60

// The foods and recipes logged most often in one meal over the last 60 days, by count, then
// by name, each with the servings last logged in that meal.
export const usualForMeal = (
  entries: readonly Entry[],
  meal: Meal,
  today: string,
  limit: number,
): QuickPick[] => {
  const inMeal = entries.filter((entry) => {
    const age = daysBetween(entry.date, today)
    return entry.meal === meal && age >= 0 && age < USUAL_DAYS
  })
  return [...bySource(inMeal).values()]
    .sort((a, b) => b.count - a.count || a.latest.name.localeCompare(b.latest.name))
    .slice(0, Math.max(0, limit))
    .map(toPick)
}

// Each ingredient's servings when `logged` servings of a recipe that makes `recipeServings`
// are logged as its ingredients (phase 16), to two decimals, and never below 0.01, the least
// an entry holds.
export const ingredientServings = (
  recipeServings: number,
  logged: number,
  items: readonly { servings: number }[],
): number[] =>
  items.map((item) => Math.max(0.01, roundServings((item.servings * logged) / recipeServings)))
