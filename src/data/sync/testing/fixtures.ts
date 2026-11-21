import Dexie from 'dexie'
import { z } from 'zod/mini'

import { LocalDb, type SchemaVersion, schemaVersions } from '../../db'
import type { SyncRow, TableSpec } from '../../tables'

export const userId = 'a0000000-0000-4000-8000-000000000001'

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

// Made-up tables for the cases no real table covers yet: a parent and a child (sync case 4),
// and a table on schema version 2 that renamed a column (case 12).
export type ParentRow = SyncRow & { name: string }
export type ChildRow = SyncRow & { parent_id: string; note: string }
export type RenamedRow = SyncRow & { title: string }

export const parentSpec: TableSpec<ParentRow> = {
  name: 'parent',
  schemaVersion: 1,
  parse: parser(z.object({ ...syncColumns, name: z.string() })),
}

export const childSpec: TableSpec<ChildRow> = {
  name: 'child',
  schemaVersion: 1,
  parse: parser(z.object({ ...syncColumns, parent_id: z.string(), note: z.string() })),
  parents: (row) =>
    typeof row.parent_id === 'string' ? [{ table: 'parent', id: row.parent_id }] : [],
}

// Version 1 called the column `label`; version 2 calls it `title`.
export const renamedSpec: TableSpec<RenamedRow> = {
  name: 'renamed',
  schemaVersion: 2,
  parse: parser(z.object({ ...syncColumns, title: z.string() })),
  upgrade: (row, fromVersion) => {
    if (fromVersion >= 2) return row
    const { label, ...rest } = row
    return { ...rest, title: label, schema_version: 2 }
  },
}

// Made-up tables go in a version after the app's own, so tests also have the real tables.
export const testVersions: readonly SchemaVersion[] = [
  ...schemaVersions,
  { version: schemaVersions.length + 1, stores: { parent: 'id', child: 'id', renamed: 'id' } },
]

const opened: LocalDb[] = []

export const openDb = (name: string): LocalDb => {
  const db = new LocalDb(name, testVersions)
  opened.push(db)
  return db
}

export const closeAll = async (): Promise<void> => {
  for (const db of opened.splice(0)) {
    db.close()
    await Dexie.delete(db.name)
  }
}

export const sync = (overrides: Partial<SyncRow> = {}): SyncRow => ({
  id: crypto.randomUUID(),
  user_id: userId,
  updated_at: '',
  client_updated_at: '',
  deleted_at: null,
  schema_version: 1,
  ...overrides,
})

// A clock the test moves by hand.
export const manualClock = (start = '2026-11-20T10:00:00.000Z') => {
  let now = new Date(start).getTime()
  return {
    clock: () => new Date(now),
    advance: (ms: number) => {
      now += ms
    },
  }
}
