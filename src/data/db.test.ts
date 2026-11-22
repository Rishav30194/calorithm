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
    expect(db.tables.map((table) => table.name).sort()).toEqual([
      'checkins',
      'days',
      'foods',
      'log_entries',
      'meta',
      'outbox',
      'profile',
      'recipe_items',
      'recipes',
      'sync_state',
      'weights',
    ])
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

  it('keeps version 1 data when upgraded to version 2, which adds the food and log tables', async () => {
    const [v1] = schemaVersions
    if (!v1) throw new Error('no schema versions')
    const before = open('calorithm-test-upgrade-v2', [v1])
    await before.table('profile').put({ id: 'p1', units: 'imperial' })
    await before.outbox.add({
      table: 'profile',
      rowId: 'p1',
      row: { id: 'p1' },
      schemaVersion: 1,
      rev: 1,
      attempts: 0,
      nextAttemptAt: 0,
      failure: null,
    })
    before.close()

    const after = open('calorithm-test-upgrade-v2')
    expect(await after.table('profile').get('p1')).toEqual({ id: 'p1', units: 'imperial' })
    expect(await after.outbox.count()).toBe(1)
    await after.table('log_entries').put({ id: 'l1', date: '2026-11-20' })
    expect(await after.table('log_entries').where('date').equals('2026-11-20').count()).toBe(1)
  })

  it('keeps version 2 data when upgraded to version 3, which adds weights', async () => {
    const [v1, v2] = schemaVersions
    if (!v1 || !v2) throw new Error('missing schema versions')
    const before = open('calorithm-test-upgrade-v3', [v1, v2])
    await before.table('profile').put({ id: 'p1', units: 'imperial' })
    await before.table('log_entries').put({ id: 'l1', date: '2026-11-20' })
    await before.outbox.add({
      table: 'log_entries',
      rowId: 'l1',
      row: { id: 'l1' },
      schemaVersion: 1,
      rev: 1,
      attempts: 0,
      nextAttemptAt: 0,
      failure: null,
    })
    before.close()

    const after = open('calorithm-test-upgrade-v3')
    expect(await after.table('profile').get('p1')).toEqual({ id: 'p1', units: 'imperial' })
    // Later versions add fields to log entries; this case checks only that its data survived.
    expect(await after.table('log_entries').get('l1')).toMatchObject({
      id: 'l1',
      date: '2026-11-20',
    })
    expect(await after.outbox.count()).toBe(1)
    await after.table('weights').put({ id: 'w1', date: '2026-11-20' })
    expect(await after.table('weights').where('date').equals('2026-11-20').count()).toBe(1)
  })

  it('keeps version 3 data when upgraded to version 4, which adds check-ins', async () => {
    const [v1, v2, v3] = schemaVersions
    if (!v1 || !v2 || !v3) throw new Error('missing schema versions')
    const before = open('calorithm-test-upgrade-v4', [v1, v2, v3])
    await before.table('weights').put({ id: 'w1', date: '2026-11-20' })
    await before.outbox.add({
      table: 'weights',
      rowId: 'w1',
      row: { id: 'w1' },
      schemaVersion: 1,
      rev: 1,
      attempts: 0,
      nextAttemptAt: 0,
      failure: null,
    })
    before.close()

    const after = open('calorithm-test-upgrade-v4')
    expect(await after.table('weights').get('w1')).toEqual({ id: 'w1', date: '2026-11-20' })
    expect(await after.outbox.count()).toBe(1)
    await after.table('checkins').put({ id: 'c1', date: '2026-11-20' })
    expect(await after.table('checkins').where('date').equals('2026-11-20').count()).toBe(1)
  })

  it('keeps version 4 data when upgraded to version 5, which adds meta', async () => {
    const [v1, v2, v3, v4] = schemaVersions
    if (!v1 || !v2 || !v3 || !v4) throw new Error('missing schema versions')
    const before = open('calorithm-test-upgrade-v5', [v1, v2, v3, v4])
    await before.table('checkins').put({ id: 'c1', date: '2026-11-20' })
    before.close()

    const after = open('calorithm-test-upgrade-v5')
    expect(await after.table('checkins').get('c1')).toEqual({ id: 'c1', date: '2026-11-20' })
    await after.meta.put({ key: 'lastExportDay', value: '2026-11-21' })
    expect(await after.meta.get('lastExportDay')).toEqual({
      key: 'lastExportDay',
      value: '2026-11-21',
    })
  })

  it('marks carbs and fat not set on existing foods and log entries when upgraded to version 6', async () => {
    const [v1, v2, v3, v4, v5] = schemaVersions
    if (!v1 || !v2 || !v3 || !v4 || !v5) throw new Error('missing schema versions')
    const before = open('calorithm-test-upgrade-v6', [v1, v2, v3, v4, v5])
    await before.table('foods').put({ id: 'f1', name: 'Oats', kcal: 150 })
    await before.table('log_entries').put({ id: 'l1', date: '2026-11-20', kcal: 225 })
    await before.table('weights').put({ id: 'w1', date: '2026-11-20' })
    before.close()

    const after = open('calorithm-test-upgrade-v6')
    // Version 7 also adds catalog_id; this case checks carbs and fat.
    expect(await after.table('foods').get('f1')).toMatchObject({
      id: 'f1',
      name: 'Oats',
      kcal: 150,
      carbs_g: null,
      fat_g: null,
    })
    expect(await after.table('log_entries').get('l1')).toEqual({
      id: 'l1',
      date: '2026-11-20',
      kcal: 225,
      carbs_g: null,
      fat_g: null,
      carbs_g_per_serving: null,
      fat_g_per_serving: null,
      serving_size: null,
      serving_unit: null,
    })
    expect(await after.table('weights').get('w1')).toEqual({ id: 'w1', date: '2026-11-20' })
  })

  it('marks existing foods as not from the built-in list when upgraded to version 7', async () => {
    const [v1, v2, v3, v4, v5, v6] = schemaVersions
    if (!v1 || !v2 || !v3 || !v4 || !v5 || !v6) throw new Error('missing schema versions')
    const before = open('calorithm-test-upgrade-v7', [v1, v2, v3, v4, v5, v6])
    await before.table('foods').put({ id: 'f1', name: 'Oats', carbs_g: 27, fat_g: 2.5 })
    before.close()

    const after = open('calorithm-test-upgrade-v7')
    expect(await after.table('foods').get('f1')).toEqual({
      id: 'f1',
      name: 'Oats',
      carbs_g: 27,
      fat_g: 2.5,
      catalog_id: null,
      barcode: null,
    })
  })

  it('gives existing foods no barcode, indexes barcodes, and pulls foods again when upgraded to version 8', async () => {
    const [v1, v2, v3, v4, v5, v6, v7] = schemaVersions
    if (!v1 || !v2 || !v3 || !v4 || !v5 || !v6 || !v7) throw new Error('missing schema versions')
    const before = open('calorithm-test-upgrade-v8', [v1, v2, v3, v4, v5, v6, v7])
    await before.table('foods').put({ id: 'f1', name: 'Oats', catalog_id: null })
    const cursor = { updatedAt: '2026-11-22T10:00:00.000000+00:00', id: 'f1' }
    await before.table('sync_state').bulkPut([
      { table: 'foods', cursor, lastPullAt: 1, unreadable: [] },
      { table: 'weights', cursor, lastPullAt: 1, unreadable: [] },
    ])
    before.close()

    const after = open('calorithm-test-upgrade-v8')
    expect(await after.table('foods').get('f1')).toEqual({
      id: 'f1',
      name: 'Oats',
      catalog_id: null,
      barcode: null,
    })
    // An older version dropped barcodes it pulled, so foods are read again from the start.
    expect(await after.sync_state.get('foods')).toEqual({
      table: 'foods',
      cursor: null,
      lastPullAt: 1,
      unreadable: [],
    })
    expect(await after.sync_state.get('weights')).toMatchObject({ cursor })
    await after.table('foods').put({ id: 'f2', name: 'Paneer', barcode: '8901234567890' })
    expect(
      (await after.table('foods').where('barcode').equals('8901234567890').toArray()).map(
        (food: { id: string }) => food.id,
      ),
    ).toEqual(['f2'])
  })

  it('gives existing log entries no serving, and pulls them again, when upgraded to version 9', async () => {
    const [v1, v2, v3, v4, v5, v6, v7, v8] = schemaVersions
    if (!v1 || !v2 || !v3 || !v4 || !v5 || !v6 || !v7 || !v8)
      throw new Error('missing schema versions')
    const before = open('calorithm-test-upgrade-v9', [v1, v2, v3, v4, v5, v6, v7, v8])
    await before.table('log_entries').put({ id: 'l1', date: '2026-11-20', kcal: 225 })
    const cursor = { updatedAt: '2026-11-22T10:00:00.000000+00:00', id: 'l1' }
    await before.table('sync_state').bulkPut([
      { table: 'log_entries', cursor, lastPullAt: 1, unreadable: [] },
      { table: 'foods', cursor, lastPullAt: 1, unreadable: [] },
    ])
    before.close()

    const after = open('calorithm-test-upgrade-v9')
    expect(await after.table('log_entries').get('l1')).toEqual({
      id: 'l1',
      date: '2026-11-20',
      kcal: 225,
      serving_size: null,
      serving_unit: null,
    })
    // An older version dropped the serving from entries it pulled, so they're read again.
    expect(await after.sync_state.get('log_entries')).toMatchObject({ cursor: null })
    expect(await after.sync_state.get('foods')).toMatchObject({ cursor })
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
