import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dbNameFor, type LocalDb } from '../db'
import { writeRow } from '../repository'
import { createEngine, type Engine } from './engine'
import {
  deletePendingDatabases,
  finishSignOut,
  type PendingDeletes,
  syncBeforeSignOut,
  unsentExport,
  unsentExportFileName,
} from './session'
import { FakeRemote } from './testing/fakeRemote'
import { closeAll, manualClock, openDb, parentSpec, sync, userId } from './testing/fixtures'

const otherUserId = 'b0000000-0000-4000-8000-000000000002'

let db: LocalDb
let remote: FakeRemote
let time: ReturnType<typeof manualClock>
let engine: Engine
let pending: PendingDeletes & { names: Set<string> }
let calls: string[]

const memoryPendingDeletes = () => {
  const names = new Set<string>()
  return {
    names,
    list: () => [...names],
    add: (name: string) => {
      calls.push(`mark ${name}`)
      names.add(name)
    },
    remove: (name: string) => {
      names.delete(name)
    },
  }
}

const deps = (signOutOk = true) => ({
  db,
  engine,
  pending,
  signOut: async () => {
    calls.push(`signOut exists=${await Dexie.exists(db.name)}`)
    return { ok: signOutOk }
  },
})

const write = (name: string) => writeRow(db, parentSpec, { ...sync(), name }, time.clock)

