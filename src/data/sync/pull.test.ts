import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { LocalDb } from '../db'
import { writeRow } from '../repository'
import type { TableSpec } from '../tables'
import { overlapStart, pull } from './pull'
import type { SyncContext } from './push'
import type { PullFrom } from './remote'
import { FakeRemote } from './testing/fakeRemote'
import {
  childSpec,
  closeAll,
  manualClock,
  openDb,
  parentSpec,
  sync,
  userId,
} from './testing/fixtures'

let db: LocalDb
let remote: FakeRemote
let time: ReturnType<typeof manualClock>
let ctx: SyncContext

beforeEach(() => {
  db = openDb('calorithm-test-pull')
  remote = new FakeRemote(userId)
  time = manualClock()
  ctx = { db, remote, tables: [parentSpec], clock: time.clock, random: () => 0 }
})

afterEach(closeAll)

// A write from another device, straight to the server.
const serverWrite = async (name: string, id: string = crypto.randomUUID()) => {
  const row = { ...sync({ id, client_updated_at: time.clock().toISOString() }), name }
  const result = await remote.upsert('parent', [row])
  expect(result.ok).toBe(true)
  return id
}

describe('pull', () => {
  it('pulls every row for a device that has never pulled, and saves the cursor exactly', async () => {
    await serverWrite('a')
    remote.advance(1_000)
    const last = await serverWrite('b')

    expect(await pull(ctx)).toEqual({
      status: 'done',
      applied: 2,
      skipped: 0,
      invalid: 0,
      resynced: ['parent'],
    })

    expect(await db.rows('parent').count()).toBe(2)
    const state = await db.sync_state.get('parent')
    const stored = remote.rows('parent').at(-1)
    // The cursor keeps the server's microseconds, which a Date would drop.
    expect(state?.cursor).toEqual({ updatedAt: stored?.updated_at, id: last })
    expect(state?.cursor?.updatedAt).toMatch(/\.\d{6}\+00:00$/)
    expect(state?.lastPullAt).toBe(time.clock().getTime())
  })

  // Sync case 6.
  it('doesn’t overwrite a local row that has an unsent change', async () => {
    const id = await serverWrite('server version')
    await writeRow(db, parentSpec, { ...sync({ id }), name: 'local edit' }, time.clock)

    expect(await pull(ctx)).toMatchObject({ applied: 0, skipped: 1 })
    expect(await db.rows('parent').get(id)).toMatchObject({ name: 'local edit' })
  })

  // Sync case 7.
  it('still pulls a row committed late, behind the saved cursor', async () => {
    remote.holdNextUpsert = true
    const late = await serverWrite('slow transaction')
    remote.advance(10_000)
    await serverWrite('fast transaction')
    await pull(ctx)
    expect(await db.rows('parent').get(late)).toBeUndefined()

    // The slow transaction commits now, with an updated_at 10 seconds behind the cursor.
    remote.release()
    await pull(ctx)

    expect(await db.rows('parent').get(late)).toMatchObject({ name: 'slow transaction' })
  })

  // Sync case 8.
  it('pulls every row when rows sharing one updated_at span a page boundary', async () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map((name) => ({
      ...sync({ client_updated_at: time.clock().toISOString() }),
      name,
    }))
    // One statement stamps every row with the same updated_at.
    await remote.upsert('parent', rows)

    expect(await pull({ ...ctx, pageSize: 2 })).toMatchObject({ applied: 5 })
    expect(await db.rows('parent').count()).toBe(5)
  })

  it('skips a row the server sends in a shape this app can’t read, and applies the rest', async () => {
    await serverWrite('fine')
    await remote.upsert('parent', [{ ...sync(), client_updated_at: time.clock().toISOString() }])

    expect(await pull(ctx)).toMatchObject({ applied: 1, invalid: 1 })
  })

  it('keeps the cursor and reports a retry when the network fails', async () => {
    await serverWrite('a')
    await pull(ctx)
    const before = await db.sync_state.get('parent')
    remote.offline = true

    expect(await pull(ctx)).toEqual({ status: 'retry_later' })
    expect(await db.sync_state.get('parent')).toEqual(before)
  })

  it('reports an auth error so the session can be refreshed', async () => {
    remote.failNextWith = { kind: 'auth', code: 'PGRST301', message: 'JWT expired' }
    remote.pullPage = async () => ({
      ok: false,
      error: { kind: 'auth', code: 'PGRST301', message: 'JWT expired' },
    })

    expect(await pull(ctx)).toEqual({ status: 'needs_auth' })
  })

  it('applies a row deleted on another device, keeping it hidden', async () => {
    const id = await serverWrite('gone')
    await remote.upsert('parent', [
      {
        ...sync({
          id,
          deleted_at: '2026-11-20T10:05:00.000Z',
          client_updated_at: '2026-11-20T10:05:00.000Z',
        }),
        name: 'gone',
      },
    ])

    await pull(ctx)

    expect(await db.rows('parent').get(id)).toMatchObject({
      deleted_at: '2026-11-20T10:05:00.000Z',
    })
  })

  it('remembers rows it can’t read and applies them once an upgraded app can', async () => {
    await serverWrite('readable')
    const unreadable = crypto.randomUUID()
    // A newer app version's row: no `name` column in the shape this version expects.
    await remote.upsert('parent', [
      { ...sync({ id: unreadable, client_updated_at: time.clock().toISOString() }), title: 'v2' },
    ])

    expect(await pull(ctx)).toMatchObject({ applied: 1, invalid: 1 })
    expect((await db.sync_state.get('parent'))?.unreadable).toEqual([unreadable])

    // The upgraded app reads the new shape.
    const upgraded: TableSpec = {
      ...parentSpec,
      parse: (raw) =>
        parentSpec.parse(
          typeof raw === 'object' && raw !== null ? { name: 'from v2', ...raw } : raw,
        ),
    }
    await pull({ ...ctx, tables: [upgraded] })

    expect(await db.rows('parent').get(unreadable)).toBeDefined()
    expect((await db.sync_state.get('parent'))?.unreadable).toEqual([])
  })

  it('never deletes a local row in a full pull because its server copy can’t be read', async () => {
    const id = crypto.randomUUID()
    await db.table('parent').put({
      ...sync({ id, client_updated_at: '2026-11-20T09:00:00.000Z' }),
      updated_at: '2026-11-20T09:00:00.000Z',
      name: 'local copy',
    })
    await remote.upsert('parent', [
      { ...sync({ id, client_updated_at: time.clock().toISOString() }), title: 'v2' },
    ])

    await pull(ctx, { full: true })

    expect(await db.rows('parent').get(id)).toBeDefined()
  })

  it('falls back to a full pull when the saved cursor can’t be read', async () => {
    await serverWrite('a')
    await db.sync_state.put({
      table: 'parent',
      cursor: { updatedAt: 'not a time', id: 'x' },
      lastPullAt: time.clock().getTime(),
      unreadable: [],
    })

    expect(await pull(ctx)).toMatchObject({ status: 'done', applied: 1 })
  })

  it('decides a full resync for each table on its own', async () => {
    const both = { ...ctx, tables: [parentSpec, childSpec] }
    await pull({ ...both, tables: [parentSpec] })
    const requests: { table: string; from: PullFrom }[] = []
    const pullPage = remote.pullPage.bind(remote)
    remote.pullPage = (table, from, limit) => {
      requests.push({ table, from })
      return pullPage(table, from, limit)
    }

    expect(await pull(both)).toMatchObject({ status: 'done', resynced: ['child'] })
    expect(requests.map((r) => [r.table, r.from.kind])).toEqual([
      ['parent', 'all'],
      ['child', 'all'],
    ])
  })
})

describe('overlapStart', () => {
  it('starts a minute early from a Postgres timestamp with microseconds', () => {
    expect(overlapStart('2026-11-20T10:00:00.123456+00:00')).toBe('2026-11-20T09:59:00.123Z')
  })

  it('reads the format variants Postgres can return', () => {
    expect(overlapStart('2026-11-20 10:00:00.5+00')).toBe('2026-11-20T09:59:00.500Z')
    expect(overlapStart('2026-11-20T10:00:00+0530')).toBe('2026-11-20T04:29:00.000Z')
    expect(overlapStart('2026-11-20T10:00:00Z')).toBe('2026-11-20T09:59:00.000Z')
  })

  it('returns null for text that isn’t a timestamp', () => {
    expect(overlapStart('not a time')).toBeNull()
    expect(overlapStart('2026-13-40T99:00:00Z')).toBeNull()
  })
})
