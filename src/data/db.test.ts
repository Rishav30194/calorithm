import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'

import { dbNameFor, LocalDb, type SchemaVersion, schemaVersions } from './db'

const opened: LocalDb[] = []
const open = (name: string, versions: readonly SchemaVersion[] = schemaVersions) => {
  const db = new LocalDb(name, versions)
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close()
    await Dexie.delete(db.name)
  }
})

describe('LocalDb', () => {
  it('names each user’s database after the user', () => {
    expect(dbNameFor('a0000000-0000-4000-8000-000000000001')).toBe(
      'calorithm-a0000000-0000-4000-8000-000000000001',
    )
  })

  it('opens with the synced tables plus outbox and sync_state', async () => {
    const db = open('calorithm-test-open')
    await db.open()
    expect(db.tables.map((table) => table.name).sort()).toEqual(['outbox', 'profile', 'sync_state'])
  })

  it('allows one outbox entry per row', async () => {
    const db = open('calorithm-test-unique')
    const entry = {
      table: 'profile',
      rowId: 'r1',
      row: {},
      schemaVersion: 1,
      rev: 1,
      attempts: 0,
      nextAttemptAt: 0,
      failure: null,
    }
    await db.outbox.add(entry)
    await expect(db.outbox.add(entry)).rejects.toThrow()
  })

  // Sync case 18. Each new schema version adds a case here that writes data at the previous
  // version, reopens at the new one, and checks the data survived.
  it('keeps existing data when reopened at the current version', async () => {
    const first = open('calorithm-test-upgrade')
    await first.table('profile').put({ id: 'p1', units: 'metric' })
    first.close()

    const again = open('calorithm-test-upgrade')
    expect(await again.table('profile').get('p1')).toEqual({ id: 'p1', units: 'metric' })
  })

  it('keeps existing data across an upgrade that adds a table', async () => {
    const v1: SchemaVersion = {
      version: 1,
      stores: { notes: 'id', outbox: '++seq, &[table+rowId]', sync_state: 'table' },
    }
    const v2: SchemaVersion = { version: 2, stores: { tags: 'id' } }

    const before = open('calorithm-test-upgrade-2', [v1])
    await before.table('notes').put({ id: 'n1', text: 'kept' })
    before.close()

    const after = open('calorithm-test-upgrade-2', [v1, v2])
    expect(await after.table('notes').get('n1')).toEqual({ id: 'n1', text: 'kept' })
    expect(after.tables.map((table) => table.name)).toContain('tags')
  })
})
