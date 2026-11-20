import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BACKOFF_MIN_MS } from '@/domain/backoff'

import type { LocalDb } from '../db'
import { writeRow } from '../repository'
import { push, type SyncContext } from './push'
import { FakeRemote } from './testing/fakeRemote'
import {
  childSpec,
  closeAll,
  manualClock,
  openDb,
  parentSpec,
  renamedSpec,
  sync,
  userId,
} from './testing/fixtures'

let db: LocalDb
let remote: FakeRemote
let time: ReturnType<typeof manualClock>
let ctx: SyncContext

beforeEach(() => {
  db = openDb('calorithm-test-push')
  remote = new FakeRemote(userId)
  time = manualClock()
  // random = 0 makes every backoff the floor, so tests can step past it exactly.
  ctx = {
    db,
    remote,
    tables: [parentSpec, childSpec, renamedSpec],
    clock: time.clock,
    random: () => 0,
  }
})

afterEach(closeAll)

describe('push', () => {
  it('sends pending rows and clears their entries', async () => {
    const row = await writeRow(db, parentSpec, { ...sync(), name: 'oats' }, time.clock)

    expect(await push(ctx)).toEqual({ status: 'done', sent: 1, failed: 0 })

    expect(remote.rows('parent')).toEqual([expect.objectContaining({ id: row.id, name: 'oats' })])
    expect(await db.outbox.count()).toBe(0)
  })

  it('does nothing when the outbox is empty', async () => {
    expect(await push(ctx)).toEqual({ status: 'done', sent: 0, failed: 0 })
    expect(remote.upserts).toEqual([])
  })

  // Sync case 2.
  it('creates no duplicate when a resend follows a lost response', async () => {
    const row = await writeRow(db, parentSpec, { ...sync(), name: 'oats' }, time.clock)
    remote.loseNextResponse = true

    expect((await push(ctx)).status).toBe('retry_later')
    expect(await db.outbox.count()).toBe(1)

    time.advance(BACKOFF_MIN_MS)
    expect((await push(ctx)).status).toBe('done')

    expect(remote.rows('parent').filter((r) => r.id === row.id)).toHaveLength(1)
    expect(await db.outbox.count()).toBe(0)
  })

  // Sync case 4.
  it('pushes parent tables before child tables, whatever order they were written in', async () => {
    const p = await writeRow(db, parentSpec, { ...sync(), name: 'soup' }, time.clock)
    await writeRow(db, childSpec, { ...sync(), parent_id: p.id, note: 'first' }, time.clock)
    await writeRow(db, parentSpec, { ...sync(), name: 'stew' }, time.clock)
    // Edit the first parent after its child, so insertion order alone would send the child first.
    await writeRow(db, parentSpec, { ...p, name: 'soup 2' }, time.clock)

    await push(ctx)

    expect(remote.upserts.map((call) => call.table)).toEqual(['parent', 'child'])
  })

  // Sync case 10.
  it('marks a rejected row failed, sends the rest, and doesn’t retry it', async () => {
    const good = await writeRow(db, parentSpec, { ...sync(), name: 'ok' }, time.clock)
    const bad = await writeRow(db, parentSpec, { ...sync(), name: 'bad' }, time.clock)
    remote.reject = (_table, row) =>
      row.name === 'bad' ? { code: '23514', message: 'violates check constraint' } : null

    expect(await push(ctx)).toEqual({ status: 'done', sent: 1, failed: 1 })

    expect(remote.rows('parent').map((r) => r.id)).toEqual([good.id])
    const [entry] = await db.outbox.toArray()
    expect(entry).toMatchObject({
      rowId: bad.id,
      failure: { code: '23514', message: 'violates check constraint' },
    })

    const callsBefore = remote.upserts.length
    time.advance(60_000)
    expect(await push(ctx)).toEqual({ status: 'done', sent: 0, failed: 0 })
    expect(remote.upserts).toHaveLength(callsBefore)
  })

  // Sync case 11.
  it('backs off after a network error, then retries', async () => {
    await writeRow(db, parentSpec, { ...sync(), name: 'oats' }, time.clock)
    remote.offline = true

    expect((await push(ctx)).status).toBe('retry_later')
    const [entry] = await db.outbox.toArray()
    expect(entry).toMatchObject({
      attempts: 1,
      nextAttemptAt: time.clock().getTime() + BACKOFF_MIN_MS,
      failure: null,
    })

    remote.offline = false
    expect((await push(ctx)).status).toBe('retry_later')
    expect(remote.upserts).toEqual([])

    time.advance(BACKOFF_MIN_MS)
    expect((await push(ctx)).status).toBe('done')
    expect(await db.outbox.count()).toBe(0)
  })

  it('asks for a session refresh on an auth error and keeps the entry', async () => {
    await writeRow(db, parentSpec, { ...sync(), name: 'oats' }, time.clock)
    remote.failNextWith = { kind: 'auth', code: 'PGRST301', message: 'JWT expired' }

    expect((await push(ctx)).status).toBe('needs_auth')
    expect(await db.outbox.count()).toBe(1)
  })

  // Sync case 12.
  it('upgrades an entry written in an older schema version before sending it', async () => {
    const id = crypto.randomUUID()
    await db.outbox.add({
      table: 'renamed',
      rowId: id,
      row: { ...sync({ id }), label: 'old shape', client_updated_at: '2026-11-19T09:00:00.000Z' },
      schemaVersion: 1,
      rev: 1,
      attempts: 0,
      nextAttemptAt: 0,
      failure: null,
    })

    expect((await push(ctx)).status).toBe('done')

    expect(remote.rows('renamed')).toEqual([
      expect.objectContaining({ id, title: 'old shape', schema_version: 2 }),
    ])
    expect(remote.rows('renamed')[0]).not.toHaveProperty('label')
  })

  it('keeps an entry edited while its push was in flight', async () => {
    const row = await writeRow(db, parentSpec, { ...sync(), name: 'first' }, time.clock)
    const upsert = remote.upsert.bind(remote)
    remote.upsert = async (table, rows) => {
      time.advance(1_000)
      await writeRow(db, parentSpec, { ...row, name: 'second' }, time.clock)
      remote.upsert = upsert
      return upsert(table, rows)
    }

    await push(ctx)

    expect(await db.outbox.toArray()).toEqual([
      expect.objectContaining({
        rowId: row.id,
        rev: 2,
        row: expect.objectContaining({ name: 'second' }),
      }),
    ])
    expect((await push(ctx)).sent).toBe(1)
    expect(remote.rows('parent')[0]).toMatchObject({ name: 'second' })
  })

  it('fails an entry for a table this app doesn’t know', async () => {
    await db.outbox.add({
      table: 'retired',
      rowId: 'r1',
      row: {},
      schemaVersion: 1,
      rev: 1,
      attempts: 0,
      nextAttemptAt: 0,
      failure: null,
    })

    expect(await push(ctx)).toEqual({ status: 'done', sent: 0, failed: 1 })
    expect((await db.outbox.toArray())[0]?.failure?.code).toBe('unknown_table')
  })

  it('sends rows in batches no larger than the batch size', async () => {
    for (const name of ['a', 'b', 'c']) {
      await writeRow(db, parentSpec, { ...sync(), name }, time.clock)
    }

    await push({ ...ctx, batchSize: 2 })

    expect(remote.upserts.map((call) => call.ids.length)).toEqual([2, 1])
  })
})
