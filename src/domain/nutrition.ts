export const meals = ['breakfast', 'lunch', 'dinner', 'snacks'] as const

export type Meal = (typeof meals)[number]

export const isMeal = (value: string): value is Meal => (meals as readonly string[]).includes(value)

export type Nutrients = { kcal: number; proteinG: number }

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
}

// Rounds half away from zero. toPrecision first removes float noise such as
// 1.005 * 100 = 100.49999999999999, which would otherwise round down.
const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals
  const scaled = Number((Math.abs(value) * factor).toPrecision(12))
  // Adding 0 turns -0 into 0.
  return (Math.sign(value) * Math.round(scaled)) / factor + 0
}

// The column types: kcal integer, protein numeric(…, 1), servings numeric(…, 2).
export const roundKcal = (kcal: number): number => roundTo(kcal, 0)
export const roundProtein = (grams: number): number => roundTo(grams, 1)
export const roundServings = (servings: number): number => roundTo(servings, 2)

const rounded = ({ kcal, proteinG }: Nutrients): Nutrients => ({
  kcal: roundKcal(kcal),
  proteinG: roundProtein(proteinG),
})

const exactSum = (items: readonly Nutrients[]): Nutrients =>
  items.reduce(
    (total, item) => ({
      kcal: total.kcal + item.kcal,
      proteinG: total.proteinG + item.proteinG,
    }),
    { kcal: 0, proteinG: 0 },
  )

export const scaleNutrients = (perServing: Nutrients, servings: number): Nutrients =>
  rounded({ kcal: perServing.kcal * servings, proteinG: perServing.proteinG * servings })

export type Ingredient = { perServing: Nutrients; servings: number }

const exactRecipeTotals = (ingredients: readonly Ingredient[]): Nutrients =>
  exactSum(
    ingredients.map(({ perServing, servings }) => ({
      kcal: perServing.kcal * servings,
      proteinG: perServing.proteinG * servings,
    })),
  )

export const recipeTotals = (ingredients: readonly Ingredient[]): Nutrients =>
  rounded(exactRecipeTotals(ingredients))

// Scales the exact totals and rounds once, so half a recipe isn't half of a rounded number.
export const recipeEntryNutrients = (
  ingredients: readonly Ingredient[],
  recipeServings: number,
  servingsLogged: number,
): Nutrients => {
  const share = servingsLogged / recipeServings
  const total = exactRecipeTotals(ingredients)
  return rounded({ kcal: total.kcal * share, proteinG: total.proteinG * share })
}

export const sumNutrients = (items: readonly Nutrients[]): Nutrients => rounded(exactSum(items))

export const totalsByMeal = (
  entries: readonly Pick<Entry, 'meal' | 'kcal' | 'proteinG'>[],
): Record<Meal, Nutrients> => {
  const forMeal = (meal: Meal) => sumNutrients(entries.filter((entry) => entry.meal === meal))
  return {
    breakfast: forMeal('breakfast'),
    lunch: forMeal('lunch'),
    dinner: forMeal('dinner'),
    snacks: forMeal('snacks'),
  }
}

export type Pick_ = { source: Source; name: string; servings: number; count: number }

// The foods and recipes logged most often, each once, with the name and servings from the
// latest time it was logged. Ties go to the most recent, then to the name.
export const mostUsed = (entries: readonly Entry[], limit: number): Pick_[] => {
  const bySource = new Map<string, { latest: Entry; count: number }>()
  for (const entry of entries) {
    const key = `${entry.source.kind}:${entry.source.id}`
    const seen = bySource.get(key)
    if (!seen) {
      bySource.set(key, { latest: entry, count: 1 })
    } else {
      seen.count += 1
      if (entry.date > seen.latest.date) seen.latest = entry
    }
  }
  return [...bySource.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        // YYYY-MM-DD strings sort as dates.
        b.latest.date.localeCompare(a.latest.date) ||
        a.latest.name.localeCompare(b.latest.name),
    )
    .slice(0, Math.max(0, limit))
    .map(({ latest, count }) => ({
      source: latest.source,
      name: latest.name,
      servings: latest.servings,
      count,
    }))
}

// The entries to add when copying one meal to another day or meal, values as they were.
export const copyMeal = (
  entries: readonly Entry[],
  meal: Meal,
  to: { date: string; meal: Meal },
): Entry[] => entries.filter((entry) => entry.meal === meal).map((entry) => ({ ...entry, ...to }))
