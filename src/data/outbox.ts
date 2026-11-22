import type { LocalDb } from './db'

export type FailedChange = { seq: number; table: string; code: string; message: string }

export type OutboxSummary = { pending: number; failed: FailedChange[] }

export type OutboxRead = { ok: true; summary: OutboxSummary } | { ok: false }

// Changes waiting to sync, and those the server refused. A failed read is reported, not
// thrown, so the screens can say so and offer to try again.
export const readOutbox = async (db: LocalDb): Promise<OutboxRead> => {
  try {
    const entries = await db.outbox.toArray()
    const failed: FailedChange[] = entries.flatMap((entry) =>
      entry.failure && entry.seq !== undefined
        ? [{ seq: entry.seq, table: entry.table, ...entry.failure }]
        : [],
    )
    return { ok: true, summary: { pending: entries.length - failed.length, failed } }
  } catch {
    return { ok: false }
  }
}
