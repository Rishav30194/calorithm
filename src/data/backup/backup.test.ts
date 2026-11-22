import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { checkinId, dayId, weightId } from '../dayId'
import type { LocalDb } from '../db'
import { createFood, updateFood } from '../foods'
import { logFood } from '../log'
import { softDelete } from '../repository'
import { closeAll, manualClock, openDb, userId } from '../sync/testing/fixtures'
import { foodsSpec, type SyncRow, syncedTables, type WeightRow, weightsSpec } from '../tables'
import { setWeighIn } from '../weights'
import { buildExport, exportFileName, importData, importedId } from './backup'
import { EXPORT_FORMAT, EXPORT_VERSION, type ExportFile } from './format'
import { seedSample } from './testing'

const otherUser = 'b0000000-0000-4000-8000-000000000002'
const context = { now: new Date('2026-11-21T12:00:00.000Z'), today: '2026-11-21' }
const exportedAt = new Date('2026-11-21T09:00:00.000Z')

let time: ReturnType<typeof manualClock>
let names = 0

beforeEach(() => {
  time = manualClock()
})

afterEach(closeAll)

const freshDb = (): LocalDb => openDb(`calorithm-test-backup-${names++}`)

const allRows = async (db: LocalDb): Promise<Record<string, SyncRow[]>> =>
  Object.fromEntries(
    await Promise.all(
      syncedTables.map(async (spec) => [spec.name, await db.rows(spec.name).toArray()] as const),
    ),
  )

const exportText = async (db: LocalDb, owner: string): Promise<string> =>
  JSON.stringify(await buildExport(db, owner, exportedAt, '0.1.0'))

// Puts an older edit of the weigh-in on the device, as if this device's copy predates the file.
const rewindWeight = async (db: LocalDb, id: string): Promise<void> => {
  const row = weightsSpec.parse(await db.rows('weights').get(id))
  if (!row) throw new Error('no weigh-in to rewind')
  const older: WeightRow = { ...row, weight_kg: 90, client_updated_at: '2026-11-19T10:00:00.000Z' }
  await db.rows('weights').put(older)
}

const sampleDb = async (owner = userId): Promise<LocalDb> => {
  const db = freshDb()
  await seedSample(db, time.clock, owner)
  return db
}

describe('buildExport', () => {
  it('holds every live row of every table under a versioned header', async () => {
    const db = await sampleDb()
    const file = await buildExport(db, userId, exportedAt, '0.1.0')

    expect(file).toMatchObject({
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exported_at: '2026-11-21T09:00:00.000Z',
      app_version: '0.1.0',
      user_id: userId,
    })
    expect(Object.keys(file.tables).sort()).toEqual(syncedTables.map((spec) => spec.name).sort())
    expect(file.tables.profile).toHaveLength(1)
    expect(file.tables.foods).toHaveLength(3)
    expect(file.tables.recipes).toHaveLength(1)
    expect(file.tables.recipe_items).toHaveLength(2)
    expect(file.tables.days).toHaveLength(1)
    expect(file.tables.weights).toHaveLength(2)
    expect(file.tables.checkins).toHaveLength(1)
  })

  it('leaves out deleted rows and keeps archived ones', async () => {
    const db = await sampleDb()
    const file = await buildExport(db, userId, exportedAt, '0.1.0')

    expect(file.tables.log_entries.map((row) => row.meal).sort()).toEqual(['breakfast', 'lunch'])
    expect(file.tables.foods.filter((row) => row.archived_at !== null)).toHaveLength(1)
  })
})

