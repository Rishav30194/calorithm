import { z } from 'zod/mini'

import { EARLIEST_DAY, isDay } from '@/domain/dates'
import { activityLevels } from '@/domain/maintenance'
import { meals } from '@/domain/nutrition'

import { isUuid, normalizeTimestamp } from '../sync/timestamps'
import {
  type CheckinRow,
  checkinsSpec,
  type DayRow,
  daysSpec,
  type FoodRow,
  foodsSpec,
  type LogEntryRow,
  logEntriesSpec,
  type ProfileRow,
  profileSpec,
  type RecipeItemRow,
  type RecipeRow,
  recipeItemsSpec,
  recipesSpec,
  type SyncRow,
  type TableSpec,
  type WeightRow,
  weightsSpec,
} from '../tables'

export const EXPORT_FORMAT = 'calorithm-export'
export const EXPORT_VERSION = 1

// Many years of heavy logging fit well under this; a larger file is refused before parsing.
export const MAX_EXPORT_CHARS = 25_000_000

export type ExportTables = {
  profile: ProfileRow[]
  foods: FoodRow[]
  recipes: RecipeRow[]
  recipe_items: RecipeItemRow[]
  days: DayRow[]
  log_entries: LogEntryRow[]
  weights: WeightRow[]
  checkins: CheckinRow[]
}

export type ExportFile = {
  format: typeof EXPORT_FORMAT
  version: typeof EXPORT_VERSION
  exported_at: string
  app_version: string
  // The account that exported the file; importing into another account gives rows new ids.
  user_id: string
  tables: ExportTables
}

export type ImportFailure = 'too_large' | 'not_json' | 'not_export' | 'newer_version' | 'invalid'

export type ParseExportResult =
  | { ok: true; file: ExportFile }
  | { ok: false; reason: ImportFailure }

// How far a timestamp may run ahead of the clock that checks it, for devices whose clocks
// disagree. An edit time far in the future would win every later conflict, here and on the
// server, so the row could never change again.
const CLOCK_SKEW_MS = 86_400_000

const timeOf = (value: string): number => {
  const iso = normalizeTimestamp(value)
  return iso === null ? Number.NaN : Date.parse(iso)
}

const isTimestamp = (value: string): boolean => !Number.isNaN(timeOf(value))

export type ParseContext = {
  now: Date
  // The device's local calendar day, YYYY-MM-DD.
  today: string
}

const header = z.object({ format: z.literal(EXPORT_FORMAT), version: z.int().check(z.gte(1)) })

const rowList = z.array(z.unknown())

const envelope = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exported_at: z.string().check(z.refine(isTimestamp)),
  app_version: z.string().check(z.maxLength(50)),
  user_id: z.string().check(z.refine(isUuid)),
  tables: z.object({
    profile: rowList,
    foods: rowList,
    recipes: rowList,
    recipe_items: rowList,
    days: rowList,
    log_entries: rowList,
    weights: rowList,
    checkins: rowList,
  }),
})

type Envelope = z.infer<typeof envelope>
type TableName = keyof ExportTables

const tableNames = [
  'profile',
  'foods',
  'recipes',
  'recipe_items',
  'days',
  'log_entries',
  'weights',
  'checkins',
] as const satisfies readonly TableName[]

const isOneOf = <T extends string>(values: readonly T[], value: string): value is T =>
  values.some((allowed) => allowed === value)

// The column's numeric scale: Postgres would round a value with more decimal places.
const hasDecimals = (value: number, places: number): boolean => {
  const scale = 10 ** places
  return Math.abs(value * scale - Math.round(value * scale)) < 1e-6
}

// Postgres btrim and char_length: spaces only, counted in characters rather than UTF-16 units.
const textFits = (value: string, max: number): boolean => {
  const length = [...value.replace(/^ +| +$/g, '')].length
  return length >= 1 && length <= max
}

const within = (value: number, min: number, max: number): boolean => value >= min && value <= max

const positiveUpTo = (value: number, max: number): boolean => value > 0 && value <= max

const optionalTimestamp = (value: string | null): boolean => value === null || isTimestamp(value)

const dayFits = (date: string): boolean => isDay(date) && date >= EARLIEST_DAY

