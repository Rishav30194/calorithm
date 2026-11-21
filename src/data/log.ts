import {
  copyMeal,
  type Entry,
  isMeal,
  type Meal,
  type Nutrients,
  recipeEntryNutrients,
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
    nutrients: Nutrients
  },
): Promise<LogEntryRow> =>
  writeRow(
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
      kcal: fields.nutrients.kcal,
      protein_g: fields.nutrients.proteinG,
    },
    clock,
  )

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
    nutrients: scaleNutrients({ kcal: food.kcal, proteinG: food.protein_g }, rounded),
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
    nutrients: recipeEntryNutrients(ingredients, recipe.servings, rounded),
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
    // In the order they were last changed, oldest first.
    .sort((a, b) => a.client_updated_at.localeCompare(b.client_updated_at))

export const entriesOn = async (db: LocalDb, date: string): Promise<LoggedEntry[]> =>
  (await liveRowsOn(db, date)).flatMap((row) => {
    const entry = toEntry(row)
    return entry ? [entry] : []
  })

// Rescales from the entry's own per-serving values, so a food edited since doesn't leak in.
export const changeServings = async (
  db: LocalDb,
  clock: Clock,
  id: string,
  servings: number,
): Promise<void> => {
  const row = logEntriesSpec.parse(await db.rows('log_entries').get(id))
  if (!row) return
  const rounded = roundServings(servings)
  const perServing = { kcal: row.kcal / row.servings, proteinG: row.protein_g / row.servings }
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
export const copyMealTo = (
  db: LocalDb,
  clock: Clock,
  userId: string,
  { from, to }: { from: Target; to: Target },
): Promise<LogEntryRow[]> =>
  db.transaction('rw', db.rows('log_entries'), db.outbox, async () => {
    const copies = copyMeal(await entriesOn(db, from.date), from.meal, to)
    const written: LogEntryRow[] = []
    for (const copy of copies) {
      written.push(
        await newEntry(db, clock, userId, {
          date: copy.date,
          meal: copy.meal,
          foodId: copy.source.kind === 'food' ? copy.source.id : null,
          recipeId: copy.source.kind === 'recipe' ? copy.source.id : null,
          name: copy.name,
          servings: copy.servings,
          nutrients: { kcal: copy.kcal, proteinG: copy.proteinG },
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
      deleted_at: null,
      schema_version: 1,
      ...existing,
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
