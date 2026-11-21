import { EARLIEST_DAY, isDay } from '@/domain/dates'
import { roundTo } from '@/domain/nutrition'
import type { WeighIn } from '@/domain/trend'
import { isWeightKgInRange } from '@/domain/weight'

import { weightId } from './dayId'
import type { LocalDb } from './db'
import { type Clock, softDelete, visibleRows, writeRow } from './repository'
import { type WeightRow, weightsSpec } from './tables'

export type SetWeighInResult =
  | { ok: true; row: WeightRow }
  | { ok: false; reason: 'out_of_range' | 'invalid_date' }

// One weigh-in per day: the id comes from the user and date, so weighing in again that day,
// on any device, replaces the first (decision 0020).
export const setWeighIn = async (
  db: LocalDb,
  clock: Clock,
  userId: string,
  { date, kg }: WeighIn,
): Promise<SetWeighInResult> => {
  if (!isDay(date) || date < EARLIEST_DAY) return { ok: false, reason: 'invalid_date' }
  const weightKg = roundTo(kg, 2)
  if (!isWeightKgInRange(weightKg)) return { ok: false, reason: 'out_of_range' }

  const id = await weightId(userId, date)
  const existing = weightsSpec.parse(await db.rows(weightsSpec.name).get(id))
  const row = await writeRow(
    db,
    weightsSpec,
    {
      id,
      user_id: userId,
      updated_at: '',
      client_updated_at: '',
      schema_version: weightsSpec.schemaVersion,
      ...existing,
      // Weighing in on a day whose weigh-in was deleted brings the row back.
      deleted_at: null,
      date,
      weight_kg: weightKg,
    },
    clock,
  )
  return { ok: true, row }
}

export const removeWeighIn = async (
  db: LocalDb,
  clock: Clock,
  userId: string,
  date: string,
): Promise<void> => {
  const id = await weightId(userId, date)
  const existing = weightsSpec.parse(await db.rows(weightsSpec.name).get(id))
  if (existing === null || existing.deleted_at !== null) return
  await softDelete(db, weightsSpec, id, clock)
}

// Oldest first, as the trend reads them.
export const weighIns = async (db: LocalDb): Promise<WeighIn[]> =>
  (await visibleRows(db, weightsSpec))
    .map((row) => ({ date: row.date, kg: row.weight_kg }))
    .sort((a, b) => a.date.localeCompare(b.date))
