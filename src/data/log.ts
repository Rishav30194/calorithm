import { addDays } from '@/domain/dates'
import {
  type Entry,
  isMeal,
  type Meal,
  mostUsed,
  type Nutrients,
  type QuickPick,
  recipePerServing,
  roundServings,
  type Source,
  scaleNutrients,
} from '@/domain/nutrition'

import { dayId } from './dayId'
import type { LocalDb } from './db'
import { foodNutrients, recipeIngredients } from './foods'
import { type Clock, softDelete, writeRow } from './repository'
import {
  daysSpec,
  type FoodRow,
  foodsSpec,
  type LogEntryRow,
  logEntriesSpec,
  type RecipeRow,
  recipesSpec,
} from './tables'

export type LoggedEntry = Entry & { id: string }

type Target = { date: string; meal: Meal }

const thousandths = (value: number): number => Math.round(value * 1000) / 1000

const optionalThousandths = (value: number | null): number | null =>
  value === null ? null : thousandths(value)

// The values stored per serving when the entry was logged.
const perServingOf = (row: LogEntryRow): Nutrients => ({
  kcal: row.kcal_per_serving,
  proteinG: row.protein_g_per_serving,
  carbsG: row.carbs_g_per_serving,
  fatG: row.fat_g_per_serving,
})

const newEntry = (
  db: LocalDb,
  clock: Clock,
  userId: string,
  fields: Target & {
    foodId: string | null
    recipeId: string | null
    name: string
    servings: number
    // Unrounded, so changing the servings later rescales exactly.
    perServing: Nutrients
    loggedAt?: string
  },
): Promise<LogEntryRow> => {
  const nutrients = scaleNutrients(fields.perServing, fields.servings)
  return writeRow(
    db,
    logEntriesSpec,
    {
      id: crypto.randomUUID(),
      user_id: userId,
      updated_at: '',
      client_updated_at: '',
      deleted_at: null,
      schema_version: 1,
      date: fields.date,
      meal: fields.meal,
      food_id: fields.foodId,
      recipe_id: fields.recipeId,
      servings: fields.servings,
      name: fields.name,
      kcal: nutrients.kcal,
      protein_g: nutrients.proteinG,
      carbs_g: nutrients.carbsG,
      fat_g: nutrients.fatG,
      // The columns hold three decimals.
      kcal_per_serving: thousandths(fields.perServing.kcal),
      protein_g_per_serving: thousandths(fields.perServing.proteinG),
      carbs_g_per_serving: optionalThousandths(fields.perServing.carbsG),
      fat_g_per_serving: optionalThousandths(fields.perServing.fatG),
      logged_at: fields.loggedAt ?? clock().toISOString(),
    },
    clock,
  )
}

// Copies the food's values now, so editing the food later never changes this entry.
export const logFood = (
  db: LocalDb,
  clock: Clock,
  userId: string,
  { date, meal, food, servings }: Target & { food: FoodRow; servings: number },
): Promise<LogEntryRow> => {
  const rounded = roundServings(servings)
  return newEntry(db, clock, userId, {
    date,
    meal,
    foodId: food.id,
    recipeId: null,
    name: food.name,
    servings: rounded,
    perServing: foodNutrients(food),
  })
}

export const logRecipe = async (
  db: LocalDb,
  clock: Clock,
  userId: string,
  { date, meal, recipe, servings }: Target & { recipe: RecipeRow; servings: number },
): Promise<LogEntryRow> => {
  const rounded = roundServings(servings)
  const ingredients = await recipeIngredients(db, recipe.id)
  return newEntry(db, clock, userId, {
    date,
    meal,
    foodId: null,
    recipeId: recipe.id,
    name: recipe.name,
    servings: rounded,
    perServing: recipePerServing(ingredients, recipe.servings),
  })
}

const toEntry = (row: LogEntryRow): LoggedEntry | null => {
  // A meal this version doesn't know, from a newer app version, is left out rather than guessed.
  if (!isMeal(row.meal)) return null
  const source = row.food_id
    ? ({ kind: 'food', id: row.food_id } as const)
    : row.recipe_id
      ? ({ kind: 'recipe', id: row.recipe_id } as const)
      : null
  if (!source) return null
  return {
    id: row.id,
    date: row.date,
    meal: row.meal,
    source,
    name: row.name,
    servings: row.servings,
    kcal: row.kcal,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
  }
}

const liveRowsOn = async (db: LocalDb, date: string): Promise<LogEntryRow[]> =>
  (await db.rows('log_entries').where('date').equals(date).toArray())
    .flatMap((raw) => {
      const row = logEntriesSpec.parse(raw)
      return row && row.deleted_at === null ? [row] : []
    })
    // In the order they were logged; ids break ties so the order never shifts.
    .sort((a, b) => a.logged_at.localeCompare(b.logged_at) || a.id.localeCompare(b.id))

export const entriesOn = async (db: LocalDb, date: string): Promise<LoggedEntry[]> =>
  (await liveRowsOn(db, date)).flatMap((row) => {
    const entry = toEntry(row)
    return entry ? [entry] : []
  })