describe('buildExport with deleted parents', () => {
  it('keeps a deleted food that a live row uses, and the import still works', async () => {
    const db = freshDb()
    const used = await createFood(db, time.clock, userId, {
      name: 'Oats',
      servingSize: 40,
      servingUnit: 'g',
      kcal: 150,
      proteinG: 5,
      carbsG: 20,
      fatG: 3,
    })
    const unused = await createFood(db, time.clock, userId, {
      name: 'Rice',
      servingSize: 75,
      servingUnit: 'g',
      kcal: 270,
      proteinG: 5.3,
      carbsG: 20,
      fatG: 3,
    })
    await logFood(db, time.clock, userId, {
      date: '2026-11-20',
      meal: 'breakfast',
      food: used,
      servings: 1,
    })
    await softDelete(db, foodsSpec, used.id, time.clock)
    await softDelete(db, foodsSpec, unused.id, time.clock)

    const file = await buildExport(db, userId, exportedAt, '0.1.0')

    expect(file.tables.foods.map((row) => row.id)).toEqual([used.id])
    expect(file.tables.foods[0]?.deleted_at).not.toBeNull()
    const target = freshDb()
    const result = await importData(target, JSON.stringify(file), otherUser, context)
    expect(result).toEqual({ ok: true, written: 2, skipped: 0 })
    const moved = await target.rows('foods').get(await importedId(otherUser, used.id))
    expect(moved?.deleted_at).toBe(file.tables.foods[0]?.deleted_at)
  })
})

describe('exportFileName', () => {
  it('names the file after the local day', () => {
    expect(exportFileName('2026-11-21')).toBe('calorithm-export-2026-11-21.json')
  })
})