beforeEach(() => {
  db = openDb(dbNameFor(userId))
  remote = new FakeRemote(userId)
  time = manualClock()
  calls = []
  pending = memoryPendingDeletes()
  engine = createEngine({
    ctx: { db, remote, tables: [parentSpec], clock: time.clock, random: () => 0 },
    appVersion: '0.2.0',
    minAppVersion: async () => ({ ok: true, value: '0.0.0' }),
    refreshSession: async () => true,
    onStatus: () => {},
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  engine.stop()
  await engine.whenIdle()
  await closeAll()
})

describe('syncBeforeSignOut', () => {
  it('sends waiting changes and reports nothing left', async () => {
    const row = await write('sent before sign-out')

    expect(await syncBeforeSignOut(deps())).toEqual({ status: 'clear' })

    expect(remote.rows('parent').map((r) => r.id)).toEqual([row.id])
    expect(await db.outbox.count()).toBe(0)
  })

  it('reports changes it couldn’t send and deletes nothing (case 15)', async () => {
    remote.offline = true
    const row = await write('stuck offline')

    const check = await syncBeforeSignOut(deps())

    expect(check.status).toBe('unsent')
    expect(check.status === 'unsent' && check.entries.map((e) => e.rowId)).toEqual([row.id])
    expect(await Dexie.exists(db.name)).toBe(true)
    expect(await db.rows('parent').get(row.id)).toBeDefined()
    expect(pending.names.size).toBe(0)
  })

  it('counts a change the server refused as unsent', async () => {
    remote.reject = () => ({ code: '23514', message: 'violates check constraint' })
    await write('refused')

    const check = await syncBeforeSignOut(deps())

    expect(check.status === 'unsent' && check.entries[0]?.failure?.code).toBe('23514')
  })

  it('leaves sync running, so cancelling the warning keeps the changes going out', async () => {
    remote.offline = true
    const row = await write('sent after cancel')
    await syncBeforeSignOut(deps())

    remote.offline = false
    // Past the failed attempt's backoff.
    time.advance(60 * 60_000)
    engine.request('online')
    await engine.whenIdle()

    expect(remote.rows('parent').map((r) => r.id)).toEqual([row.id])
  })
})

describe('finishSignOut', () => {
  it('deletes the local database before signing out (case 14)', async () => {
    await write('deleted with the database')

    expect(await finishSignOut(deps())).toEqual({ ok: true })

    expect(await Dexie.exists(dbNameFor(userId))).toBe(false)
    expect(calls).toEqual([`mark ${dbNameFor(userId)}`, 'signOut exists=false'])
    expect(pending.names.size).toBe(0)
  })

  it('stops sync for good', async () => {
    await finishSignOut(deps())
    remote.offline = false

    engine.request('online')
    await engine.whenIdle()

    expect(remote.rows('parent')).toEqual([])
  })

  it('stays signed in and forgets the delete when it fails', async () => {
    const fail = vi.spyOn(Dexie, 'delete').mockRejectedValueOnce(new Error('UnknownError'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await finishSignOut(deps())).toEqual({ ok: false })

    expect(calls).toEqual([`mark ${dbNameFor(userId)}`])
    // A later start must not delete a database the user goes on writing to.
    expect(pending.names.size).toBe(0)
    fail.mockRestore()
  })

  it('reports a failed sign-out after the database is gone', async () => {
    expect(await finishSignOut(deps(false))).toEqual({ ok: false })
    expect(await Dexie.exists(dbNameFor(userId))).toBe(false)
  })

  it('leaves another user’s database alone (case 17)', async () => {
    const other = openDb(dbNameFor(otherUserId))
    const theirs = await writeRow(
      other,
      parentSpec,
      { ...sync({ user_id: otherUserId }), name: 'theirs' },
      time.clock,
    )
    await write('mine')

    await finishSignOut(deps())

    expect(await other.rows('parent').toArray()).toEqual([
      expect.objectContaining({ id: theirs.id }),
    ])
  })
})

describe('two users on one device (case 17)', () => {
  it('keep their rows in separate databases', async () => {
    const mine = await write('mine')
    const other = openDb(dbNameFor(otherUserId))

    expect(await other.rows('parent').get(mine.id)).toBeUndefined()
    expect(await other.outbox.count()).toBe(0)
  })
})

describe('deletePendingDatabases', () => {
  it('finishes a delete the app was closed during', async () => {
    await write('left behind')
    db.close()
    pending.names.add(db.name)

    await deletePendingDatabases(pending)

    expect(await Dexie.exists(db.name)).toBe(false)
    expect(pending.names.size).toBe(0)
  })

  it('drops a name it can’t delete and still deletes the rest', async () => {
    const other = openDb(dbNameFor(otherUserId))
    await other.open()
    other.close()
    db.close()
    pending.names.add(db.name)
    pending.names.add(other.name)
    const real = Dexie.delete.bind(Dexie)
    const fail = vi
      .spyOn(Dexie, 'delete')
      .mockImplementation((name) =>
        name === db.name ? Promise.reject(new Error('UnknownError')) : real(name),
      )
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await deletePendingDatabases(pending)

    fail.mockRestore()
    expect(await Dexie.exists(other.name)).toBe(false)
    expect(pending.names.size).toBe(0)
  })

  it('does nothing when no delete is waiting', async () => {
    await write('kept')

    await deletePendingDatabases(pending)

    expect(await Dexie.exists(db.name)).toBe(true)
  })
})

describe('unsentExport', () => {
  it('lists every unsent change with its table and row', async () => {
    remote.offline = true
    const first = await write('first')
    const second = await write('second')
    const check = await syncBeforeSignOut(deps())
    if (check.status !== 'unsent') throw new Error('expected unsent changes')

    const file = unsentExport(check.entries, new Date('2026-11-20T10:00:00.000Z'))

    expect(file).toEqual({
      format: 'calorithm-unsent-changes',
      version: 1,
      exported_at: '2026-11-20T10:00:00.000Z',
      changes: [
        { table: 'parent', row: expect.objectContaining({ id: first.id, name: 'first' }) },
        { table: 'parent', row: expect.objectContaining({ id: second.id, name: 'second' }) },
      ],
    })
  })

  it('names the file after the local day', () => {
    expect(unsentExportFileName('2026-11-20')).toBe('calorithm-unsent-changes-2026-11-20.json')
  })
})
