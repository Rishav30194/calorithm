import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LocalDb } from './db'
import { softDelete, visibleRows, writeRow } from './repository'
import { type ProfileRow, profileSpec } from './tables'

const userId = 'a0000000-0000-4000-8000-000000000001'
let db: LocalDb
let now = new Date('2026-11-20T10:00:00.000Z')
const clock = () => now

const draft = (overrides: Partial<ProfileRow> = {}): ProfileRow => ({
  id: userId,
  user_id: userId,
  height_cm: null,
  birth_date: null,
  sex: null,
  activity_level: null,
  units: 'metric',
  goal_rate_kg_per_week: 0,
  protein_g_per_kg: 1.8,
  calorie_floor_kcal: 1200,
  updated_at: '',
  client_updated_at: '',
  deleted_at: null,
  schema_version: 1,
  ...overrides,
})

beforeEach(() => {
  now = new Date('2026-11-20T10:00:00.000Z')
  db = new LocalDb('calorithm-test-repository')
})

afterEach(async () => {
  db.close()
  await Dexie.delete('calorithm-test-repository')
})

describe('writeRow', () => {
  it('writes the row and its outbox entry, stamped with the device time and schema version', async () => {
    await writeRow(db, profileSpec, draft(), clock)

    const row = await db.table('profile').get(userId)
    expect(row).toMatchObject({ client_updated_at: '2026-11-20T10:00:00.000Z', schema_version: 1 })
    const entries = await db.outbox.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      table: 'profile',
      rowId: userId,
      rev: 1,
      failure: null,
      row,
    })
  })

  // Sync case 3.
  it('writes neither the row nor the entry when the outbox write fails', async () => {
    db.outbox.hook('creating', () => {
      throw new Error('disk full')
    })

    await expect(writeRow(db, profileSpec, draft(), clock)).rejects.toThrow('disk full')

    expect(await db.table('profile').count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('collapses repeat edits of one row into one entry holding the latest row', async () => {
    await writeRow(db, profileSpec, draft({ units: 'metric' }), clock)
    now = new Date('2026-11-20T10:05:00.000Z')
    await writeRow(db, profileSpec, draft({ units: 'imperial' }), clock)

    const entries = await db.outbox.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      rev: 2,
      row: { units: 'imperial', client_updated_at: '2026-11-20T10:05:00.000Z' },
    })
  })

  it('clears a failure and the backoff when the row is edited again', async () => {
    await writeRow(db, profileSpec, draft(), clock)
    const [entry] = await db.outbox.toArray()
    await db.outbox.update(entry?.seq ?? 0, {
      failure: { code: '23514', message: 'check' },
      attempts: 3,
      nextAttemptAt: 99,
    })

    await writeRow(db, profileSpec, draft({ units: 'imperial' }), clock)

    expect(await db.outbox.toArray()).toEqual([
      expect.objectContaining({ failure: null, attempts: 0, nextAttemptAt: 0 }),
    ])
  })

  it('refuses a row that doesn’t match the table, as a bug', async () => {
    const bad = draft()
    Reflect.set(bad, 'units', 7)
    await expect(writeRow(db, profileSpec, bad, clock)).rejects.toThrow(/profile/)
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('softDelete and visibleRows', () => {
  it('marks the row deleted, queues it, and hides it', async () => {
    await writeRow(db, profileSpec, draft(), clock)
    now = new Date('2026-11-20T11:00:00.000Z')

    await softDelete(db, profileSpec, userId, clock)

    expect(await db.table('profile').get(userId)).toMatchObject({
      deleted_at: '2026-11-20T11:00:00.000Z',
    })
    expect((await db.outbox.toArray())[0]?.row).toMatchObject({
      deleted_at: '2026-11-20T11:00:00.000Z',
    })
    expect(await visibleRows(db, profileSpec)).toEqual([])
  })

  it('does nothing for a row that doesn’t exist', async () => {
    await softDelete(db, profileSpec, 'missing', clock)
    expect(await db.outbox.count()).toBe(0)
  })
})
