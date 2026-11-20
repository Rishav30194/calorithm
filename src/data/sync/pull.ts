import { needsFullResync } from '@/domain/retention'

import type { Cursor, LocalDb, SyncState } from '../db'
import type { TableSpec } from '../tables'
import type { SyncContext } from './push'
import type { PullFrom } from './remote'
import { isCursor, overlapStart } from './timestamps'

export type PullOutcome =
  | { status: 'done'; applied: number; skipped: number; invalid: number; resynced: string[] }
  | { status: 'retry_later' }
  | { status: 'needs_auth' }

const DEFAULT_PAGE_SIZE = 500
const cursorOf = (row: Record<string, unknown>): Cursor | null => {
  if (typeof row.updated_at !== 'string' || typeof row.id !== 'string') return null
  const cursor = { updatedAt: row.updated_at, id: row.id }
  return isCursor(cursor) ? cursor : null
}

type Counts = {
  applied: number
  skipped: number
  invalid: number
  // Every id the server sent, readable or not, so a full pull never mistakes an unreadable
  // row for one the server no longer has.
  ids: string[]
  unreadable: string[]
}

// A pulled row never replaces a local row with a queued or failed change: the push settles a
// queued one, and discarding a failed one fetches the server's copy.
const applyPage = async (
  db: LocalDb,
  spec: TableSpec,
  page: readonly Record<string, unknown>[],
): Promise<Counts> => {
  const counts: Counts = { applied: 0, skipped: 0, invalid: 0, ids: [], unreadable: [] }
  await db.transaction('rw', db.rows(spec.name), db.outbox, async () => {
    for (const raw of page) {
      const id = typeof raw.id === 'string' ? raw.id : null
      if (id) counts.ids.push(id)
      const row = spec.parse(raw)
      if (!row) {
        counts.invalid++
        if (id) counts.unreadable.push(id)
        continue
      }
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

// After a full pull, removes local rows the server no longer has, keeping any with a queued
// or failed change. Only a full pull sees every row, so only it can tell a row is gone.
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

type TableResult =
  | { status: 'done'; counts: Totals; state: SyncState; full: boolean }
  | { status: 'retry_later' | 'needs_auth' }

type Totals = { applied: number; skipped: number; invalid: number }
type Stop = { status: 'retry_later' | 'needs_auth' }

const stopOf = (kind: string): Stop => ({ status: kind === 'auth' ? 'needs_auth' : 'retry_later' })

// Where a table's pull starts. A full pull: forced, a table never pulled or unread for longer
// than the retention window, or a saved cursor that can't be read. A table whose last pull
// found no rows has no cursor and reads from the start without counting as a resync.
const plan = (state: SyncState | undefined, forceFull: boolean, now: number) => {
  const readable = state?.cursor ? isCursor(state.cursor) : false
  const start = readable && state?.cursor ? overlapStart(state.cursor.updatedAt) : null
  const unreadableCursor = Boolean(state?.cursor) && !readable
  const full = forceFull || unreadableCursor || needsFullResync(state?.lastPullAt ?? null, now)
  const from: PullFrom =
    full || start === null ? { kind: 'all' } : { kind: 'since', updatedAt: start }
  return { full, from, cursor: full ? null : (state?.cursor ?? null) }
}

// Rows an older app version couldn't read: an upgraded app may read them now.
const retryUnreadable = async (
  ctx: SyncContext,
  spec: TableSpec,
  ids: readonly string[],
  totals: Totals,
  unreadable: Set<string>,
): Promise<Stop | null> => {
  if (ids.length === 0) return null
  const fetched = await ctx.remote.getRows(spec.name, ids)
  if (!fetched.ok) return stopOf(fetched.error.kind)
  const page = await applyPage(ctx.db, spec, fetched.value)
  totals.applied += page.applied
  totals.skipped += page.skipped
  for (const id of page.unreadable) unreadable.add(id)
  return null
}

// Reads every page from `from` on, applying each, and returns the new cursor.
const readPages = async (
  ctx: SyncContext,
  spec: TableSpec,
  initial: { from: PullFrom; cursor: Cursor | null },
  totals: Totals,
  seen: Set<string>,
  unreadable: Set<string>,
): Promise<Stop | { status: 'done'; cursor: Cursor | null }> => {
  const pageSize = ctx.pageSize ?? DEFAULT_PAGE_SIZE
  let { from, cursor } = initial
  for (;;) {
    const page = await ctx.remote.pullPage(spec.name, from, pageSize)
    if (!page.ok) return stopOf(page.error.kind)
    const result = await applyPage(ctx.db, spec, page.value)
    totals.applied += result.applied
    totals.skipped += result.skipped
    totals.invalid += result.invalid
    for (const id of result.ids) {
      seen.add(id)
      unreadable.delete(id)
    }
    for (const id of result.unreadable) unreadable.add(id)

    const last = page.value.at(-1)
    const next = last ? cursorOf(last) : null
    if (next) cursor = next
    if (page.value.length < pageSize || !next) return { status: 'done', cursor }
    from = { kind: 'after', cursor: next }
  }
}

const pullTable = async (
  ctx: SyncContext,
  spec: TableSpec,
  forceFull: boolean,
): Promise<TableResult> => {
  const state = await ctx.db.sync_state.get(spec.name)
  const { full, from, cursor } = plan(state, forceFull, ctx.clock().getTime())
  const totals: Totals = { applied: 0, skipped: 0, invalid: 0 }
  const seen = new Set<string>()
  const unreadable = new Set<string>()

  // A full pull refetches every row anyway.
  const stopped = full
    ? null
    : await retryUnreadable(ctx, spec, state?.unreadable ?? [], totals, unreadable)
  if (stopped) return stopped

  const read = await readPages(ctx, spec, { from, cursor }, totals, seen, unreadable)
  if (read.status !== 'done') return read

  if (full) await removeMissing(ctx.db, spec, seen)
  return {
    status: 'done',
    counts: totals,
    full,
    state: {
      table: spec.name,
      cursor: read.cursor,
      lastPullAt: ctx.clock().getTime(),
      unreadable: [...unreadable],
    },
  }
}

export const pull = async (
  ctx: SyncContext,
  options: { full?: boolean } = {},
): Promise<PullOutcome> => {
  const total = { applied: 0, skipped: 0, invalid: 0 }
  const resynced: string[] = []

  for (const spec of ctx.tables) {
    const result = await pullTable(ctx, spec, options.full === true)
    if (result.status !== 'done') return { status: result.status }
    total.applied += result.counts.applied
    total.skipped += result.counts.skipped
    total.invalid += result.counts.invalid
    if (result.full) resynced.push(spec.name)
    await ctx.db.sync_state.put(result.state)
  }
  return { status: 'done', ...total, resynced }
}
