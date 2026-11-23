import { addDays } from '@/domain/dates'
import { entryFits } from '@/domain/limits'
import {
  type Entry,
  isMeal,
  type Meal,
  mostUsed,
  type Nutrients,
  type QuickPick,
  recentPicks,
  recipePerServing,
  roundServings,
  type Source,
  scaleNutrients,
  sourceKey,
  useScores,
  usualForMeal,
} from '@/domain/nutrition'
import { type Portion, weightPerServing } from '@/domain/portion'
import type { CatalogFood } from './catalog/search'
import { dayId } from './dayId'
import type { LocalDb } from './db'
import {
  type CatalogCopy,
  copyCatalogFood,
  createFood,
  type FoodInput,
  foodNutrients,
  recipeIngredients,
} from './foods'
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

export type LoggedEntry = Entry & {
  id: string
  // The weight of one serving as logged, for showing and editing the entry in grams or ml;
  // null for recipes, pieces, and entries logged before phase 14.
  portion: Portion | null
  // The values for one serving, as stored when logged, for previewing a change of servings.
  perServing: Nutrients
}

// The food's serving, copied onto an entry when it's logged.
type Serving = { size: number; unit: string }

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
    serving: Serving | null
    loggedAt?: string
  },
): Promise<LogEntryRow> => {
  // Callers check entryFits first: the log screens, logSource, changeServings, and
  // copyMealTo. One serving of a saved or built-in food always fits, so reaching this is a bug.
  if (!entryFits(fields.perServing, fields.servings)) {
    return Promise.reject(new Error('newEntry: the entry is past the database’s limits'))
  }
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
      serving_size: fields.serving?.size ?? null,
      serving_unit: fields.serving?.unit ?? null,
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
    serving: { size: food.serving_size, unit: food.serving_unit },
  })
}

// Logs a built-in item (decision 0027), one serving unless the amount step chose others,
// copying it into your foods first unless a copy is already there, so a repeated tap never
// makes a second copy.
export const logCatalogFood = (
  db: LocalDb,
  clock: Clock,
  userId: string,
  target: Target,
  item: CatalogFood,
  servings = 1,
): Promise<LogEntryRow> =>
  db.transaction('rw', db.rows('foods'), db.rows('log_entries'), db.outbox, async () => {
    const food = await copyCatalogFood(db, clock, userId, item)
    return logFood(db, clock, userId, { ...target, food, servings })
  })

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
    // A recipe serving has no weight.
    serving: null,
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
    portion:
      row.serving_size !== null && row.serving_unit !== null
        ? weightPerServing(row.serving_size, row.serving_unit)
        : null,
    perServing: perServingOf(row),
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
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'too_large' }> => {
  const row = logEntriesSpec.parse(await db.rows('log_entries').get(id))
  if (!row || row.deleted_at !== null) return { ok: false, reason: 'not_found' }
  const rounded = roundServings(servings)
  if (!entryFits(perServingOf(row), rounded)) return { ok: false, reason: 'too_large' }
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
    // or a meal this version doesn't know, is never copied. Nor is one stored past the
    // database's limits before the log checked them: it can never sync, and nor could a copy.
    const sources = (await liveRowsOn(db, from.date)).filter(
      (row) =>
        row.meal === from.meal &&
        toEntry(row) !== null &&
        entryFits(perServingOf(row), row.servings),
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
          serving:
            row.serving_size !== null && row.serving_unit !== null
              ? { size: row.serving_size, unit: row.serving_unit }
              : null,
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

export type LogSourceResult =
  | { ok: true; row: LogEntryRow }
  | { ok: false; reason: 'not_found' | 'too_large' }

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
    if (!entryFits(foodNutrients(food), roundServings(servings))) {
      return { ok: false, reason: 'too_large' }
    }
    return { ok: true, row: await logFood(db, clock, userId, { date, meal, food, servings }) }
  }
  const recipe = recipesSpec.parse(await db.rows('recipes').get(source.id))
  if (!recipe || recipe.deleted_at !== null) return { ok: false, reason: 'not_found' }
  const perServing = recipePerServing(await recipeIngredients(db, recipe.id), recipe.servings)
  if (!entryFits(perServing, roundServings(servings))) return { ok: false, reason: 'too_large' }
  return { ok: true, row: await logRecipe(db, clock, userId, { date, meal, recipe, servings }) }
}

// A scanned barcode matched a saved food: logs one serving, bringing an archived food back
// into the pickers, as a built-in pick does.
export const logScannedFood = (
  db: LocalDb,
  clock: Clock,
  userId: string,
  target: Target,
  foodId: string,
): Promise<LogSourceResult> =>
  db.transaction('rw', db.rows('foods'), db.rows('log_entries'), db.outbox, async () => {
    const found = foodsSpec.parse(await db.rows('foods').get(foodId))
    if (!found || found.deleted_at !== null) return { ok: false, reason: 'not_found' }
    const food =
      found.archived_at === null
        ? found
        : await writeRow(db, foodsSpec, { ...found, archived_at: null }, clock)
    return { ok: true, row: await logFood(db, clock, userId, { ...target, food, servings: 1 }) }
  })

// A food checked in the form after a scan: saved with its barcode, and one serving logged.
export const logNewFood = (
  db: LocalDb,
  clock: Clock,
  userId: string,
  target: Target,
  input: FoodInput | CatalogCopy,
): Promise<LogEntryRow> =>
  db.transaction('rw', db.rows('foods'), db.rows('log_entries'), db.outbox, async () => {
    const food = await createFood(db, clock, userId, input)
    return logFood(db, clock, userId, { ...target, food, servings: 1 })
  })

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

