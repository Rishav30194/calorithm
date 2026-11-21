import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { weightId } from './dayId'
import type { LocalDb } from './db'
import { closeAll, manualClock, openDb, userId } from './sync/testing/fixtures'
import { weightsSpec } from './tables'
import { removeWeighIn, setWeighIn, weighIns } from './weights'

let db: LocalDb
let time: ReturnType<typeof manualClock>

beforeEach(() => {
  db = openDb('calorithm-test-weights')
  time = manualClock()
})

afterEach(closeAll)

const outboxFor = async (id: string) =>
  db.outbox.where('[table+rowId]').equals(['weights', id]).first()

describe('setWeighIn', () => {
  it('writes the row with the id derived from the user and date, and queues it', async () => {
    const result = await setWeighIn(db, time.clock, userId, { date: '2026-11-20', kg: 82.4 })

    const id = await weightId(userId, '2026-11-20')
    expect(result).toEqual({ ok: true, row: expect.objectContaining({ id, weight_kg: 82.4 }) })
    expect(weightsSpec.parse(await db.rows('weights').get(id))).toMatchObject({
      user_id: userId,
      date: '2026-11-20',
      weight_kg: 82.4,
      deleted_at: null,
    })
    expect(await outboxFor(id)).toMatchObject({ table: 'weights', rev: 1 })
  })

  it('replaces the first weigh-in of a day with the second', async () => {
    await setWeighIn(db, time.clock, userId, { date: '2026-11-20', kg: 82.4 })
    time.advance(60_000)
    await setWeighIn(db, time.clock, userId, { date: '2026-11-20', kg: 81.9 })

    expect(await weighIns(db)).toEqual([{ date: '2026-11-20', kg: 81.9 }])
    expect(await db.rows('weights').count()).toBe(1)
    expect(await outboxFor(await weightId(userId, '2026-11-20'))).toMatchObject({ rev: 2 })
  })

  it('rounds to two decimals before storing', async () => {
    await setWeighIn(db, time.clock, userId, { date: '2026-11-20', kg: 81.6466266 })
    expect(await weighIns(db)).toEqual([{ date: '2026-11-20', kg: 81.65 }])
  })

  it('refuses a weight outside 20 to 400 kg, and writes nothing', async () => {
    expect(await setWeighIn(db, time.clock, userId, { date: '2026-11-20', kg: 19.99 })).toEqual({
      ok: false,
      reason: 'out_of_range',
    })
    expect(await setWeighIn(db, time.clock, userId, { date: '2026-11-20', kg: 400.01 })).toEqual({
      ok: false,
      reason: 'out_of_range',
    })
    expect(await db.rows('weights').count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('refuses a date the database can’t store, and writes nothing', async () => {
    for (const date of ['1999-12-31', '2026-02-30', '20/11/2026', '']) {
      expect(await setWeighIn(db, time.clock, userId, { date, kg: 80 })).toEqual({
        ok: false,
        reason: 'invalid_date',
      })
    }
    expect(await setWeighIn(db, time.clock, userId, { date: '2000-01-01', kg: 80 })).toMatchObject({
      ok: true,
    })
    expect(await db.outbox.count()).toBe(1)
  })

  it('brings back a weigh-in deleted earlier that day', async () => {
    await setWeighIn(db, time.clock, userId, { date: '2026-11-20', kg: 82.4 })
    await removeWeighIn(db, time.clock, userId, '2026-11-20')
    await setWeighIn(db, time.clock, userId, { date: '2026-11-20', kg: 82 })

    expect(await weighIns(db)).toEqual([{ date: '2026-11-20', kg: 82 }])
  })
})

describe('removeWeighIn', () => {
  it('soft deletes the day’s weigh-in and queues the change', async () => {
    await setWeighIn(db, time.clock, userId, { date: '2026-11-20', kg: 82.4 })
    time.advance(60_000)
    await removeWeighIn(db, time.clock, userId, '2026-11-20')

    const id = await weightId(userId, '2026-11-20')
    expect(weightsSpec.parse(await db.rows('weights').get(id))?.deleted_at).toBe(
      time.clock().toISOString(),
    )
    expect(await weighIns(db)).toEqual([])
    expect(await outboxFor(id)).toMatchObject({ rev: 2 })
  })

  it('does nothing for a day without a weigh-in', async () => {
    await removeWeighIn(db, time.clock, userId, '2026-11-20')
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('weighIns', () => {
  it('lists visible weigh-ins oldest first', async () => {
    await setWeighIn(db, time.clock, userId, { date: '2026-11-21', kg: 82 })
    await setWeighIn(db, time.clock, userId, { date: '2026-11-19', kg: 83 })
    await setWeighIn(db, time.clock, userId, { date: '2026-11-20', kg: 82.5 })
    await removeWeighIn(db, time.clock, userId, '2026-11-20')

    expect(await weighIns(db)).toEqual([
      { date: '2026-11-19', kg: 83 },
      { date: '2026-11-21', kg: 82 },
    ])
  })
})