describe('importData', () => {
  it('restores every row exactly into an empty database of the same account', async () => {
    const source = await sampleDb()
    const text = await exportText(source, userId)
    const live = await allRows(source)

    const target = freshDb()
    const result = await importData(target, text, userId, context)

    const restored = await allRows(target)
    for (const spec of syncedTables) {
      const expected = (live[spec.name] ?? []).filter((row) => row.deleted_at === null)
      expect(restored[spec.name], spec.name).toEqual(expected)
    }
    const total = Object.values(restored).flat().length
    expect(result).toEqual({ ok: true, written: total, skipped: 0 })
    expect(await target.outbox.count()).toBe(total)
  })

  it('moves every row into another account with new ids and the same contents', async () => {
    const source = await sampleDb()
    const file: ExportFile = JSON.parse(await exportText(source, userId))

    const target = freshDb()
    await importData(target, JSON.stringify(file), otherUser, context)

    const imported = await buildExport(target, otherUser, exportedAt, '0.1.0')
    const id = (old: string) => importedId(otherUser, old)
    const moved = async <Row extends SyncRow>(rows: Row[], ids: (row: Row) => Promise<object>) =>
      Promise.all(rows.map(async (row) => ({ ...row, user_id: otherUser, ...(await ids(row)) })))
    const byId = (rows: SyncRow[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id))
    const t = file.tables

    expect(imported.tables.profile).toEqual(await moved(t.profile, async () => ({ id: otherUser })))
    expect(byId(imported.tables.foods)).toEqual(
      byId(await moved(t.foods, async (row) => ({ id: await id(row.id) }))),
    )
    expect(byId(imported.tables.recipes)).toEqual(
      byId(await moved(t.recipes, async (row) => ({ id: await id(row.id) }))),
    )
    expect(byId(imported.tables.recipe_items)).toEqual(
      byId(
        await moved(t.recipe_items, async (row) => ({
          id: await id(row.id),
          recipe_id: await id(row.recipe_id),
          food_id: await id(row.food_id),
        })),
      ),
    )
    expect(byId(imported.tables.log_entries)).toEqual(
      byId(
        await moved(t.log_entries, async (row) => ({
          id: await id(row.id),
          food_id: row.food_id === null ? null : await id(row.food_id),
          recipe_id: row.recipe_id === null ? null : await id(row.recipe_id),
        })),
      ),
    )
    expect(byId(imported.tables.days)).toEqual(
      byId(await moved(t.days, async (row) => ({ id: await dayId(otherUser, row.date) }))),
    )
    expect(byId(imported.tables.weights)).toEqual(
      byId(await moved(t.weights, async (row) => ({ id: await weightId(otherUser, row.date) }))),
    )
    expect(byId(imported.tables.checkins)).toEqual(
      byId(await moved(t.checkins, async (row) => ({ id: await checkinId(otherUser, row.date) }))),
    )
  })

  it('gives each account its own ids, which differ from the source rows', async () => {
    const id = 'f0000000-0000-4000-8000-000000000001'
    expect(await importedId(otherUser, id)).not.toBe(id)
    expect(await importedId(otherUser, id)).not.toBe(await importedId(userId, id))
    expect(await importedId(otherUser, id)).toBe(await importedId(otherUser, id))
  })

  it('writes nothing new when the same file is imported twice', async () => {
    const text = await exportText(await sampleDb(), userId)
    const target = freshDb()
    const first = await importData(target, text, otherUser, context)
    const before = await allRows(target)

    const second = await importData(target, text, otherUser, context)

    expect(first.ok && first.written).toBeGreaterThan(0)
    expect(second).toEqual({ ok: true, written: 0, skipped: first.ok ? first.written : -1 })
    expect(await allRows(target)).toEqual(before)
  })

  it('keeps a local row edited after the export and replaces an older one', async () => {
    const db = freshDb()
    const oats = await createFood(db, time.clock, userId, {
      name: 'Oats',
      servingSize: 40,
      servingUnit: 'g',
      kcal: 150,
      proteinG: 5,
      carbsG: 20,
      fatG: 3,
    })
    await setWeighIn(db, time.clock, userId, { date: '2026-11-20', kg: 82.4 })
    time.advance(60_000)
    const text = await exportText(db, userId)
    // After the export: one row changes again, the other goes back to an older edit.
    time.advance(60_000)
    await updateFood(db, time.clock, oats.id, {
      name: 'Rolled oats',
      servingSize: 40,
      servingUnit: 'g',
      kcal: 150,
      proteinG: 5,
      carbsG: 20,
      fatG: 3,
    })
    const weight = await weightId(userId, '2026-11-20')
    await rewindWeight(db, weight)

    const result = await importData(db, text, userId, context)

    expect(result).toEqual({ ok: true, written: 1, skipped: 1 })
    expect(await db.rows('foods').get(oats.id)).toMatchObject({ name: 'Rolled oats' })
    expect(await db.rows('weights').get(weight)).toMatchObject({ weight_kg: 82.4 })
  })

  it('compares edit times to the microsecond, as the server does', async () => {
    const db = freshDb()
    await setWeighIn(db, time.clock, userId, { date: '2026-11-20', kg: 82.4 })
    const file: ExportFile = JSON.parse(await exportText(db, userId))
    const [weight] = file.tables.weights
    if (!weight) throw new Error('no weigh-in exported')
    const id = weight.id
    const local = weightsSpec.parse(await db.rows('weights').get(id))
    if (!local) throw new Error('no local weigh-in')
    const older: WeightRow = {
      ...local,
      weight_kg: 90,
      client_updated_at: '2026-11-20 10:00:12.123100+00',
    }
    await db.rows('weights').put(older)
    Object.assign(weight, { client_updated_at: '2026-11-20 10:00:12.123900+00' })

    const result = await importData(db, JSON.stringify(file), userId, context)

    expect(result).toEqual({ ok: true, written: 1, skipped: 0 })
    expect(await db.rows('weights').get(id)).toMatchObject({ weight_kg: 82.4 })
  })

  it('replaces a queued older change and bumps its revision', async () => {
    const db = freshDb()
    await setWeighIn(db, time.clock, userId, { date: '2026-11-20', kg: 82.4 })
    time.advance(60_000)
    await setWeighIn(db, time.clock, userId, { date: '2026-11-20', kg: 82.0 })
    const text = await exportText(db, userId)
    const weight = await weightId(userId, '2026-11-20')
    await rewindWeight(db, weight)
    const queued = await db.outbox.where('[table+rowId]').equals(['weights', weight]).first()

    await importData(db, text, userId, context)

    const entry = await db.outbox.where('[table+rowId]').equals(['weights', weight]).first()
    expect(entry).toMatchObject({ rev: (queued?.rev ?? 0) + 1, row: { weight_kg: 82 } })
    expect(await db.outbox.count()).toBe(1)
  })

  it('keeps the edit time from the file, so the server keeps any newer edit', async () => {
    const source = await sampleDb()
    const text = await exportText(source, userId)
    const file: ExportFile = JSON.parse(text)
    time.advance(86_400_000)

    const target = freshDb()
    await importData(target, text, otherUser, context)

    const food = file.tables.foods[0]
    if (!food) throw new Error('the sample has no food')
    const entry = await target.outbox
      .where('[table+rowId]')
      .equals(['foods', await importedId(otherUser, food.id)])
      .first()
    expect(entry?.row.client_updated_at).toBe(food.client_updated_at)
  })

  it.each([
    ['not JSON', 'not json', 'not_json'],
    ['another format', '{"format":"other","version":1}', 'not_export'],
    ['a newer version', '{"format":"calorithm-export","version":2}', 'newer_version'],
  ])('writes nothing for a file that is %s', async (_case, text, reason) => {
    const db = freshDb()
    expect(await importData(db, text, userId, context)).toEqual({ ok: false, reason })
    expect(Object.values(await allRows(db)).flat()).toEqual([])
    expect(await db.outbox.count()).toBe(0)
  })

  it('writes nothing when one row in an otherwise good file is invalid', async () => {
    const file: ExportFile = JSON.parse(await exportText(await sampleDb(), userId))
    const last = file.tables.checkins[0]
    if (!last) throw new Error('the sample has no check-in')
    Object.assign(last, { kcal_target: 1 })

    const db = freshDb()
    expect(await importData(db, JSON.stringify(file), userId, context)).toEqual({
      ok: false,
      reason: 'invalid',
    })
    expect(Object.values(await allRows(db)).flat()).toEqual([])
    expect(await db.outbox.count()).toBe(0)
  })

  it('restores any set of foods, log entries, and weigh-ins exactly', async () => {
    const food = fc.record({
      name: fc.string({ minLength: 1, maxLength: 30 }).filter((name) => name.trim().length > 0),
      servingSize: fc.integer({ min: 1, max: 1000 }),
      kcal: fc.integer({ min: 0, max: 2000 }),
      proteinG: fc.integer({ min: 0, max: 1000 }).map((tenths) => tenths / 10),
    })
    const day = fc.integer({ min: 1, max: 28 }).map((d) => `2026-10-${String(d).padStart(2, '0')}`)
    await fc.assert(
      fc.asyncProperty(
        fc.array(food, { minLength: 1, maxLength: 5 }),
        fc.array(fc.tuple(fc.nat(), day, fc.integer({ min: 1, max: 40 })), { maxLength: 8 }),
        fc.array(fc.tuple(day, fc.integer({ min: 4000, max: 15000 })), { maxLength: 8 }),
        async (foods, entries, weighIns) => {
          const source = freshDb()
          const created = []
          for (const input of foods) {
            created.push(
              await createFood(source, time.clock, userId, {
                ...input,
                servingUnit: 'g',
                carbsG: 20,
                fatG: 3,
              }),
            )
          }
          for (const [index, date, quarters] of entries) {
            const chosen = created[index % created.length]
            if (!chosen) continue
            await logFood(source, time.clock, userId, {
              date,
              meal: 'snacks',
              food: chosen,
              servings: quarters / 4,
            })
          }
          for (const [date, hundredths] of weighIns) {
            await setWeighIn(source, time.clock, userId, { date, kg: hundredths / 100 })
          }

          const target = freshDb()
          const result = await importData(target, await exportText(source, userId), userId, context)

          expect(result.ok).toBe(true)
          expect(await allRows(target)).toEqual(await allRows(source))
          await closeAll()
        },
      ),
      { numRuns: 25 },
    )
  })
})
