import { z } from 'zod/mini'

import { EARLIEST_DAY } from '@/domain/dates'
import { limits } from '@/domain/limits'

import type { Tables } from './database.types'

// Columns every synced table has. See docs/architecture.md, "Sync".
export type SyncRow = {
  id: string
  user_id: string
  updated_at: string
  client_updated_at: string
  deleted_at: string | null
  schema_version: number
}

export type TableSpec<Row extends SyncRow = SyncRow> = {
  name: string
  // The row shape this app version writes.
  schemaVersion: number
  // Checks rows read from the outbox or pulled from the server; null when they don't fit.
  parse: (raw: unknown) => Row | null
  // Brings an outbox row written by an older app version up to schemaVersion before it's sent.
  upgrade?: (row: Record<string, unknown>, fromVersion: number) => Record<string, unknown>
  // Columns each schema version added. An entry written before a version is sent without
  // that version's columns, so the server keeps the values a newer device stored.
  addedColumns?: Readonly<Record<number, readonly string[]>>
  // Rows this row references. A foreign key error while one of them has a failed change keeps
  // the row queued instead of failing it for good (decision 0019).
  parents?: (row: Record<string, unknown>) => ParentRef[]
}

export type ParentRef = { table: string; id: string }

const ref = (table: string, id: unknown): ParentRef[] =>
  typeof id === 'string' ? [{ table, id }] : []

const syncColumns = {
  id: z.string(),
  user_id: z.string(),
  updated_at: z.string(),
  client_updated_at: z.string(),
  deleted_at: z.nullable(z.string()),
  schema_version: z.number(),
}

const parser =
  <Row extends SyncRow>(schema: z.ZodMiniType<Row>) =>
  (raw: unknown): Row | null => {
    const result = schema.safeParse(raw)
    return result.success ? result.data : null
  }

// Matches the column's numeric precision, so a value the server would round is rejected here.
const decimals = (places: number) => {
  const scale = 10 ** places
  return z.refine<number>((value) => Math.abs(value * scale - Math.round(value * scale)) < 1e-6)
}

const between = (min: number, max: number) => [z.gte(min), z.lte(max)] as const

// Carbs or fat in grams, not set (null) on rows saved before version 2 (decision 0025). A row
// without the column, such as an older local copy or export, reads as not set.
const grams = (places: number, max: number) =>
  z._default(z.nullable(z.number().check(...between(0, max), decimals(places))), null)

// A log entry's grams are servings times a food's, so like its protein they're checked only
// for precision here. The log refuses a total past the database's range before writing it
// (entryFits in src/domain/limits.ts); a row stored before that check still reads back.
const loggedGrams = (places: number) =>
  z._default(z.nullable(z.number().check(z.gte(0), decimals(places))), null)

// A calendar day the database accepts: from 2000-01-01, as its range checks require.
const dayDate = z.iso.date().check(z.refine((date) => date >= EARLIEST_DAY))

export type ProfileRow = Tables<'profile'>

const profileSchema = z.object({
  ...syncColumns,
  height_cm: z.nullable(z.number()),
  birth_date: z.nullable(z.string()),
  sex: z.nullable(z.string()),
  activity_level: z.nullable(z.string()),
  units: z.string(),
  goal_rate_kg_per_week: z.number(),
  protein_g_per_kg: z.number(),
  calorie_floor_kcal: z.number(),
})

export const profileSpec: TableSpec<ProfileRow> = {
  name: 'profile',
  schemaVersion: 1,
  parse: parser(profileSchema),
}

export type FoodRow = Tables<'foods'>

