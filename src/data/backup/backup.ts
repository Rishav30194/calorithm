import { checkinId, dayId, uuidV5, weightId } from '../dayId'
import type { LocalDb } from '../db'
import { putAndQueue, visibleRows } from '../repository'
import { normalizeTimestamp } from '../sync/timestamps'
import {
  checkinsSpec,
  daysSpec,
  foodsSpec,
  logEntriesSpec,
  profileSpec,
  recipeItemsSpec,
  recipesSpec,
  type SyncRow,
  syncedTables,
  type TableSpec,
  weightsSpec,
} from '../tables'
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  type ExportFile,
  type ImportFailure,
  type ParseContext,
  parseExport,
} from './format'

// Ids of rows imported into another account come from this namespace, the account, and the
// row's old id. Importing the same file twice then writes the same rows instead of duplicates.
// Changing it only means a later import of an old file duplicates rows instead of merging.
const IMPORT_NAMESPACE = 'a658b5ff-6afd-421c-be21-0f657ab5ccfb'

// `day` is the device's local calendar day, YYYY-MM-DD.
export const exportFileName = (day: string): string => `calorithm-export-${day}.json`

const storedRows = async <Row extends SyncRow>(db: LocalDb, spec: TableSpec<Row>) =>
  (await db.rows(spec.name).toArray()).flatMap((raw) => {
    const row = spec.parse(raw)
    return row ? [row] : []
  })

// Live rows, plus deleted ones that a live row still points at: a food deleted on another
// device stays in the file while a log entry uses it, or the entry couldn't be imported.
const liveOrUsed = <Row extends SyncRow>(rows: Row[], used: ReadonlySet<string | null>): Row[] =>
  rows.filter((row) => row.deleted_at === null || used.has(row.id))

// Every live row on this device, including changes not yet sent. Other deleted rows are left
// out: the file is a copy of the data, not of its history.
export const buildExport = (
  db: LocalDb,
  userId: string,
  exportedAt: Date,
  appVersion: string,
): Promise<ExportFile> =>
  // One read transaction, so a pull landing midway can't leave a reference without its row.
  db.transaction('r', [...syncedTables.map((spec) => db.rows(spec.name))], async () => {
    const recipeItems = await visibleRows(db, recipeItemsSpec)
    const logEntries = await visibleRows(db, logEntriesSpec)
    const usedFoods = new Set([...recipeItems, ...logEntries].map((row) => row.food_id))
    const usedRecipes = new Set(logEntries.map((row) => row.recipe_id))
    return {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exported_at: exportedAt.toISOString(),
      app_version: appVersion,
      user_id: userId,
      tables: {
        profile: await visibleRows(db, profileSpec),
        foods: liveOrUsed(await storedRows(db, foodsSpec), usedFoods),
        recipes: liveOrUsed(await storedRows(db, recipesSpec), usedRecipes),
        recipe_items: recipeItems,
        days: await visibleRows(db, daysSpec),
        log_entries: logEntries,
        weights: await visibleRows(db, weightsSpec),
        checkins: await visibleRows(db, checkinsSpec),
      },
    }
  })

// Every table's id is a primary key across all accounts, so rows moved into another account
// need ids of their own.
export const importedId = (userId: string, id: string): Promise<string> =>
  uuidV5(IMPORT_NAMESPACE, `${userId}/${id}`)

type Change = { spec: TableSpec; row: SyncRow }

