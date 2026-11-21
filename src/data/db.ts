import Dexie, { type Table } from 'dexie'

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

export type SchemaVersion = { version: number; stores: Record<string, string | null> }

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
]

export const dbNameFor = (userId: string): string => `calorithm-${userId}`

export class LocalDb extends Dexie {
  declare outbox: Table<OutboxEntry, number>
  declare sync_state: Table<SyncState, string>

  constructor(name: string, versions: readonly SchemaVersion[] = schemaVersions) {
    super(name)
    for (const { version, stores } of versions) {
      this.version(version).stores(stores)
    }
  }

  rows(table: string): Table<SyncRow, string> {
    return this.table<SyncRow, string>(table)
  }
}