// The database's CHECK constraints that the table specs don't repeat. A row that breaks one
// would fail on every push, so the whole file is refused instead.
// The database checks the birth date against its own date, in UTC, which can be a day behind
// the device's; the earlier of the two is safe for both.
const latestBirthDate = ({ now, today }: ParseContext): string => {
  const utcDay = now.toISOString().slice(0, 10)
  return utcDay < today ? utcDay : today
}

// The database's CHECK constraints and column scales that the table specs don't repeat. A row
// that breaks one would fail on every push, or be rounded differently by the server, so the
// whole file is refused instead.
const fitsDatabase = (context: ParseContext) => ({
  profile: (row: ProfileRow) =>
    (row.height_cm === null ||
      (within(row.height_cm, 100, 250) && hasDecimals(row.height_cm, 1))) &&
    (row.birth_date === null ||
      (isDay(row.birth_date) &&
        row.birth_date >= '1900-01-01' &&
        row.birth_date <= latestBirthDate(context))) &&
    (row.sex === null || row.sex === 'female' || row.sex === 'male') &&
    (row.activity_level === null || isOneOf(activityLevels, row.activity_level)) &&
    (row.units === 'metric' || row.units === 'imperial') &&
    within(row.goal_rate_kg_per_week, -2, 2) &&
    hasDecimals(row.goal_rate_kg_per_week, 2) &&
    within(row.protein_g_per_kg, 1.6, 2.2) &&
    hasDecimals(row.protein_g_per_kg, 1) &&
    Number.isInteger(row.calorie_floor_kcal) &&
    within(row.calorie_floor_kcal, 1000, 3000),
  foods: (row: FoodRow) =>
    textFits(row.name, 100) &&
    positiveUpTo(row.serving_size, 10000) &&
    hasDecimals(row.serving_size, 2) &&
    textFits(row.serving_unit, 20) &&
    within(row.kcal, 0, 10000) &&
    within(row.protein_g, 0, 1000) &&
    hasDecimals(row.protein_g, 1) &&
    optionalTimestamp(row.archived_at),
  recipes: (row: RecipeRow) =>
    textFits(row.name, 100) &&
    positiveUpTo(row.servings, 1000) &&
    hasDecimals(row.servings, 2) &&
    optionalTimestamp(row.archived_at),
  recipe_items: (row: RecipeItemRow) =>
    positiveUpTo(row.servings, 1000) && hasDecimals(row.servings, 2),
  days: (row: DayRow) => dayFits(row.date),
  log_entries: (row: LogEntryRow) =>
    dayFits(row.date) &&
    isOneOf(meals, row.meal) &&
    (row.food_id === null) !== (row.recipe_id === null) &&
    positiveUpTo(row.servings, 1000) &&
    hasDecimals(row.servings, 2) &&
    textFits(row.name, 100) &&
    within(row.kcal, 0, 100000) &&
    within(row.protein_g, 0, 10000) &&
    hasDecimals(row.protein_g, 1) &&
    within(row.kcal_per_serving, 0, 100000) &&
    hasDecimals(row.kcal_per_serving, 3) &&
    within(row.protein_g_per_serving, 0, 10000) &&
    hasDecimals(row.protein_g_per_serving, 3) &&
    isTimestamp(row.logged_at),
  weights: (_row: WeightRow) => true,
  checkins: (_row: CheckinRow) => true,
})

const rowVersion = (raw: unknown): unknown =>
  typeof raw === 'object' && raw !== null && 'schema_version' in raw ? raw.schema_version : null

type RowRules = {
  userId: string
  // Edit times later than this are refused.
  latestEdit: number
  // Only foods and recipes: a deleted one stays in the file while live rows still use it.
  deletedAllowed: boolean
}

// Every row of one table, checked on its own, or null when any row doesn't fit.
const parseRows = <Row extends SyncRow>(
  spec: TableSpec<Row>,
  raws: readonly unknown[],
  { userId, latestEdit, deletedAllowed }: RowRules,
  fits: (row: Row) => boolean,
): Row[] | null => {
  const rows: Row[] = []
  const ids = new Set<string>()
  for (const raw of raws) {
    const row = spec.parse(raw)
    if (
      !row ||
      // An older row version reads as the current shape: its missing columns are not set.
      !Number.isInteger(row.schema_version) ||
      row.schema_version < 1 ||
      row.schema_version > spec.schemaVersion ||
      row.user_id !== userId ||
      (row.deleted_at !== null && !(deletedAllowed && isTimestamp(row.deleted_at))) ||
      !isUuid(row.id) ||
      ids.has(row.id) ||
      !(timeOf(row.client_updated_at) <= latestEdit) ||
      !fits(row)
    ) {
      return null
    }
    ids.add(row.id)
    rows.push(row)
  }
  return rows
}

