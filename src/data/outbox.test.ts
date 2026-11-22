import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { LocalDb } from './db'
import { createFood } from './foods'
import { readOutbox } from './outbox'
import { closeAll, manualClock, openDb, userId } from './sync/testing/fixtures'

let db: LocalDb
let time: ReturnType<typeof manualClock>

beforeEach(() => {
  db = openDb('calorithm-test-outbox')
  time = manualClock()
})

afterEach(closeAll)

const oats = {
  name: 'Oats',
  servingSize: 40,
  servingUnit: 'g',
  kcal: 150,
  proteinG: 5,
  carbsG: 20,
  fatG: 3,
}

describe('readOutbox', () => {
  it('counts changes waiting and lists the ones the server refused', async () => {
    await createFood(db, time.clock, userId, oats)
    const refused = await createFood(db, time.clock, userId, { ...oats, name: 'Milk' })
    const entry = (await db.outbox.toArray()).find((item) => item.rowId === refused.id)
    if (entry?.seq === undefined) throw new Error('no outbox entry')
    await db.outbox.update(entry.seq, { failure: { code: '23514', message: 'kcal too high' } })

    expect(await readOutbox(db)).toEqual({
      ok: true,
      summary: {
        pending: 1,
        failed: [{ seq: entry.seq, table: 'foods', code: '23514', message: 'kcal too high' }],
      },
    })
  })

  it('reports a failed read instead of throwing', async () => {
    db.close()
    expect(await readOutbox(db)).toEqual({ ok: false })
  })
})
