import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BACKOFF_MIN_MS } from '@/domain/backoff'

import type { LocalDb } from '../db'
import { writeRow } from '../repository'
import { foodsSpec, recipeItemsSpec, recipesSpec, syncedTables } from '../tables'
import { discardFailed } from './discard'
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

  // Sync case 4, with the real tables: a recipe item written before its recipe and food
  // still goes after them.
  it('pushes recipes and foods before the recipe items that use them', async () => {
    const real = { ...ctx, tables: syncedTables }
    const recipeId = crypto.randomUUID()
    const foodId = crypto.randomUUID()
    await writeRow(
      db,
      recipeItemsSpec,
      { ...sync(), recipe_id: recipeId, food_id: foodId, servings: 1 },
      time.clock,
    )
    await writeRow(
      db,
      foodsSpec,
      {
        ...sync({ id: foodId }),
        name: 'Oats',
        serving_size: 40,
        serving_unit: 'g',
        kcal: 150,
        protein_g: 5,
        carbs_g: null,
        fat_g: null,
        archived_at: null,
      },
      time.clock,
    )
    await writeRow(
      db,
      recipesSpec,
      { ...sync({ id: recipeId }), name: 'Porridge', servings: 2, archived_at: null },
      time.clock,
    )

    await push(real)

    expect(remote.upserts.map((call) => call.table)).toEqual(['foods', 'recipes', 'recipe_items'])
  })

  // Sync case 19.
  describe('a child whose parent’s change failed', () => {
    // The server refuses a parent named 'bad', and, like Postgres, a child whose parent it
    // doesn't have.
    const refuseBad = () => {
      remote.reject = (table, row) => {
        if (row.name === 'bad') return { code: '23514', message: 'violates check constraint' }
        const parentStored = remote.rows('parent').some((parent) => parent.id === row.parent_id)
        if (table === 'child' && !parentStored) {
          return { code: '23503', message: 'violates foreign key constraint' }
        }
        return null
      }
    }

    it('waits instead of failing on the missing parent', async () => {
      refuseBad()
      const parent = await writeRow(db, parentSpec, { ...sync(), name: 'bad' }, time.clock)
      const child = await writeRow(
        db,
        childSpec,
        { ...sync(), parent_id: parent.id, note: 'held' },
        time.clock,
      )

      expect(await push(ctx)).toEqual({ status: 'done', sent: 0, failed: 1 })

      expect(remote.rows('child')).toEqual([])
      const held = await db.outbox.where('[table+rowId]').equals(['child', child.id]).first()
      expect(held?.failure).toBeNull()
    })

    it('goes out once the parent is fixed', async () => {
      refuseBad()
      const parent = await writeRow(db, parentSpec, { ...sync(), name: 'bad' }, time.clock)
      await writeRow(db, childSpec, { ...sync(), parent_id: parent.id, note: 'held' }, time.clock)
      await push(ctx)

      await writeRow(db, parentSpec, { ...parent, name: 'good' }, time.clock)
      expect(await push(ctx)).toEqual({ status: 'done', sent: 2, failed: 0 })
      expect(await db.outbox.count()).toBe(0)
    })

    it('goes out once the parent’s change is discarded, and fails then if the parent is missing', async () => {
      refuseBad()
      const parent = await writeRow(db, parentSpec, { ...sync(), name: 'bad' }, time.clock)
      await writeRow(db, childSpec, { ...sync(), parent_id: parent.id, note: 'held' }, time.clock)
      await push(ctx)
      const failedParent = (await db.outbox.toArray()).find((entry) => entry.table === 'parent')
      remote.reject = (table) =>
        table === 'child' ? { code: '23503', message: 'violates foreign key constraint' } : null

      await discardFailed(ctx, failedParent?.seq ?? -1)
      expect(await push(ctx)).toEqual({ status: 'done', sent: 0, failed: 1 })

      const [child] = await db.outbox.toArray()
      expect(child?.failure?.code).toBe('23503')
    })

    it('sends a child whose parent is on the server, even while an edit to it is refused', async () => {
      refuseBad()
      const parent = await writeRow(db, parentSpec, { ...sync(), name: 'ok' }, time.clock)
      await push(ctx)
      time.advance(60_000)
      await writeRow(db, parentSpec, { ...parent, name: 'bad' }, time.clock)
      const child = await writeRow(
        db,
        childSpec,
        { ...sync(), parent_id: parent.id, note: 'sent' },
        time.clock,
      )

      expect(await push(ctx)).toEqual({ status: 'done', sent: 1, failed: 1 })
      expect(remote.rows('child').map((row) => row.id)).toEqual([child.id])
    })

    it('doesn’t hold a child whose parent is fine', async () => {
      const parent = await writeRow(db, parentSpec, { ...sync(), name: 'ok' }, time.clock)
      await writeRow(db, childSpec, { ...sync(), parent_id: parent.id, note: 'sent' }, time.clock)

      expect(await push(ctx)).toEqual({ status: 'done', sent: 2, failed: 0 })
    })
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
    expect(await db.outbox.toArray()).toEqual([
      expect.objectContaining({ attempts: 0, nextAttemptAt: 0 }),
    ])

    // After the app refreshes the session, the retry goes out at once, with no backoff.
    expect((await push(ctx)).status).toBe('done')
    expect(await db.outbox.count()).toBe(0)
  })

  it('ignores a backoff time left far ahead by a clock that jumped back', async () => {
    await writeRow(db, parentSpec, { ...sync(), name: 'oats' }, time.clock)
    const [entry] = await db.outbox.toArray()
    await db.outbox.update(entry?.seq ?? 0, {
      attempts: 4,
      nextAttemptAt: time.clock().getTime() + 86_400_000,
    })

    expect((await push(ctx)).status).toBe('done')
  })

  it('stores the server’s copy when the server keeps a newer edit', async () => {
    const id = crypto.randomUUID()
    // Another device's edit, made later than this device's, is already on the server.
    await remote.upsert('parent', [
      { ...sync({ id, client_updated_at: '2026-11-20T12:00:00.000Z' }), name: 'newer elsewhere' },
    ])
    await writeRow(db, parentSpec, { ...sync({ id }), name: 'older here' }, time.clock)

    expect(await push(ctx)).toMatchObject({ status: 'done' })

    expect(await db.outbox.count()).toBe(0)
    expect(parentSpec.parse(await db.rows('parent').get(id))?.name).toBe('newer elsewhere')
  })

  it('stores the server’s updated_at on rows it accepted', async () => {
    const row = await writeRow(db, parentSpec, { ...sync(), name: 'oats' }, time.clock)

    await push(ctx)

    const local = await db.rows('parent').get(row.id)
    expect(local?.updated_at).toBe(remote.rows('parent')[0]?.updated_at)
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

  it('sends a food queued before carbs and fat without them, so the server keeps its values', async () => {
    ctx = { ...ctx, tables: syncedTables }
    const id = crypto.randomUUID()
    const food = {
      ...sync({ id }),
      name: 'Synthetic oats',
      serving_size: 40,
      serving_unit: 'g',
      kcal: 150,
      protein_g: 5,
      archived_at: null,
    }
    await remote.upsert('foods', [
      {
        ...food,
        carbs_g: 27,
        fat_g: 2.5,
        schema_version: 2,
        client_updated_at: '2026-11-19T09:00:00.000Z',
      },
    ])
    await db.outbox.add({
      table: 'foods',
      rowId: id,
      row: { ...food, name: 'Renamed offline', client_updated_at: '2026-11-19T10:00:00.000Z' },
      schemaVersion: 1,
      rev: 1,
      attempts: 0,
      nextAttemptAt: 0,
      failure: null,
    })

    expect((await push(ctx)).status).toBe('done')

    expect(remote.rows('foods')).toEqual([
      expect.objectContaining({ id, name: 'Renamed offline', carbs_g: 27, fat_g: 2.5 }),
    ])
  })

  describe('carbs and fat not set on this device (decision 0025)', () => {
    const food = (id: string, name: string) => ({
      ...sync({ id }),
      name,
      serving_size: 40,
      serving_unit: 'g',
      kcal: 150,
      protein_g: 5,
      archived_at: null,
    })
    const storeOnServer = (id: string, carbs: number, fat: number) =>
      remote.upsert('foods', [
        {
          ...food(id, 'Synthetic oats'),
          carbs_g: carbs,
          fat_g: fat,
          schema_version: 2,
          client_updated_at: '2026-11-19T09:00:00.000Z',
        },
      ])
    const queue = (id: string, row: Record<string, unknown>, schemaVersion: number) =>
      db.outbox.add({
        table: 'foods',
        rowId: id,
        row: { ...row, client_updated_at: '2026-11-19T10:00:00.000Z' },
        schemaVersion,
        rev: 1,
        attempts: 0,
        nextAttemptAt: 0,
        failure: null,
      })

    beforeEach(() => {
      ctx = { ...ctx, tables: syncedTables }
    })

    it('keeps the server’s values when a version 2 edit has them not set', async () => {
      const id = crypto.randomUUID()
      await storeOnServer(id, 27, 2.5)
      await queue(id, { ...food(id, 'Edited here'), carbs_g: null, fat_g: null }, 2)

      expect((await push(ctx)).status).toBe('done')

      expect(remote.rows('foods')).toEqual([
        expect.objectContaining({ id, name: 'Edited here', carbs_g: 27, fat_g: 2.5 }),
      ])
    })

    it('keeps them when the same batch also sends a food that has carbs and fat', async () => {
      const oldId = crypto.randomUUID()
      const newId = crypto.randomUUID()
      await storeOnServer(oldId, 27, 2.5)
      await queue(oldId, food(oldId, 'Renamed offline'), 1)
      await queue(newId, { ...food(newId, 'Paneer'), carbs_g: 1.2, fat_g: 20.8 }, 2)

      expect((await push(ctx)).status).toBe('done')

      const stored = new Map(remote.rows('foods').map((row) => [row.id, row]))
      expect(stored.get(oldId)).toMatchObject({ carbs_g: 27, fat_g: 2.5 })
      expect(stored.get(newId)).toMatchObject({ carbs_g: 1.2, fat_g: 20.8 })
    })
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
