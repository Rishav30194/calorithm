import type { LocalDb } from './db'
import { type Clock, writeRow } from './repository'
import { type ProfileRow, profileSpec } from './tables'

export type Units = 'metric' | 'imperial'

// The column defaults from the profile migration. The profile's id is the user's id, so
// two devices creating it offline write the same row.
const newProfile = (userId: string): ProfileRow => ({
  id: userId,
  user_id: userId,
  height_cm: null,
  birth_date: null,
  sex: null,
  activity_level: null,
  units: 'metric',
  goal_rate_kg_per_week: 0,
  protein_g_per_kg: 1.8,
  calorie_floor_kcal: 1200,
  updated_at: '',
  client_updated_at: '',
  deleted_at: null,
  schema_version: profileSpec.schemaVersion,
})

export const readProfile = async (db: LocalDb, userId: string): Promise<ProfileRow | null> =>
  profileSpec.parse(await db.rows('profile').get(userId))

export const setUnits = async (
  db: LocalDb,
  userId: string,
  units: Units,
  clock: Clock,
): Promise<void> => {
  const current = (await readProfile(db, userId)) ?? newProfile(userId)
  await writeRow(db, profileSpec, { ...current, units }, clock)
}
