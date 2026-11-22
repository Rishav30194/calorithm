import { BACKOFF_MAX_MS, backoffMs } from '@/domain/backoff'

import type { LocalDb, OutboxEntry } from '../db'
import type { Clock } from '../repository'
import type { TableSpec } from '../tables'
import type { Remote, RemoteError } from './remote'

export type SyncContext = {
  db: LocalDb
  remote: Remote
  // In push order: parents before children.
  tables: readonly TableSpec[]
  clock: Clock
  // A value in [0, 1] for backoff jitter; injected so tests are deterministic.
  random: () => number
  batchSize?: number
  pageSize?: number
}

export type PushOutcome = {
  status: 'done' | 'retry_later' | 'needs_auth'
  sent: number
  failed: number
}

type Entry = OutboxEntry & { seq: number }
type Item = { entry: Entry; row: Record<string, unknown> }
type Stop = 'retry_later' | 'needs_auth'

const DEFAULT_BATCH_SIZE = 100

const hasSeq = (entry: OutboxEntry): entry is Entry => entry.seq !== undefined

const stopFor = (error: RemoteError): Stop | null => {
  switch (error.kind) {
    case 'network':
      return 'retry_later'
    case 'auth':
      return 'needs_auth'
    case 'rejected':
      return null
  }
}

// Only touches an entry that hasn't been edited since it was read, so a newer edit made while
// a push was in flight is never cleared, overwritten, or marked failed.
const settle = async (
  db: LocalDb,
  spec: TableSpec,
  entry: Entry,
  change: { kind: 'sent'; serverRow: Record<string, unknown> | null } | Partial<OutboxEntry>,
) => {
  await db.transaction('rw', db.rows(spec.name), db.outbox, async () => {
    const current = await db.outbox.get(entry.seq)
    if (current?.rev !== entry.rev) return
    if ('kind' in change) {
      await db.outbox.delete(entry.seq)
      // The server's copy wins locally too: it carries the server's updated_at, and when the
      // server kept a newer edit from another device, that edit replaces this one.
      const row = spec.parse(change.serverRow)
      if (row) await db.rows(spec.name).put(row)
    } else {
      await db.outbox.update(entry.seq, change)
    }
  })
}

const fail = (db: LocalDb, spec: TableSpec, entry: Entry, code: string, message: string) =>
  settle(db, spec, entry, { failure: { code, message } })

// Brings the row up to the table's current shape, then checks it. Columns added after the
// entry's version are left out, so the upsert keeps the server's values for them.
const prepare = (spec: TableSpec, entry: Entry): Record<string, unknown> | null => {
  const row =
    entry.schemaVersion < spec.schemaVersion && spec.upgrade
      ? spec.upgrade(entry.row, entry.schemaVersion)
      : entry.row
  const parsed: Record<string, unknown> | null = spec.parse(row)
  if (!parsed) return null
  const prepared = { ...parsed }
  for (const [version, columns] of Object.entries(spec.addedColumns ?? {})) {
    if (Number(version) <= entry.schemaVersion) continue
    for (const column of columns) delete prepared[column]
  }
  return prepared
}

const idOf = (row: Record<string, unknown>): string | null =>
  typeof row.id === 'string' ? row.id : null

type BatchResult = { sent: number; failed: number; stop: Stop | null }

// Rows missing from an upsert's result were skipped as older than the server's copy. Their
// updated_at didn't change, so no later pull would fetch the newer copy; fetch it now.
const fetchSkipped = async (
  ctx: SyncContext,
  spec: TableSpec,
  items: Item[],
  stored: Map<string | null, Record<string, unknown>>,
): Promise<Stop | null> => {
  const skipped = items.filter((item) => !stored.has(item.entry.rowId))
  if (skipped.length === 0) return null
  const fetched = await ctx.remote.getRows(
    spec.name,
    skipped.map((item) => item.entry.rowId),
  )
  if (!fetched.ok) return stopFor(fetched.error) ?? 'retry_later'
  for (const row of fetched.value) stored.set(idOf(row), row)
  return null
}

const FOREIGN_KEY_VIOLATION = '23503'

const hasFailedParent = async (ctx: SyncContext, spec: TableSpec, entry: Entry) => {
  const parents = spec.parents?.(entry.row) ?? []
  for (const parent of parents) {
    const queued = await ctx.db.outbox
      .where('[table+rowId]')
      .equals([parent.table, parent.id])
      .first()
    if (queued?.failure) return true
  }
  return false
}