const parseTables = (file: Envelope, context: ParseContext): ExportTables | null => {
  const raw = file.tables
  const fits = fitsDatabase(context)
  const live: RowRules = {
    userId: file.user_id,
    latestEdit: timeOf(file.exported_at) + CLOCK_SKEW_MS,
    deletedAllowed: false,
  }
  const parent: RowRules = { ...live, deletedAllowed: true }
  const profile = parseRows(profileSpec, raw.profile, live, fits.profile)
  const foods = parseRows(foodsSpec, raw.foods, parent, fits.foods)
  const recipes = parseRows(recipesSpec, raw.recipes, parent, fits.recipes)
  const recipe_items = parseRows(recipeItemsSpec, raw.recipe_items, live, fits.recipe_items)
  const days = parseRows(daysSpec, raw.days, live, fits.days)
  const log_entries = parseRows(logEntriesSpec, raw.log_entries, live, fits.log_entries)
  const weights = parseRows(weightsSpec, raw.weights, live, fits.weights)
  const checkins = parseRows(checkinsSpec, raw.checkins, live, fits.checkins)
  if (
    !profile ||
    !foods ||
    !recipes ||
    !recipe_items ||
    !days ||
    !log_entries ||
    !weights ||
    !checkins
  ) {
    return null
  }
  return { profile, foods, recipes, recipe_items, days, log_entries, weights, checkins }
}

const uniqueDates = (rows: readonly { date: string }[]): boolean =>
  new Set(rows.map((row) => row.date)).size === rows.length

// Rules across rows: one profile that is the user's, one row per day where ids come from the
// date, and every reference points at a row in the same file, since a new account has no
// other rows to point at.
const consistent = (tables: ExportTables, userId: string): boolean => {
  const foodIds = new Set(tables.foods.map((row) => row.id))
  const recipeIds = new Set(tables.recipes.map((row) => row.id))
  return (
    tables.profile.length <= 1 &&
    tables.profile.every((row) => row.id === userId) &&
    uniqueDates(tables.days) &&
    uniqueDates(tables.weights) &&
    uniqueDates(tables.checkins) &&
    tables.recipe_items.every((row) => recipeIds.has(row.recipe_id) && foodIds.has(row.food_id)) &&
    tables.log_entries.every(
      (row) =>
        (row.food_id === null || foodIds.has(row.food_id)) &&
        (row.recipe_id === null || recipeIds.has(row.recipe_id)),
    )
  )
}

const versions: Record<TableName, number> = {
  profile: profileSpec.schemaVersion,
  foods: foodsSpec.schemaVersion,
  recipes: recipesSpec.schemaVersion,
  recipe_items: recipeItemsSpec.schemaVersion,
  days: daysSpec.schemaVersion,
  log_entries: logEntriesSpec.schemaVersion,
  weights: weightsSpec.schemaVersion,
  checkins: checkinsSpec.schemaVersion,
}

const hasNewerRows = (file: Envelope): boolean =>
  tableNames.some((table) =>
    file.tables[table].some((raw) => {
      const version = rowVersion(raw)
      return typeof version === 'number' && version > versions[table]
    }),
  )

// Checks the whole file before anything is written.
export const parseExport = (text: string, context: ParseContext): ParseExportResult => {
  if (text.length > MAX_EXPORT_CHARS) return { ok: false, reason: 'too_large' }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'not_json' }
  }
  const head = header.safeParse(json)
  if (!head.success) return { ok: false, reason: 'not_export' }
  if (head.data.version > EXPORT_VERSION) return { ok: false, reason: 'newer_version' }
  const file = envelope.safeParse(json)
  if (!file.success || timeOf(file.data.exported_at) > context.now.getTime() + CLOCK_SKEW_MS) {
    return { ok: false, reason: 'invalid' }
  }
  if (hasNewerRows(file.data)) return { ok: false, reason: 'newer_version' }
  const tables = parseTables(file.data, context)
  if (!tables || !consistent(tables, file.data.user_id)) return { ok: false, reason: 'invalid' }
  return { ok: true, file: { ...file.data, tables } }
}
