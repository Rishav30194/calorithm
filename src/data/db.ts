import Dexie, { type Table, type Transaction } from 'dexie'

import type { SyncRow } from './tables'

export type OutboxEntry = {
  seq?: number
  table: string
  rowId: string
  row: Record<string, unknown>
  // The row shape the entry was written with; older entries are upgraded before sending.
  schemaVersion: number
  // Bumped on every edit, so a push only deletes the entry it actually sent.
  rev: number
  attempts: number
  nextAttemptAt: number
  failure: { code: string; message: string } | null
}

export type Cursor = { updatedAt: string; id: string }

export type SyncState = {
  table: string
  // Kept exactly as Postgres returned it: Date would drop the microseconds and skip rows.
  cursor: Cursor | null
  lastPullAt: number | null
  // Rows the server sent in a shape this app version can't read, such as a newer version's.
  // The cursor moves past them, so each pull fetches them again by id.
  unreadable: string[]
}

// Local-only settings for this device, never synced.
export type MetaEntry = { key: 'lastExportDay'; value: string }

export type SchemaVersion = {
  version: number
  stores: Record<string, string | null>
  // Rewrites rows already stored, for a change in their shape rather than in the stores.
  upgrade?: (tx: Transaction) => Promise<void>
}

// One entry per local schema change, never edited once released. A new version lists only
// the stores it adds or changes, and gets an upgrade test in db.test.ts.
export const schemaVersions: readonly SchemaVersion[] = [
  {
    version: 1,
    stores: {
      profile: 'id',
      outbox: '++seq, &[table+rowId]',
      sync_state: 'table',
    },
  },
  {
    version: 2,
    stores: {
      foods: 'id',
      recipes: 'id',
      recipe_items: 'id, recipe_id',
      days: 'id, date',
      log_entries: 'id, date',
    },
  },
  {
    version: 3,
    stores: {
      weights: 'id, date',
    },
  },
  {
    version: 4,
    stores: {
      checkins: 'id, date',
    },
  },
  {
    version: 5,
    stores: {
      meta: 'key',
    },
  },
  {
    // Carbs and fat (decision 0025): rows stored before them read as not set.
    version: 6,
    stores: {},
    upgrade: async (tx) => {
      await tx
        .table('foods')
        .toCollection()
        .modify((row: Record<string, unknown>) => {
          row.carbs_g ??= null
          row.fat_g ??= null
        })
      await tx
        .table('log_entries')
        .toCollection()
        .modify((row: Record<string, unknown>) => {
          row.carbs_g ??= null
          row.fat_g ??= null
          row.carbs_g_per_serving ??= null
          row.fat_g_per_serving ??= null
        })
    },
  },
  {
    // The built-in item a food was copied from (decision 0027): none for stored foods.
    version: 7,
    // Indexed, so a built-in pick finds its copy without reading every food.
    stores: { foods: 'id, catalog_id' },
    upgrade: async (tx) => {
      await tx
        .table('foods')
        .toCollection()
        .modify((row: Record<string, unknown>) => {
          row.catalog_id ??= null
        })
    },
  },
  {
    // A pack's barcode (phase 11): none for stored foods.
    version: 8,
    // Indexed, so a scan finds a saved food without reading every food.
    stores: { foods: 'id, catalog_id, barcode' },
    upgrade: async (tx) => {
      await tx
        .table('foods')
        .toCollection()
        .modify((row: Record<string, unknown>) => {
          row.barcode ??= null
        })
    },
  },
]

export const dbNameFor = (userId: string): string => `calorithm-${userId}`

export class LocalDb extends Dexie {
  declare outbox: Table<OutboxEntry, number>
  declare sync_state: Table<SyncState, string>
  declare meta: Table<MetaEntry, MetaEntry['key']>

  constructor(name: string, versions: readonly SchemaVersion[] = schemaVersions) {
    super(name)
    for (const { version, stores, upgrade } of versions) {
      const declared = this.version(version).stores(stores)
      if (upgrade) declared.upgrade(upgrade)
    }
  }

  rows(table: string): Table<SyncRow, string> {
    return this.table<SyncRow, string>(table)
  }
}
