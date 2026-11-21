import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '../database.types'
import { syncedTables } from '../tables'
import type { PullFrom, Remote, RemoteError, RemoteResult } from './remote'
import { isCursor, isUuid, overlapStart } from './timestamps'

type Rows = Record<string, unknown>[]
type Response = { data: unknown; error: { code: string; message: string } | null; status: number }

// Decision 0014. postgrest-js reports a failed fetch as status 0 with an empty code.
export const errorFor = (status: number, error: { code: string; message: string }): RemoteError => {
  const code = error.code || String(status)
  if (status === 0 || status === 408 || status === 429 || status >= 500) {
    return { kind: 'network', code, message: error.message }
  }
  if (status === 401) return { kind: 'auth', code, message: error.message }
  return { kind: 'rejected', code, message: error.message }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const send = async (query: PromiseLike<Response>): Promise<RemoteResult<Rows>> => {
  const { data, error, status } = await query
  if (error) return { ok: false, error: errorFor(status, error) }
  return { ok: true, value: Array.isArray(data) ? data.filter(isRecord) : [] }
}

const refuse = async (code: string, message: string): Promise<RemoteResult<Rows>> => ({
  ok: false,
  error: { kind: 'rejected', code, message },
})

const isTime = (value: string): boolean => overlapStart(value) !== null

export const createSupabaseRemote = (
  client: SupabaseClient<Database>,
  tables: readonly string[] = syncedTables.map((spec) => spec.name),
): Remote => {
  // The engine names tables at runtime, which the typed client can't express, so it uses the
  // client's untyped view. Every row going out or coming in is still checked by the table's
  // Zod schema, in push and pull.
  // postgrest-js retries reads itself (up to 3 times over about 7 seconds); .retry(false)
  // leaves retrying to the engine's backoff, so a failed sync reports at once.
  const db: SupabaseClient = client
  const known = new Set(tables)
  const unknownTable = (table: string) => refuse('unknown_table', `${table} isn't a synced table.`)

  return {
    upsert: (table, rows) => {
      if (!known.has(table)) return unknownTable(table)
      // .select() returns the stored rows. A row skipped by public.skip_stale_update() isn't
      // returned, which is how push learns the server kept a newer edit.
      return send(
        db
          .from(table)
          .upsert([...rows], { onConflict: 'id' })
          .select(),
      )
    },

    getRows: (table, ids) => {
      if (!known.has(table)) return unknownTable(table)
      if (!ids.every(isUuid)) return refuse('invalid_id', 'Row ids must be UUIDs.')
      if (ids.length === 0) return Promise.resolve({ ok: true, value: [] })
      return send(
        db
          .from(table)
          .select('*')
          .in('id', [...ids])
          .retry(false),
      )
    },

    pullPage: (table, from: PullFrom, limit) => {
      if (!known.has(table)) return unknownTable(table)
      let query = db.from(table).select('*')
      switch (from.kind) {
        case 'all':
          break
        case 'since':
          if (!isTime(from.updatedAt))
            return refuse('invalid_cursor', 'The pull start isn’t a time.')
          query = query.gte('updated_at', from.updatedAt)
          break
        case 'after': {
          // Both values go into a PostgREST filter string, so both are checked first; a
          // timestamp also needs quotes there, since it contains `:` and `.`.
          if (!isCursor(from.cursor))
            return refuse('invalid_cursor', 'The pull cursor is malformed.')
          const time = `"${from.cursor.updatedAt}"`
          query = query.or(
            `updated_at.gt.${time},and(updated_at.eq.${time},id.gt.${from.cursor.id})`,
          )
          break
        }
      }
      return send(query.order('updated_at').order('id').limit(limit).retry(false))
    },
  }
}

// app_config is readable signed out, so an outdated app can tell before sign-in.
export const fetchMinAppVersion = async (
  client: SupabaseClient<Database>,
): Promise<RemoteResult<string>> => {
  const { data, error, status } = await client
    .from('app_config')
    .select('min_app_version')
    .eq('id', 1)
    .maybeSingle()
    .retry(false)
  if (error) return { ok: false, error: errorFor(status, error) }
  // No row means no minimum: never lock the app out over a missing setting.
  return { ok: true, value: data?.min_app_version ?? '0.0.0' }
}