export const foodsSpec: TableSpec<FoodRow> = {
  name: 'foods',
  schemaVersion: 4,
  addedColumns: { 2: ['carbs_g', 'fat_g'], 3: ['catalog_id'], 4: ['barcode'] },
  parse: parser(
    z.object({
      ...syncColumns,
      name: z.string(),
      serving_size: z.number(),
      serving_unit: z.string(),
      kcal: z.int(),
      protein_g: z.number(),
      carbs_g: grams(1, limits.food.grams),
      fat_g: grams(1, limits.food.grams),
      // The built-in item a food was copied from (decision 0027); null for foods typed in.
      catalog_id: z._default(z.nullable(z.string().check(z.minLength(1), z.maxLength(60))), null),
      // A pack's barcode in its stored form (src/domain/barcode.ts); null when not set.
      barcode: z._default(z.nullable(z.string().check(z.regex(/^([0-9]{8}|[0-9]{13,14})$/))), null),
      archived_at: z.nullable(z.string()),
    }),
  ),
}

export type RecipeRow = Tables<'recipes'>

export const recipesSpec: TableSpec<RecipeRow> = {
  name: 'recipes',
  schemaVersion: 1,
  parse: parser(
    z.object({
      ...syncColumns,
      name: z.string(),
      servings: z.number(),
      archived_at: z.nullable(z.string()),
    }),
  ),
}

export type RecipeItemRow = Tables<'recipe_items'>

export const recipeItemsSpec: TableSpec<RecipeItemRow> = {
  name: 'recipe_items',
  schemaVersion: 1,
  parse: parser(
    z.object({
      ...syncColumns,
      recipe_id: z.string(),
      food_id: z.string(),
      servings: z.number(),
    }),
  ),
  parents: (row) => [...ref('recipes', row.recipe_id), ...ref('foods', row.food_id)],
}

export type DayRow = Tables<'days'>

export const daysSpec: TableSpec<DayRow> = {
  name: 'days',
  schemaVersion: 1,
  parse: parser(z.object({ ...syncColumns, date: dayDate, complete: z.boolean() })),
}

export type LogEntryRow = Tables<'log_entries'>

export const logEntriesSpec: TableSpec<LogEntryRow> = {
  name: 'log_entries',
  schemaVersion: 3,
  addedColumns: {
    2: ['carbs_g', 'fat_g', 'carbs_g_per_serving', 'fat_g_per_serving'],
    3: ['serving_size', 'serving_unit'],
  },
  parse: parser(
    z
      .object({
        ...syncColumns,
        date: dayDate,
        meal: z.string(),
        food_id: z.nullable(z.string()),
        recipe_id: z.nullable(z.string()),
        servings: z.number(),
        name: z.string(),
        kcal: z.int(),
        protein_g: z.number(),
        kcal_per_serving: z.number(),
        protein_g_per_serving: z.number(),
        carbs_g: loggedGrams(1),
        fat_g: loggedGrams(1),
        carbs_g_per_serving: loggedGrams(3),
        fat_g_per_serving: loggedGrams(3),
        logged_at: z.string(),
        // The food's serving when logged (phase 14); null for recipes and older entries.
        serving_size: z._default(
          z.nullable(z.number().check(z.gt(0), z.lte(limits.food.servingSize), decimals(2))),
          null,
        ),
        serving_unit: z._default(
          // Counted in characters, as Postgres's char_length does, not UTF-16 units.
          z.nullable(
            z.string().check(
              z.refine((unit) => {
                const length = [...unit.trim()].length
                return length >= 1 && length <= limits.unitLength
              }),
            ),
          ),
          null,
        ),
      })
      .check(z.refine((row) => (row.serving_size === null) === (row.serving_unit === null))),
  ),
  parents: (row) => [...ref('foods', row.food_id), ...ref('recipes', row.recipe_id)],
}

export type WeightRow = Tables<'weights'>

export const weightsSpec: TableSpec<WeightRow> = {
  name: 'weights',
  schemaVersion: 1,
  parse: parser(
    z.object({
      ...syncColumns,
      date: dayDate,
      // numeric(5,2) between 20 and 400. Repositories round to 2 decimals; anything else is
      // rejected here, as the food specs do, rather than rounded differently by the server.
      weight_kg: z.number().check(
        z.gte(20),
        z.lte(400),
        z.refine((kg) => Math.abs(kg * 100 - Math.round(kg * 100)) < 1e-6),
      ),
    }),
  ),
}

