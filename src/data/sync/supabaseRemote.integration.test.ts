import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'

import type { Database } from '../database.types'
import type { ProfileRow } from '../tables'
import type { Remote } from './remote'
import { createSupabaseRemote } from './supabaseRemote'
import { normalizeTimestamp } from './timestamps'

// Runs against local Supabase through `npm run test:integration`, as the synthetic seed user.
const url = process.env.VITE_SUPABASE_URL ?? ''
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
const seed = { email: 'seed.user@calorithm.test', password: 'Local-Seed-Pass-2026' }

const newClient = (target = url, headers: Record<string, string> = {}) =>
  createClient<Database>(target, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers },
  })

let client: SupabaseClient<Database>
let remote: Remote
let userId = ''
// Device times for this run, always later than anything stored by earlier runs.
let tick = 0
const nextTime = () => {
  tick += 1_000
  return new Date(tick).toISOString()
}

const profile = (overrides: Partial<ProfileRow> = {}): ProfileRow => ({
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
  updated_at: new Date().toISOString(),
  client_updated_at: nextTime(),
  deleted_at: null,
  schema_version: 1,
  ...overrides,
})

const storedProfile = async () => {
  const result = await remote.getRows('profile', [userId])
  if (!result.ok) throw new Error(result.error.message)
  return result.value[0]
}

beforeAll(async () => {
  expect(url, 'run through npm run test:integration').not.toBe('')
  client = newClient()
  const { data, error } = await client.auth.signInWithPassword(seed)
  if (error || !data.user) throw new Error(`seed sign-in failed: ${error?.message}`)
  userId = data.user.id
  remote = createSupabaseRemote(client)

  const before = await storedProfile()
  const last =
    typeof before?.client_updated_at === 'string' ? Date.parse(before.client_updated_at) : 0
  tick = Math.max(Date.now(), last)
})

describe('createSupabaseRemote', () => {
  it('returns the stored row from an upsert, with the server’s updated_at', async () => {
    const sent = profile({ units: 'imperial' })

    const result = await remote.upsert('profile', [sent])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toHaveLength(1)
    expect(result.value[0]).toMatchObject({ id: userId, units: 'imperial' })
    const updatedAt = String(result.value[0]?.updated_at)
    expect(updatedAt).not.toBe(sent.updated_at)
    expect(normalizeTimestamp(updatedAt)).not.toBeNull()
  })

  it('leaves an update the server skipped as older out of the result', async () => {
    await remote.upsert('profile', [profile({ units: 'metric' })])
    const stored = await storedProfile()

    const older = profile({ units: 'imperial', client_updated_at: '2000-01-01T00:00:00.000Z' })
    const result = await remote.upsert('profile', [older])

    expect(result).toEqual({ ok: true, value: [] })
    expect(await storedProfile()).toEqual(stored)
  })

  it('returns rows by id, and nothing for ids the server doesn’t have', async () => {
    await remote.upsert('profile', [profile()])

    const result = await remote.getRows('profile', [userId, crypto.randomUUID()])

    expect(result.ok && result.value.map((row) => row.id)).toEqual([userId])
  })

  it('pages by (updated_at, id) with real microsecond timestamps', async () => {
    await remote.upsert('profile', [profile()])
    const stored = await storedProfile()
    const updatedAt = String(stored?.updated_at)

    const since = await remote.pullPage('profile', { kind: 'since', updatedAt }, 10)
    const afterItself = await remote.pullPage(
      'profile',
      { kind: 'after', cursor: { updatedAt, id: userId } },
      10,
    )
    const afterSmallerId = await remote.pullPage(
      'profile',
      { kind: 'after', cursor: { updatedAt, id: '00000000-0000-4000-8000-000000000000' } },
      10,
    )
    const all = await remote.pullPage('profile', { kind: 'all' }, 10)

    expect(since.ok && since.value.map((row) => row.id)).toEqual([userId])
    expect(afterItself).toEqual({ ok: true, value: [] })
    expect(afterSmallerId.ok && afterSmallerId.value.map((row) => row.id)).toEqual([userId])
    // Row-level security: only the signed-in user's rows.
    expect(all.ok && all.value.map((row) => row.user_id)).toEqual([userId])
  })

  it('classes a constraint violation as rejected, with the Postgres code', async () => {
    const result = await remote.upsert('profile', [profile({ height_cm: 50 })])

    expect(result).toMatchObject({ ok: false, error: { kind: 'rejected', code: '23514' } })
  })

  it('classes a write to another user’s row as rejected', async () => {
    const other = crypto.randomUUID()
    const result = await remote.upsert('profile', [profile({ id: other, user_id: other })])

    expect(result).toMatchObject({ ok: false, error: { kind: 'rejected' } })
  })

  it('classes an invalid session token as an auth error', async () => {
    const result = await createSupabaseRemote(
      newClient(url, { Authorization: 'Bearer not-a-token' }),
    ).pullPage('profile', { kind: 'all' }, 1)

    expect(result).toMatchObject({ ok: false, error: { kind: 'auth' } })
  })

  it('classes an unreachable server as a network error', async () => {
    const result = await createSupabaseRemote(newClient('http://127.0.0.1:9')).pullPage(
      'profile',
      { kind: 'all' },
      1,
    )

    expect(result).toMatchObject({ ok: false, error: { kind: 'network' } })
  })

  it('refuses a malformed cursor without sending a request', async () => {
    const malformed = await remote.pullPage(
      'profile',
      { kind: 'after', cursor: { updatedAt: '2026-11-20T10:00:00Z', id: 'x,user_id.neq.y' } },
      1,
    )
    const badSince = await remote.pullPage('profile', { kind: 'since', updatedAt: 'id.neq.x' }, 1)

    expect(malformed).toMatchObject({
      ok: false,
      error: { kind: 'rejected', code: 'invalid_cursor' },
    })
    expect(badSince).toMatchObject({
      ok: false,
      error: { kind: 'rejected', code: 'invalid_cursor' },
    })
  })

  it('refuses a table that isn’t synced', async () => {
    const result = await remote.getRows('app_config', ['x'])

    expect(result).toMatchObject({ ok: false, error: { kind: 'rejected', code: 'unknown_table' } })
  })
})
