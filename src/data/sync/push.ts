import { backoffMs } from '@/domain/backoff'

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
// a push was in flight is never cleared or marked failed.
const settle = async (db: LocalDb, entry: Entry, change: 'delete' | Partial<OutboxEntry>) => {
  await db.transaction('rw', db.outbox, async () => {
    const current = await db.outbox.get(entry.seq)
    if (current?.rev !== entry.rev) return
    if (change === 'delete') await db.outbox.delete(entry.seq)
    else await db.outbox.update(entry.seq, change)
  })
}

const fail = (db: LocalDb, entry: Entry, code: string, message: string) =>
  settle(db, entry, { failure: { code, message } })

// Brings the row up to the table's current shape, then checks it.
const prepare = (spec: TableSpec, entry: Entry): Record<string, unknown> | null => {
  const row =
    entry.schemaVersion < spec.schemaVersion && spec.upgrade
      ? spec.upgrade(entry.row, entry.schemaVersion)
      : entry.row
  return spec.parse(row)
}

type BatchResult = { sent: number; failed: number; stop: Stop | null }

const sendBatch = async (ctx: SyncContext, table: string, items: Item[]): Promise<BatchResult> => {
  const result = await ctx.remote.upsert(
    table,
    items.map((item) => item.row),
  )
  if (result.ok) {
    for (const { entry } of items) await settle(ctx.db, entry, 'delete')
    return { sent: items.length, failed: 0, stop: null }
  }

  const stop = stopFor(result.error)
  if (stop) return { sent: 0, failed: 0, stop }

  const [only] = items
  if (items.length === 1 && only) {
    await fail(ctx.db, only.entry, result.error.code, result.error.message)
    return { sent: 0, failed: 1, stop: null }
  }

  // Postgres rejects a statement as a whole, so one bad row fails its batch. Sending the rows
  // one at a time finds the bad ones and lets the rest through.
  const total: BatchResult = { sent: 0, failed: 0, stop: null }
  for (const item of items) {
    const single = await sendBatch(ctx, table, [item])
    total.sent += single.sent
    total.failed += single.failed
    if (single.stop) return { ...total, stop: single.stop }
  }
  return total
}

const backOff = async (ctx: SyncContext, entries: Entry[]) => {
  const now = ctx.clock().getTime()
  for (const entry of entries) {
    const attempts = entry.attempts + 1
    await settle(ctx.db, entry, {
      attempts,
      nextAttemptAt: now + backoffMs(attempts, ctx.random()),
    })
  }
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
  if (entries.some((entry) => entry.nextAttemptAt > now)) {
    return { status: 'retry_later', sent: 0, failed: 0 }
  }

  let sent = 0
  let failed = 0
  const known = new Set(ctx.tables.map((spec) => spec.name))
  for (const entry of entries.filter((e) => !known.has(e.table))) {
    await fail(
      ctx.db,
      entry,
      'unknown_table',
      `This app version has no table named ${entry.table}.`,
    )
    failed++
  }

  for (const spec of ctx.tables) {
    const items: Item[] = []
    for (const entry of entries.filter((e) => e.table === spec.name)) {
      const row = prepare(spec, entry)
      if (row) {
        items.push({ entry, row })
      } else {
        await fail(ctx.db, entry, 'invalid_row', `The row doesn't match the ${spec.name} table.`)
        failed++
      }
    }

    const size = ctx.batchSize ?? DEFAULT_BATCH_SIZE
    for (let start = 0; start < items.length; start += size) {
      const result = await sendBatch(ctx, spec.name, items.slice(start, start + size))
      sent += result.sent
      failed += result.failed
      if (result.stop) {
        const remaining = (await ctx.db.outbox.toArray())
          .filter(hasSeq)
          .filter((entry) => entry.failure === null)
        await backOff(ctx, remaining)
        return { status: result.stop, sent, failed }
      }
    }
  }
  return { status: 'done', sent, failed }
}