export type CheckinRow = Tables<'checkins'>

type CheckinFields = Omit<CheckinRow, keyof SyncRow>

// Hundredths as integers, so the rate cap compares exactly.
const hundredths = (value: number): number => Math.round(value * 100)

// The cross-column CHECK constraints in the checkins migration, in the same order.
const checkinRulesHold = (row: CheckinFields): boolean => {
  const updated = row.status === 'updated'
  const adaptive = row.method === 'adaptive'
  const windowFields = [
    row.trend_change_kg,
    row.window_days,
    row.complete_days_in_window,
    row.average_intake_kcal,
  ]
  const applied = hundredths(row.goal_rate_applied_kg_per_week)
  const requested = hundredths(row.goal_rate_requested_kg_per_week)
  return (
    (updated
      ? row.skip_reason === null && row.method !== null
      : row.skip_reason !== null && row.method === null) &&
    (updated ||
      (row.previous_maintenance_kcal !== null &&
        row.maintenance_kcal === row.previous_maintenance_kcal)) &&
    updated === (row.raw_maintenance_kcal !== null) &&
    windowFields.every((value) => (adaptive ? value !== null : value === null)) &&
    (row.window_days === null ||
      row.complete_days_in_window === null ||
      row.complete_days_in_window <= row.window_days) &&
    (row.previous_maintenance_kcal === null ||
      Math.abs(row.maintenance_kcal - row.previous_maintenance_kcal) <= 150) &&
    row.kcal_target >= row.calorie_floor_kcal &&
    (!row.floor_applied || row.kcal_target === row.calorie_floor_kcal) &&
    Math.abs(applied) <= Math.abs(requested) &&
    Math.abs(applied) * 100 <= hundredths(row.trend_weight_kg) &&
    Math.sign(applied) * Math.sign(requested) >= 0 &&
    row.rate_capped === (applied !== requested)
  )
}

const checkinSchema = z
  .object({
    ...syncColumns,
    date: dayDate,
    status: z.enum(['updated', 'skipped']),
    // Only a week with too few complete days is stored as skipped; see the migration.
    skip_reason: z.nullable(z.enum(['too_few_complete_days'])),
    method: z.nullable(z.enum(['formula', 'adaptive'])),
    previous_maintenance_kcal: z.nullable(z.int().check(...between(0, 20000))),
    raw_maintenance_kcal: z.nullable(z.int().check(...between(-100000, 100000))),
    maintenance_kcal: z.int().check(...between(0, 20000)),
    kcal_target: z.int().check(...between(1000, 25000)),
    protein_target_g: z.number().check(...between(1, 999.9), decimals(1)),
    trend_weight_kg: z.number().check(...between(20, 400), decimals(2)),
    trend_change_kg: z.nullable(z.number().check(...between(-380, 380), decimals(2))),
    window_days: z.nullable(z.int().check(...between(1, 28))),
    complete_days_in_window: z.nullable(z.int().check(z.gte(0))),
    average_intake_kcal: z.nullable(z.int().check(...between(0, 100000))),
    complete_days_in_week: z.int().check(...between(0, 7)),
    goal_rate_requested_kg_per_week: z.number().check(...between(-2, 2), decimals(2)),
    goal_rate_applied_kg_per_week: z.number().check(decimals(2)),
    protein_g_per_kg: z.number().check(...between(1.6, 2.2), decimals(1)),
    calorie_floor_kcal: z.int().check(...between(1000, 3000)),
    floor_applied: z.boolean(),
    rate_capped: z.boolean(),
  })
  .check(z.refine(checkinRulesHold))

export const checkinsSpec: TableSpec<CheckinRow> = {
  name: 'checkins',
  schemaVersion: 1,
  parse: parser(checkinSchema),
}

// Push order: a parent table comes before any table that references it.
export const syncedTables: readonly TableSpec[] = [
  profileSpec,
  foodsSpec,
  recipesSpec,
  recipeItemsSpec,
  daysSpec,
  logEntriesSpec,
  weightsSpec,
  checkinsSpec,
]
