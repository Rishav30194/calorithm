import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { LocalDb } from '../db'
import { createFood } from '../foods'
import { logFood, removeEntry } from '../log'
import { closeAll, manualClock, openDb, userId } from '../sync/testing/fixtures'
import type { SyncRow } from '../tables'
import { removeWeighIn, setWeighIn } from '../weights'
import { exportReminderOn, firstDataDay, lastExportDay, recordExport } from './reminder'

let db: LocalDb
let time: ReturnType<typeof manualClock>

beforeEach(() => {
  db = openDb('calorithm-test-reminder')
  time = manualClock()
})

afterEach(closeAll)

const oats = () =>
  createFood(db, time.clock, userId, {
    name: 'Oats',
    servingSize: 40,
    servingUnit: 'g',
    kcal: 150,
    proteinG: 5,
  })

describe('recordExport and lastExportDay', () => {
  it('has no export until one is recorded, then keeps the latest', async () => {
    expect(await lastExportDay(db)).toBeNull()
    await recordExport(db, '2026-10-01')
    await recordExport(db, '2026-11-21')
    expect(await lastExportDay(db)).toBe('2026-11-21')
  })

  it('writes nothing to the outbox, since the date stays on this device', async () => {
    await recordExport(db, '2026-11-21')
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('firstDataDay', () => {
  it('is null with no log entries or weigh-ins', async () => {
    await oats()
    expect(await firstDataDay(db)).toBeNull()
  })

  it('is the oldest live log entry or weigh-in', async () => {
    const food = await oats()
    await logFood(db, time.clock, userId, { date: '2026-10-05', meal: 'lunch', food, servings: 1 })
    await setWeighIn(db, time.clock, userId, { date: '2026-10-09', kg: 82 })
    expect(await firstDataDay(db)).toBe('2026-10-05')

    await setWeighIn(db, time.clock, userId, { date: '2026-09-30', kg: 83 })
    expect(await firstDataDay(db)).toBe('2026-09-30')
  })

  it('skips deleted rows', async () => {
    const food = await oats()
    const old = await logFood(db, time.clock, userId, {
      date: '2026-09-01',
      meal: 'lunch',
      food,
      servings: 1,
    })
    await removeEntry(db, time.clock, old.id)
    await setWeighIn(db, time.clock, userId, { date: '2026-09-02', kg: 82 })
    await removeWeighIn(db, time.clock, userId, '2026-09-02')
    await setWeighIn(db, time.clock, userId, { date: '2026-10-09', kg: 82 })
    expect(await firstDataDay(db)).toBe('2026-10-09')
  })
})

describe('firstDataDay with unreadable rows', () => {
  it('skips a row it cannot read and finds the oldest readable one', async () => {
    // A newer version's row: this version's spec can't read it.
    const unreadable: SyncRow & { date: string } = {
      id: 'e0000000-0000-4000-8000-000000000001',
      user_id: userId,
      date: '2026-08-01',
      deleted_at: null,
      updated_at: '',
      client_updated_at: '',
      schema_version: 2,
    }
    await db.rows('log_entries').put(unreadable)
    const food = await oats()
    await logFood(db, time.clock, userId, { date: '2026-09-15', meal: 'lunch', food, servings: 1 })
    expect(await firstDataDay(db)).toBe('2026-09-15')
  })
})

describe('exportReminderOn', () => {
  it('reminds a device with old data that never exported, until it exports', async () => {
    await setWeighIn(db, time.clock, userId, { date: '2026-10-01', kg: 82 })
    expect(await exportReminderOn(db, '2026-11-21')).toEqual({ kind: 'never' })

    await recordExport(db, '2026-11-21')
    expect(await exportReminderOn(db, '2026-11-21')).toBeNull()
    expect(await exportReminderOn(db, '2026-12-23')).toEqual({
      kind: 'stale',
      lastExportDay: '2026-11-21',
    })
  })
})
