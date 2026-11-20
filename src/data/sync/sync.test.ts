import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { RETENTION_DAYS } from '@/domain/retention'

import type { LocalDb } from '../db'
import { softDelete, visibleRows, writeRow } from '../repository'
import type { SyncContext } from './push'
import { syncOnce } from './sync'
import { FakeRemote } from './testing/fakeRemote'
import { closeAll, manualClock, openDb, parentSpec, sync, userId } from './testing/fixtures'

const DAY = 86_400_000

let remote: FakeRemote
let time: ReturnType<typeof manualClock>

const device = (name: string): SyncContext => ({
  db: openDb(`calorithm-test-${name}`),
  remote,
  tables: [parentSpec],
  clock: time.clock,
  random: () => 0,
})

beforeEach(() => {
  remote = new FakeRemote(userId)
  time = manualClock()
})

afterEach(closeAll)

const nameOf = async (db: LocalDb, id: string) =>
  parentSpec.parse(await db.rows('parent').get(id))?.name

describe('syncOnce', () => {
  it('pushes local changes, then pulls everyone else’s', async () => {
    const phone = device('phone')
    const laptop = device('laptop')
    const row = await writeRow(phone.db, parentSpec, { ...sync(), name: 'oats' }, time.clock)

    expect(await syncOnce(phone)).toMatchObject({ status: 'done' })
    await syncOnce(laptop)

    expect(await nameOf(laptop.db, row.id)).toBe('oats')
  })

  // Sync case 5: the newest edit wins even when the older one reaches the server last.
  it('keeps the most recent edit when an older offline edit syncs last', async () => {
    const phone = device('phone')
    const laptop = device('laptop')
    const row = await writeRow(phone.db, parentSpec, { ...sync(), name: 'original' }, time.clock)
    await syncOnce(phone)
    await syncOnce(laptop)

    // The phone edits offline first; the laptop edits later and syncs at once.
    time.advance(60_000)
    await writeRow(phone.db, parentSpec, { ...row, name: 'older edit' }, time.clock)
    time.advance(60_000)
    const latest = { ...row, name: 'newer edit' }
    await writeRow(laptop.db, parentSpec, latest, time.clock)
    await syncOnce(laptop)

    // The phone comes back online last.
    remote.advance(120_000)
    await syncOnce(phone)
    await syncOnce(laptop)

    expect(remote.rows('parent')[0]).toMatchObject({ name: 'newer edit' })
    expect(await nameOf(phone.db, row.id)).toBe('newer edit')
    expect(await nameOf(laptop.db, row.id)).toBe('newer edit')
    expect(await phone.db.outbox.count()).toBe(0)
  })

  // Sync case 9.
  it('carries a soft delete to the other device, which then hides the row', async () => {
    const phone = device('phone')
    const laptop = device('laptop')
    const row = await writeRow(phone.db, parentSpec, { ...sync(), name: 'oats' }, time.clock)
    await syncOnce(phone)
    await syncOnce(laptop)
    expect(await visibleRows(laptop.db, parentSpec)).toHaveLength(1)

    time.advance(60_000)
    await softDelete(phone.db, parentSpec, row.id, time.clock)
    remote.advance(60_000)
    await syncOnce(phone)
    await syncOnce(laptop)

    expect(await visibleRows(laptop.db, parentSpec)).toEqual([])
  })

  // Sync case 16.
  it('does a full resync when the last pull is older than the retention window', async () => {
    const phone = device('phone')
    const kept = await writeRow(phone.db, parentSpec, { ...sync(), name: 'kept' }, time.clock)
    const erased = await writeRow(phone.db, parentSpec, { ...sync(), name: 'erased' }, time.clock)
    await syncOnce(phone)

    // Away for longer than the retention window; meanwhile the server erased a deleted row,
    // so no pull will ever send its delete.
    time.advance((RETENTION_DAYS + 1) * DAY)
    remote.hardDelete('parent', erased.id)
    const pending = await writeRow(phone.db, parentSpec, { ...sync(), name: 'unsent' }, time.clock)
    remote.offline = true

    // Offline: the outbox can't be pushed, so nothing is cleared yet.
    expect((await syncOnce(phone)).status).toBe('retry_later')
    expect(await nameOf(phone.db, erased.id)).toBe('erased')

    remote.offline = false
    time.advance(60_000)
    expect(await syncOnce(phone)).toMatchObject({ status: 'done', resynced: true })

    expect(await nameOf(phone.db, kept.id)).toBe('kept')
    expect(await nameOf(phone.db, pending.id)).toBe('unsent')
    expect(await nameOf(phone.db, erased.id)).toBeUndefined()
  })

  it('keeps a change the server refused visible through a resync', async () => {
    const phone = device('phone')
    remote.reject = (_table, row) =>
      row.name === 'refused' ? { code: '23514', message: 'violates check constraint' } : null
    const row = await writeRow(phone.db, parentSpec, { ...sync(), name: 'refused' }, time.clock)

    // A device that has never pulled always does a full pull.
    expect(await syncOnce(phone)).toMatchObject({ status: 'done', resynced: true })

    expect(await nameOf(phone.db, row.id)).toBe('refused')
    expect((await phone.db.outbox.toArray())[0]?.failure?.code).toBe('23514')
  })

  it('doesn’t resync within the retention window', async () => {
    const phone = device('phone')
    await writeRow(phone.db, parentSpec, { ...sync(), name: 'oats' }, time.clock)
    await syncOnce(phone)
    time.advance(DAY)

    expect(await syncOnce(phone)).toMatchObject({ status: 'done', resynced: false })
  })
})