// Postgres rejects a statement as a whole, so one bad row fails its batch. Sending the rows
// one at a time finds the bad ones and lets the rest through.
const isolateRejected = async (
  ctx: SyncContext,
  spec: TableSpec,
  items: Item[],
  error: RemoteError,
): Promise<BatchResult> => {
  const [only] = items
  if (items.length === 1 && only) {
    // A missing parent whose own change failed: the row stays queued, not failed, and goes
    // out once the parent is fixed or discarded (decision 0019).
    if (error.code === FOREIGN_KEY_VIOLATION && (await hasFailedParent(ctx, spec, only.entry))) {
      return { sent: 0, failed: 0, stop: null }
    }
    await fail(ctx.db, spec, only.entry, error.code, error.message)
    return { sent: 0, failed: 1, stop: null }
  }
  const total: BatchResult = { sent: 0, failed: 0, stop: null }
  for (const item of items) {
    const single = await sendBatch(ctx, spec, [item])
    total.sent += single.sent
    total.failed += single.failed
    if (single.stop) return { ...total, stop: single.stop }
  }
  return total
}

const sendBatch = async (
  ctx: SyncContext,
  spec: TableSpec,
  items: Item[],
): Promise<BatchResult> => {
  const result = await ctx.remote.upsert(
    spec.name,
    items.map((item) => item.row),
  )
  if (!result.ok) {
    const stop = stopFor(result.error)
    return stop ? { sent: 0, failed: 0, stop } : isolateRejected(ctx, spec, items, result.error)
  }

  const stored = new Map(result.value.map((row) => [idOf(row), row]))
  const stop = await fetchSkipped(ctx, spec, items, stored)
  // If the fetch failed, only rows the server stored are settled; skipped ones stay queued
  // and are resolved on the next push.
  const settled = stop ? items.filter((item) => stored.has(item.entry.rowId)) : items
  for (const { entry } of settled) {
    await settle(ctx.db, spec, entry, { kind: 'sent', serverRow: stored.get(entry.rowId) ?? null })
  }
  return { sent: settled.length, failed: 0, stop }
}

const backOff = async (ctx: SyncContext) => {
  const now = ctx.clock().getTime()
  const waiting = (await ctx.db.outbox.toArray())
    .filter(hasSeq)
    .filter((entry) => entry.failure === null)
  const specs = new Map(ctx.tables.map((spec) => [spec.name, spec]))
  for (const entry of waiting) {
    const spec = specs.get(entry.table)
    if (!spec) continue
    const attempts = entry.attempts + 1
    await settle(ctx.db, spec, entry, {
      attempts,
      nextAttemptAt: now + backoffMs(attempts, ctx.random()),
    })
  }
}

// A backoff time more than the maximum delay ahead was set by a clock that has since moved
// back; waiting for it could stall sync for days, so it counts as due.
const isWaiting = (entry: Entry, now: number): boolean =>
  entry.nextAttemptAt > now && entry.nextAttemptAt <= now + BACKOFF_MAX_MS

const failUnknownTables = async (ctx: SyncContext, entries: Entry[]): Promise<number> => {
  const known = new Set(ctx.tables.map((spec) => spec.name))
  const unknown = entries.filter((entry) => !known.has(entry.table))
  for (const entry of unknown) {
    // No spec for this table, so it's marked directly rather than through settle().
    await ctx.db.outbox.update(entry.seq, {
      failure: {
        code: 'unknown_table',
        message: `This app version has no table named ${entry.table}.`,
      },
    })
  }
  return unknown.length
}

const prepareItems = async (
  ctx: SyncContext,
  spec: TableSpec,
  entries: Entry[],
): Promise<{ items: Item[]; failed: number }> => {
  const items: Item[] = []
  let failed = 0
  for (const entry of entries.filter((e) => e.table === spec.name)) {
    const row = prepare(spec, entry)
    if (row) {
      items.push({ entry, row })
    } else {
      await fail(
        ctx.db,
        spec,
        entry,
        'invalid_row',
        `The row doesn't match the ${spec.name} table.`,
      )
      failed++
    }
  }
  return { items, failed }
}

export const push = async (ctx: SyncContext): Promise<PushOutcome> => {
  const now = ctx.clock().getTime()
  const entries = (await ctx.db.outbox.toArray())
    .filter(hasSeq)
    .filter((entry) => entry.failure === null)
    .sort((a, b) => a.seq - b.seq)
  if (entries.length === 0) return { status: 'done', sent: 0, failed: 0 }
  // Network failures affect every entry alike, so backoff is shared: one waiting entry holds
  // the whole push, which also keeps children from going ahead of a waiting parent.
  if (entries.some((entry) => isWaiting(entry, now))) {
    return { status: 'retry_later', sent: 0, failed: 0 }
  }

  let sent = 0
  let failed = await failUnknownTables(ctx, entries)
  const size = ctx.batchSize ?? DEFAULT_BATCH_SIZE
  for (const spec of ctx.tables) {
    const prepared = await prepareItems(ctx, spec, entries)
    failed += prepared.failed
    for (let start = 0; start < prepared.items.length; start += size) {
      const result = await sendBatch(ctx, spec, prepared.items.slice(start, start + size))
      sent += result.sent
      failed += result.failed
      if (result.stop) {
        // Only network errors back off. After an auth error the app refreshes the session
        // and retries at once.
        if (result.stop === 'retry_later') await backOff(ctx)
        return { status: result.stop, sent, failed }
      }
    }
  }
  return { status: 'done', sent, failed }
}
