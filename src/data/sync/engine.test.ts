import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { LocalDb } from '../db'
import { writeRow } from '../repository'
import {
  createEngine,
  type Engine,
  type EngineDeps,
  type SyncStatus,
  type Timers,
  WRITE_DELAY_MS,
} from './engine'
import type { RemoteResult } from './remote'
import { FakeRemote } from './testing/fakeRemote'
import { closeAll, openDb, parentSpec, sync, userId } from './testing/fixtures'

// A clock and timer queue the test moves by hand. Each due timer runs, then the test waits
// for the sync it started to finish, so time advances exactly as it would for the app.
const manualTime = (start = Date.parse('2026-11-20T10:00:00.000Z')) => {
  let now = start
  let nextId = 0
  const queue = new Map<number, { at: number; callback: () => void }>()
  const timers: Timers = {
    set: (callback, ms) => {
      const id = nextId++
      queue.set(id, { at: now + ms, callback })
      return () => queue.delete(id)
    },
  }
  const advance = async (ms: number, idle: () => Promise<void>) => {
    const end = now + ms
    for (;;) {
      const due = [...queue.entries()]
        .filter(([, timer]) => timer.at <= end)
        .sort(([, a], [, b]) => a.at - b.at)[0]
      if (!due) break
      queue.delete(due[0])
      now = due[1].at
      due[1].callback()
      await idle()
    }
    now = end
  }
  return { timers, clock: () => new Date(now), now: () => now, advance }
}

let db: LocalDb
let remote: FakeRemote
let time: ReturnType<typeof manualTime>
let statuses: SyncStatus[]
let minimum: RemoteResult<string>
let refreshed: number
let refreshWorks: boolean
let engine: Engine

const make = (overrides: Partial<EngineDeps> = {}): Engine =>
  createEngine({
    ctx: { db, remote, tables: [parentSpec], clock: time.clock, random: () => 0 },
    appVersion: '0.2.0',
    minAppVersion: async () => minimum,
    refreshSession: async () => {
      refreshed++
      return refreshWorks
    },
    onStatus: (status) => statuses.push(status),
    timers: time.timers,
    ...overrides,
  })

const last = () => statuses.at(-1)
const advance = (ms: number) => time.advance(ms, engine.whenIdle)
const write = (name: string) => writeRow(db, parentSpec, { ...sync(), name }, time.clock)

beforeEach(() => {
  db = openDb('calorithm-test-engine')
  remote = new FakeRemote(userId)
  time = manualTime()
  statuses = []
  minimum = { ok: true, value: '0.0.0' }
  refreshed = 0
  refreshWorks = true
  engine = make()
})

afterEach(async () => {
  engine.stop()
  await engine.whenIdle()
  await closeAll()
})

describe('createEngine', () => {
  it('syncs on start and reports when it finished', async () => {
    await write('oats')

    engine.request('start')
    await engine.whenIdle()

    expect(remote.rows('parent')).toHaveLength(1)
    expect(statuses[0]).toMatchObject({ state: 'syncing' })
    expect(last()).toEqual({ state: 'idle', lastSyncedAt: time.now(), problem: null })
  })

  it('waits a few seconds after a write, then syncs the writes made meanwhile together', async () => {
    await write('a')
    engine.request('write')
    await advance(1_000)
    await write('b')
    engine.request('write')
    await advance(1_000)
    await write('c')
    engine.request('write')
    expect(remote.upserts).toEqual([])

    await advance(WRITE_DELAY_MS)

    expect(remote.upserts).toHaveLength(1)
    expect(remote.rows('parent')).toHaveLength(3)
  })

  it('never lets a steady stream of writes postpone sync', async () => {
    for (let i = 0; i < 10; i++) {
      await write(`w${i}`)
      engine.request('write')
      await advance(2_000)
    }

    // Writes 2 seconds apart, each sooner than the delay, still sync along the way.
    expect(remote.upserts.length).toBeGreaterThanOrEqual(5)
  })

  it('keeps a sooner backoff retry when a write arrives', async () => {
    await write('a')
    remote.offline = true
    engine.request('start')
    await engine.whenIdle()
    remote.offline = false
    // The backoff retry is due in 1 second (random = 0 gives the floor).
    await write('b')
    engine.request('write')

    await advance(1_000)

    expect(remote.rows('parent')).toHaveLength(2)
  })

  it('runs one sync at a time, and once more for a request made during it', async () => {
    let entered = () => {}
    const firstUpsertStarted = new Promise<void>((resolve) => {
      entered = resolve
    })
    let open = () => {}
    const gate = new Promise<void>((resolve) => {
      open = resolve
    })
    let running = 0
    let most = 0
    let calls = 0
    const upsert = remote.upsert.bind(remote)
    remote.upsert = async (table, rows) => {
      running++
      most = Math.max(most, running)
      calls++
      // Only the first upsert waits, so a second sync running alongside it would overlap.
      if (calls === 1) {
        entered()
        await gate
      }
      running--
      return upsert(table, rows)
    }
    await write('first')
    engine.request('start')
    await firstUpsertStarted

    // Requests made while the first sync waits on the server.
    await write('second')
    engine.request('online')
    engine.request('visible')
    open()
    await engine.whenIdle()

    expect(most).toBe(1)
    expect(remote.upserts).toHaveLength(2)
    expect(remote.rows('parent')).toHaveLength(2)
  })

  it('reports offline and retries on its own until the network returns', async () => {
    await write('oats')
    remote.offline = true

    engine.request('start')
    await engine.whenIdle()
    expect(last()).toMatchObject({ state: 'idle', problem: 'offline' })

    remote.offline = false
    await advance(60_000)

    expect(remote.rows('parent')).toHaveLength(1)
    expect(last()).toMatchObject({ problem: null })
  })

  it('refreshes an expired session, then syncs at once', async () => {
    await write('oats')
    remote.failNextWith = { kind: 'auth', code: 'PGRST301', message: 'JWT expired' }

    engine.request('start')
    await engine.whenIdle()

    expect(refreshed).toBe(1)
    expect(remote.rows('parent')).toHaveLength(1)
    expect(last()).toMatchObject({ problem: null })
  })

  it('reports a session that can’t be refreshed, without looping', async () => {
    refreshWorks = false
    remote.pullPage = async () => ({
      ok: false,
      error: { kind: 'auth', code: 'PGRST301', message: 'JWT expired' },
    })

    engine.request('start')
    await engine.whenIdle()
    await advance(10 * 60_000)

    expect(refreshed).toBe(1)
    expect(last()).toMatchObject({ state: 'idle', problem: 'signed_out' })
  })

  // Sync case 13.
  it('stops syncing when the app is older than the minimum version', async () => {
    minimum = { ok: true, value: '0.3.0' }
    await write('oats')

    engine.request('start')
    await engine.whenIdle()
    engine.request('write')
    await advance(60_000)

    expect(last()).toEqual({ state: 'update_required', minimum: '0.3.0' })
    expect(remote.upserts).toEqual([])
  })

  it('treats an unreachable version check as offline', async () => {
    minimum = { ok: false, error: { kind: 'network', code: 'network', message: 'Failed to fetch' } }

    engine.request('start')
    await engine.whenIdle()

    expect(last()).toMatchObject({ state: 'idle', problem: 'offline' })
  })

  it('does nothing after stop', async () => {
    await write('oats')
    engine.request('write')
    engine.stop()

    await advance(60_000)

    expect(remote.upserts).toEqual([])
  })
})
