import {
  type Entry,
  isMeal,
  type Meal,
  type Nutrients,
  recipePerServing,
  roundServings,
  scaleNutrients,
} from '@/domain/nutrition'

import { dayId } from './dayId'
import type { LocalDb } from './db'
import { recipeIngredients } from './foods'
import { type Clock, softDelete, writeRow } from './repository'
import { daysSpec, type FoodRow, type LogEntryRow, logEntriesSpec, type RecipeRow } from './tables'

export type LoggedEntry = Entry & { id: string }

type Target = { date: string; meal: Meal }

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
      // The columns hold three decimals.
      kcal_per_serving: Math.round(fields.perServing.kcal * 1000) / 1000,
      protein_g_per_serving: Math.round(fields.perServing.proteinG * 1000) / 1000,
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
    perServing: { kcal: food.kcal, proteinG: food.protein_g },
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
): Promise<void> => {
  const row = logEntriesSpec.parse(await db.rows('log_entries').get(id))
  if (!row) return
  const rounded = roundServings(servings)
  const perServing = { kcal: row.kcal_per_serving, proteinG: row.protein_g_per_serving }
  const nutrients = scaleNutrients(perServing, rounded)
  await writeRow(
    db,
    logEntriesSpec,
    { ...row, servings: rounded, kcal: nutrients.kcal, protein_g: nutrients.proteinG },
    clock,
  )
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
    const sources = (await liveRowsOn(db, from.date)).filter((row) => row.meal === from.meal)
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
          perServing: { kcal: row.kcal_per_serving, proteinG: row.protein_g_per_serving },
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
