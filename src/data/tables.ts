import { z } from 'zod/mini'

import { EARLIEST_DAY } from '@/domain/dates'

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
  schemaVersion: 1,
  parse: parser(
    z.object({
      ...syncColumns,
      name: z.string(),
      serving_size: z.number(),
      serving_unit: z.string(),
      kcal: z.int(),
      protein_g: z.number(),
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
  parse: parser(z.object({ ...syncColumns, date: z.iso.date(), complete: z.boolean() })),
}

export type LogEntryRow = Tables<'log_entries'>

export const logEntriesSpec: TableSpec<LogEntryRow> = {
  name: 'log_entries',
  schemaVersion: 1,
  parse: parser(
    z.object({
      ...syncColumns,
      date: z.iso.date(),
      meal: z.string(),
      food_id: z.nullable(z.string()),
      recipe_id: z.nullable(z.string()),
      servings: z.number(),
      name: z.string(),
      kcal: z.int(),
      protein_g: z.number(),
      kcal_per_serving: z.number(),
      protein_g_per_serving: z.number(),
      logged_at: z.string(),
    }),
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
      date: z.iso.date().check(z.refine((date) => date >= EARLIEST_DAY)),
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

// Matches the column's numeric precision, so a value the server would round is rejected here.
const decimals = (places: number) => {
  const scale = 10 ** places
  return z.refine<number>((value) => Math.abs(value * scale - Math.round(value * scale)) < 1e-6)
}

const checkinSchema = z
  .object({
    ...syncColumns,
    date: z.iso.date().check(z.refine((date) => date >= EARLIEST_DAY)),
    status: z.enum(['updated', 'skipped']),
    // Only a week with too few complete days is stored as skipped; see the migration.
    skip_reason: z.nullable(z.enum(['too_few_complete_days'])),
    method: z.nullable(z.enum(['formula', 'adaptive'])),
    previous_maintenance_kcal: z.nullable(z.int()),
    raw_maintenance_kcal: z.nullable(z.int()),
    maintenance_kcal: z.int(),
    kcal_target: z.int(),
    protein_target_g: z.number().check(decimals(1)),
    trend_weight_kg: z.number().check(decimals(2)),
    trend_change_kg: z.nullable(z.number().check(decimals(2))),
    window_days: z.nullable(z.int()),
    complete_days_in_window: z.nullable(z.int()),
    average_intake_kcal: z.nullable(z.int()),
    complete_days_in_week: z.int(),
    goal_rate_requested_kg_per_week: z.number().check(decimals(2)),
    goal_rate_applied_kg_per_week: z.number().check(decimals(2)),
    protein_g_per_kg: z.number().check(decimals(1)),
    calorie_floor_kcal: z.int(),
    floor_applied: z.boolean(),
    rate_capped: z.boolean(),
  })
  .check(
    z.refine((row) =>
      row.status === 'updated'
        ? row.skip_reason === null && row.method !== null
        : row.skip_reason !== null && row.method === null,
    ),
  )

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