// Rescales from the per-serving values stored when the entry was logged, so neither rounding
// nor a food edited since leaks in.
export const changeServings = async (
  db: LocalDb,
  clock: Clock,
  id: string,
  servings: number,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> => {
  const row = logEntriesSpec.parse(await db.rows('log_entries').get(id))
  if (!row || row.deleted_at !== null) return { ok: false, reason: 'not_found' }
  const rounded = roundServings(servings)
  const nutrients = scaleNutrients(perServingOf(row), rounded)
  await writeRow(
    db,
    logEntriesSpec,
    {
      ...row,
      servings: rounded,
      kcal: nutrients.kcal,
      protein_g: nutrients.proteinG,
      carbs_g: nutrients.carbsG,
      fat_g: nutrients.fatG,
    },
    clock,
  )
  return { ok: true }
}

export const removeEntry = (db: LocalDb, clock: Clock, id: string): Promise<void> =>
  softDelete(db, logEntriesSpec, id, clock)

// Copies one meal's entries, values as they were, to another day and meal in one transaction.
// Each copy is logged a millisecond after the one before, so the meal keeps its order.
export const copyMealTo = (
  db: LocalDb,
  clock: Clock,
  userId: string,
  { from, to }: { from: Target; to: Target },
): Promise<LogEntryRow[]> =>
  db.transaction('rw', db.rows('log_entries'), db.outbox, async () => {
    // The same rows the day's view and the copy preview count: a row with no food or recipe,
    // or a meal this version doesn't know, is never copied.
    const sources = (await liveRowsOn(db, from.date)).filter(
      (row) => row.meal === from.meal && toEntry(row) !== null,
    )
    const start = clock().getTime()
    const written: LogEntryRow[] = []
    for (const [index, row] of sources.entries()) {
      written.push(
        await newEntry(db, clock, userId, {
          ...to,
          foodId: row.food_id,
          recipeId: row.recipe_id,
          name: row.name,
          servings: row.servings,
          perServing: perServingOf(row),
          loggedAt: new Date(start + index).toISOString(),
        }),
      )
    }
    return written
  })

export const setDayComplete = async (
  db: LocalDb,
  clock: Clock,
  userId: string,
  date: string,
  complete: boolean,
): Promise<void> => {
  const id = await dayId(userId, date)
  const existing = daysSpec.parse(await db.rows('days').get(id))
  await writeRow(
    db,
    daysSpec,
    {
      id,
      user_id: userId,
      updated_at: '',
      client_updated_at: '',
      schema_version: 1,
      ...existing,
      // Marking a day another device deleted brings it back.
      deleted_at: null,
      date,
      complete,
    },
    clock,
  )
}

export const dayComplete = async (db: LocalDb, userId: string, date: string): Promise<boolean> => {
  const day = daysSpec.parse(await db.rows('days').get(await dayId(userId, date)))
  return day !== null && day.deleted_at === null && day.complete
}

export type LogSourceResult = { ok: true; row: LogEntryRow } | { ok: false; reason: 'not_found' }

// Logs a food or recipe by id with its current values, as the picker does.
export const logSource = async (
  db: LocalDb,
  clock: Clock,
  userId: string,
  { date, meal, source, servings }: Target & { source: Source; servings: number },
): Promise<LogSourceResult> => {
  if (source.kind === 'food') {
    const food = foodsSpec.parse(await db.rows('foods').get(source.id))
    if (!food || food.deleted_at !== null) return { ok: false, reason: 'not_found' }
    return { ok: true, row: await logFood(db, clock, userId, { date, meal, food, servings }) }
  }
  const recipe = recipesSpec.parse(await db.rows('recipes').get(source.id))
  if (!recipe || recipe.deleted_at !== null) return { ok: false, reason: 'not_found' }
  return { ok: true, row: await logRecipe(db, clock, userId, { date, meal, recipe, servings }) }
}

// Every entry from the first day to the last, inclusive, by day and then in logged order.
export const entriesBetween = async (
  db: LocalDb,
  first: string,
  last: string,
): Promise<LoggedEntry[]> =>
  (await db.rows('log_entries').where('date').between(first, last, true, true).toArray())
    .flatMap((raw) => {
      const row = logEntriesSpec.parse(raw)
      return row && row.deleted_at === null ? [row] : []
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.logged_at.localeCompare(b.logged_at) ||
        a.id.localeCompare(b.id),
    )
    .flatMap((row) => {
      const entry = toEntry(row)
      return entry ? [entry] : []
    })

export type QuickPicks = { today: QuickPick[]; yesterday: QuickPick[]; mostUsed: QuickPick[] }

const MOST_USED_DAYS = 60
const MOST_USED_LIMIT = 10

// The picker's one-tap rows. Archived or deleted foods and recipes are left out, and each
// shows its current name.
export const quickPicks = async (db: LocalDb, today: string): Promise<QuickPicks> => {
  const yesterday = addDays(today, -1)
  const entries = await entriesBetween(db, addDays(today, -(MOST_USED_DAYS - 1)), today)
  const names = new Map<string, string>()
  for (const raw of await db.rows('foods').toArray()) {
    const food = foodsSpec.parse(raw)
    if (food && food.deleted_at === null && food.archived_at === null) {
      names.set(`food:${food.id}`, food.name)
    }
  }
  for (const raw of await db.rows('recipes').toArray()) {
    const recipe = recipesSpec.parse(raw)
    if (recipe && recipe.deleted_at === null && recipe.archived_at === null) {
      names.set(`recipe:${recipe.id}`, recipe.name)
    }
  }
  const available = (picks: QuickPick[]): QuickPick[] =>
    picks.flatMap((pick) => {
      const name = names.get(`${pick.source.kind}:${pick.source.id}`)
      return name === undefined ? [] : [{ ...pick, name }]
    })
  const on = (date: string) => entries.filter((entry) => entry.date === date)
  return {
    today: available(mostUsed(on(today), Number.POSITIVE_INFINITY)),
    yesterday: available(mostUsed(on(yesterday), Number.POSITIVE_INFINITY)),
    mostUsed: available(mostUsed(entries, Number.POSITIVE_INFINITY)).slice(0, MOST_USED_LIMIT),
  }
}
