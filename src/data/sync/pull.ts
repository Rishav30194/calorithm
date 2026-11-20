import type { Cursor, LocalDb } from '../db'
import type { TableSpec } from '../tables'
import type { SyncContext } from './push'
import type { PullFrom } from './remote'

export type PullOutcome =
  | { status: 'done'; applied: number; skipped: number; invalid: number }
  | { status: 'retry_later' }
  | { status: 'needs_auth' }

const DEFAULT_PAGE_SIZE = 500
// updated_at is the transaction's start time, so a slow transaction can commit after a pull
// has passed it. Starting each pull a minute early catches it; rows read twice are harmless.
const OVERLAP_MS = 60_000

// Date drops microseconds, which only moves the start a little earlier: safe for the overlap.
// The cursor itself stays the exact string Postgres returned.
export const overlapStart = (updatedAt: string): string =>
  new Date(Date.parse(updatedAt) - OVERLAP_MS).toISOString()

const cursorOf = (row: Record<string, unknown>): Cursor | null =>
  typeof row.updated_at === 'string' && typeof row.id === 'string'
    ? { updatedAt: row.updated_at, id: row.id }
    : null

type Counts = { applied: number; skipped: number; invalid: number; ids: string[] }

// A pulled row never replaces a local row with an unsent change: the push settles that row,
// and the next pull brings back whichever edit won.
const applyPage = async (
  db: LocalDb,
  spec: TableSpec,
  page: readonly Record<string, unknown>[],
): Promise<Counts> => {
  const counts: Counts = { applied: 0, skipped: 0, invalid: 0, ids: [] }
  await db.transaction('rw', db.rows(spec.name), db.outbox, async () => {
    for (const raw of page) {
      const row = spec.parse(raw)
      if (!row) {
        counts.invalid++
        continue
      }
      counts.ids.push(row.id)
      const pending = await db.outbox.where('[table+rowId]').equals([spec.name, row.id]).first()
      if (pending) {
        counts.skipped++
        continue
      }
      await db.rows(spec.name).put(row)
      counts.applied++
    }
  })
  return counts
}

// After a full pull, removes local rows the server no longer has, keeping any with an unsent
// change. Only a full pull sees every row, so only it can tell a row is gone.
const removeMissing = async (db: LocalDb, spec: TableSpec, seen: ReadonlySet<string>) => {
  await db.transaction('rw', db.rows(spec.name), db.outbox, async () => {
    const pending = new Set(
      (await db.outbox.where('table').equals(spec.name).toArray()).map((entry) => entry.rowId),
    )
    const local = await db.rows(spec.name).toCollection().primaryKeys()
    const gone = local.filter((id) => !seen.has(id) && !pending.has(id))
    await db.rows(spec.name).bulkDelete(gone)
  })
}

export const pull = async (
  ctx: SyncContext,
  options: { full?: boolean } = {},
): Promise<PullOutcome> => {
  const pageSize = ctx.pageSize ?? DEFAULT_PAGE_SIZE
  const total = { applied: 0, skipped: 0, invalid: 0 }

  for (const spec of ctx.tables) {
    const state = await ctx.db.sync_state.get(spec.name)
    let cursor = options.full ? null : (state?.cursor ?? null)
    let from: PullFrom = cursor
      ? { kind: 'since', updatedAt: overlapStart(cursor.updatedAt) }
      : { kind: 'all' }
    const seen = new Set<string>()

    for (;;) {
      const page = await ctx.remote.pullPage(spec.name, from, pageSize)
      if (!page.ok) {
        return { status: page.error.kind === 'auth' ? 'needs_auth' : 'retry_later' }
      }
      const counts = await applyPage(ctx.db, spec, page.value)
      total.applied += counts.applied
      total.skipped += counts.skipped
      total.invalid += counts.invalid
      for (const id of counts.ids) seen.add(id)

      const last = page.value.at(-1)
      const next = last ? cursorOf(last) : null
      if (next) cursor = next
      if (page.value.length < pageSize || !next) break
      from = { kind: 'after', cursor: next }
    }

    if (options.full) await removeMissing(ctx.db, spec, seen)
    await ctx.db.sync_state.put({ table: spec.name, cursor, lastPullAt: ctx.clock().getTime() })
  }
  return { status: 'done', ...total }
}