// The file's rows as the signed-in account's rows. Ids that come from the user and date are
// worked out again; other ids stay the same in the exporting account and are replaced in any
// other, along with every reference to them.
const moveRows = async ({ user_id: owner, tables }: ExportFile, userId: string) => {
  const id = (old: string): Promise<string> =>
    owner === userId ? Promise.resolve(old) : importedId(userId, old)
  const optionalId = (old: string | null): Promise<string | null> =>
    old === null ? Promise.resolve(null) : id(old)
  const all = <Row>(rows: Row[], move: (row: Row) => Promise<SyncRow>) =>
    Promise.all(rows.map(move))
  const own = { user_id: userId }

  const changes = async (spec: TableSpec, rows: Promise<SyncRow[]>): Promise<Change[]> =>
    (await rows).map((row) => ({ spec, row }))

  // Parents before children, so the outbox sends them in an order the database accepts.
  return [
    ...(await changes(
      profileSpec,
      all(tables.profile, async (row) => ({ ...row, ...own, id: userId })),
    )),
    ...(await changes(
      foodsSpec,
      all(tables.foods, async (row) => ({ ...row, ...own, id: await id(row.id) })),
    )),
    ...(await changes(
      recipesSpec,
      all(tables.recipes, async (row) => ({ ...row, ...own, id: await id(row.id) })),
    )),
    ...(await changes(
      recipeItemsSpec,
      all(tables.recipe_items, async (row) => ({
        ...row,
        ...own,
        id: await id(row.id),
        recipe_id: await id(row.recipe_id),
        food_id: await id(row.food_id),
      })),
    )),
    ...(await changes(
      daysSpec,
      all(tables.days, async (row) => ({ ...row, ...own, id: await dayId(userId, row.date) })),
    )),
    ...(await changes(
      logEntriesSpec,
      all(tables.log_entries, async (row) => ({
        ...row,
        ...own,
        id: await id(row.id),
        food_id: await optionalId(row.food_id),
        recipe_id: await optionalId(row.recipe_id),
      })),
    )),
    ...(await changes(
      weightsSpec,
      all(tables.weights, async (row) => ({
        ...row,
        ...own,
        id: await weightId(userId, row.date),
      })),
    )),
    ...(await changes(
      checkinsSpec,
      all(tables.checkins, async (row) => ({
        ...row,
        ...own,
        id: await checkinId(userId, row.date),
      })),
    )),
  ]
}

// Microseconds since 1970, as Postgres compares them; normalizeTimestamp keeps only
// milliseconds, so the rest of the fraction is added back.
const editTime = (timestamp: string): number => {
  const iso = normalizeTimestamp(timestamp)
  if (iso === null) return Number.NaN
  const fraction = /[.](\d+)/.exec(timestamp)?.[1] ?? ''
  return Date.parse(iso) * 1000 + Number(fraction.padEnd(6, '0').slice(3, 6))
}

// The same rule as the server's skip_stale_update trigger: an edit replaces a row only when
// it was made later.
const isNewer = (incoming: SyncRow, current: SyncRow | null): boolean => {
  if (!current) return true
  const currentTime = editTime(current.client_updated_at)
  return Number.isNaN(currentTime) || editTime(incoming.client_updated_at) > currentTime
}

export type ImportResult =
  | { ok: true; written: number; skipped: number }
  | { ok: false; reason: ImportFailure }

// Checks the whole file, then writes every row that is newer than this device's copy, with
// its outbox entry, in one transaction. Each row keeps the file's edit time, so the server
// also keeps any edit made after the export.
export const importData = async (
  db: LocalDb,
  text: string,
  userId: string,
  context: ParseContext,
): Promise<ImportResult> => {
  const parsed = parseExport(text, context)
  if (!parsed.ok) return parsed
  // Ids are worked out before the transaction: Dexie commits a transaction that awaits
  // anything other than its own queries, such as crypto.subtle.
  const changes = await moveRows(parsed.file, userId)
  let written = 0
  let skipped = 0
  const tables = [...syncedTables.map((spec) => db.rows(spec.name)), db.outbox]
  await db.transaction('rw', tables, async () => {
    for (const { spec, row } of changes) {
      const current = spec.parse(await db.rows(spec.name).get(row.id))
      if (!isNewer(row, current)) {
        skipped++
        continue
      }
      await putAndQueue(db, spec, row)
      written++
    }
  })
  return { ok: true, written, skipped }
}