export type QuickPicks = {
  recent: QuickPick[]
  mostUsed: QuickPick[]
  // What each meal usually holds (phase 15).
  byMeal: Record<Meal, QuickPick[]>
  // Use scores by source key (`sourceKey`), for ranking search results. Only foods and
  // recipes that are neither archived nor deleted have one.
  scores: ReadonlyMap<string, number>
}

// A log 180 days old counts under 1.6% of a new one, so older ones are left unread: the picker
// re-runs this on every change while open (decision 0026).
const HISTORY_DAYS = 180
const PICK_LIMIT = 10

// The picker's one-tap rows, relative to the day being logged. Archived or deleted foods and
// recipes are left out, and each shows its current name.
export const quickPicks = async (db: LocalDb, today: string): Promise<QuickPicks> => {
  const entries = await entriesBetween(db, addDays(today, -(HISTORY_DAYS - 1)), today)
  const names = new Map<string, string>()
  for (const raw of await db.rows('foods').toArray()) {
    const food = foodsSpec.parse(raw)
    if (food && food.deleted_at === null && food.archived_at === null) {
      names.set(sourceKey({ kind: 'food', id: food.id }), food.name)
    }
  }
  for (const raw of await db.rows('recipes').toArray()) {
    const recipe = recipesSpec.parse(raw)
    if (recipe && recipe.deleted_at === null && recipe.archived_at === null) {
      names.set(sourceKey({ kind: 'recipe', id: recipe.id }), recipe.name)
    }
  }
  const available = (picks: QuickPick[]): QuickPick[] =>
    picks.flatMap((pick) => {
      const name = names.get(sourceKey(pick.source))
      return name === undefined ? [] : [{ ...pick, name }]
    })
  const scores = new Map([...useScores(entries, today)].filter(([key]) => names.has(key)))
  const usual = (meal: Meal): QuickPick[] =>
    available(usualForMeal(entries, meal, today, Number.POSITIVE_INFINITY)).slice(0, PICK_LIMIT)
  return {
    recent: available(recentPicks(entries, Number.POSITIVE_INFINITY)).slice(0, PICK_LIMIT),
    mostUsed: available(mostUsed(entries, today, Number.POSITIVE_INFINITY)).slice(0, PICK_LIMIT),
    byMeal: {
      breakfast: usual('breakfast'),
      lunch: usual('lunch'),
      dinner: usual('dinner'),
      snacks: usual('snacks'),
    },
    scores,
  }
}

// One item on the plate (phase 15): a saved food or recipe, or a built-in item, with servings.
export type PlateItem =
  | { kind: 'saved'; source: Source; servings: number }
  | { kind: 'builtIn'; item: CatalogFood; servings: number }

export type LogPlateResult =
  | { ok: true; rows: LogEntryRow[] }
  // The first item that stopped the plate; nothing was written.
  | { ok: false; reason: 'not_found' | 'too_large'; index: number }

type Resolved = {
  name: string
  perServing: Nutrients
  servings: number
  serving: Serving | null
  // A saved food or recipe, or the built-in item to copy first.
  source: { foodId: string } | { recipeId: string } | { item: CatalogFood }
}

// Logs every item on the plate into one meal, in order, in one transaction. Every item is read
// and checked against the database's limits before anything is written, so a plate is logged
// whole or not at all.
export const logPlate = (
  db: LocalDb,
  clock: Clock,
  userId: string,
  target: Target,
  items: readonly PlateItem[],
): Promise<LogPlateResult> =>
  db.transaction(
    'rw',
    [
      db.rows('foods'),
      db.rows('recipes'),
      db.rows('recipe_items'),
      db.rows('log_entries'),
      db.outbox,
    ],
    async (): Promise<LogPlateResult> => {
      const resolved: Resolved[] = []
      for (const [index, item] of items.entries()) {
        const servings = roundServings(item.servings)
        let next: Resolved | null = null
        if (item.kind === 'builtIn') {
          const { item: food } = item
          next = {
            name: food.name,
            perServing: food,
            servings,
            serving: { size: food.servingSize, unit: food.servingUnit },
            source: { item: food },
          }
        } else if (item.source.kind === 'food') {
          const food = foodsSpec.parse(await db.rows('foods').get(item.source.id))
          if (food && food.deleted_at === null) {
            next = {
              name: food.name,
              perServing: foodNutrients(food),
              servings,
              serving: { size: food.serving_size, unit: food.serving_unit },
              source: { foodId: food.id },
            }
          }
        } else {
          const recipe = recipesSpec.parse(await db.rows('recipes').get(item.source.id))
          if (recipe && recipe.deleted_at === null) {
            next = {
              name: recipe.name,
              perServing: recipePerServing(await recipeIngredients(db, recipe.id), recipe.servings),
              servings,
              serving: null,
              source: { recipeId: recipe.id },
            }
          }
        }
        if (!next) return { ok: false, reason: 'not_found', index }
        if (!entryFits(next.perServing, next.servings)) {
          return { ok: false, reason: 'too_large', index }
        }
        resolved.push(next)
      }

      // Each entry is logged a millisecond after the one before, so the meal keeps the
      // plate's order.
      const start = clock().getTime()
      const rows: LogEntryRow[] = []
      for (const [index, item] of resolved.entries()) {
        const { source } = item
        const foodId =
          'item' in source
            ? (await copyCatalogFood(db, clock, userId, source.item)).id
            : 'foodId' in source
              ? source.foodId
              : null
        rows.push(
          await newEntry(db, clock, userId, {
            ...target,
            foodId,
            recipeId: 'recipeId' in source ? source.recipeId : null,
            name: item.name,
            servings: item.servings,
            perServing: item.perServing,
            serving: item.serving,
            loggedAt: new Date(start + index).toISOString(),
          }),
        )
      }
      return { ok: true, rows }
    },
  )
