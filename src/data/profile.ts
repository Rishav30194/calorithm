import type { LocalDb } from './db'
import { writeRow } from './repository'
import type { SyncContext } from './sync/push'
import { type ProfileRow, profileSpec } from './tables'

export type Units = 'metric' | 'imperial'

export type SetUnitsResult = { ok: true } | { ok: false; reason: 'offline' | 'signed_out' }

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

// The profile to edit. Sync writes whole rows, so editing defaults on a device that hasn't
// pulled the profile yet would overwrite every field on the server; the server's copy is
// fetched first, and the edit is refused when it can't be.
const baseProfile = async (
  ctx: SyncContext,
  userId: string,
): Promise<{ ok: true; row: ProfileRow } | { ok: false; reason: 'offline' | 'signed_out' }> => {
  const local = await readProfile(ctx.db, userId)
  if (local) return { ok: true, row: local }
  const fetched = await ctx.remote.getRows(profileSpec.name, [userId])
  if (!fetched.ok) {
    return { ok: false, reason: fetched.error.kind === 'auth' ? 'signed_out' : 'offline' }
  }
  const server = profileSpec.parse(fetched.value[0] ?? null)
  if (server) await ctx.db.rows(profileSpec.name).put(server)
  return { ok: true, row: server ?? newProfile(userId) }
}

export const setUnits = async (
  ctx: SyncContext,
  userId: string,
  units: Units,
): Promise<SetUnitsResult> => {
  const base = await baseProfile(ctx, userId)
  if (!base.ok) return base
  await writeRow(ctx.db, profileSpec, { ...base.row, units }, ctx.clock)
  return { ok: true }
}
