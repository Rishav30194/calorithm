import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { LocalDb } from '../db'
import { writeRow } from '../repository'
import { discardFailed } from './discard'
import { push, type SyncContext } from './push'
import { FakeRemote } from './testing/fakeRemote'
import { closeAll, manualClock, openDb, parentSpec, sync, userId } from './testing/fixtures'

let db: LocalDb
let remote: FakeRemote
let time: ReturnType<typeof manualClock>
let ctx: SyncContext

beforeEach(() => {
  db = openDb('calorithm-test-discard')
  remote = new FakeRemote(userId)
  time = manualClock()
  ctx = { db, remote, tables: [parentSpec], clock: time.clock, random: () => 0 }
  remote.reject = (_table, row) =>
    row.name === 'refused' ? { code: '23514', message: 'violates check constraint' } : null
})

afterEach(closeAll)

const failedEntry = async () => {
  await push(ctx)
  const [entry] = await db.outbox.toArray()
  expect(entry?.failure?.code).toBe('23514')
  return entry?.seq ?? -1
}

const nameOf = async (id: string) => parentSpec.parse(await db.rows('parent').get(id))?.name

describe('discardFailed', () => {
  it('drops the refused change and restores the server’s copy', async () => {
    const row = await writeRow(db, parentSpec, { ...sync(), name: 'accepted' }, time.clock)
    await push(ctx)
    time.advance(60_000)
    await writeRow(db, parentSpec, { ...row, name: 'refused' }, time.clock)
    const seq = await failedEntry()

    expect(await discardFailed(ctx, seq)).toEqual({ status: 'done' })

    expect(await db.outbox.count()).toBe(0)
    expect(await nameOf(row.id)).toBe('accepted')
  })

  it('removes a row that never reached the server', async () => {
    const row = await writeRow(db, parentSpec, { ...sync(), name: 'refused' }, time.clock)
    const seq = await failedEntry()

    await discardFailed(ctx, seq)

    expect(await db.rows('parent').get(row.id)).toBeUndefined()
  })

  it('keeps the failed change when the server can’t be reached', async () => {
    const row = await writeRow(db, parentSpec, { ...sync(), name: 'refused' }, time.clock)
    const seq = await failedEntry()
    remote.offline = true

    expect(await discardFailed(ctx, seq)).toEqual({ status: 'retry_later' })

    expect(await db.outbox.count()).toBe(1)
    expect(await nameOf(row.id)).toBe('refused')
  })

  it('leaves an entry that hasn’t failed alone', async () => {
    await writeRow(db, parentSpec, { ...sync(), name: 'pending' }, time.clock)
    const [entry] = await db.outbox.toArray()

    expect(await discardFailed(ctx, entry?.seq ?? -1)).toEqual({ status: 'done' })
    expect(await db.outbox.count()).toBe(1)
  })
})
