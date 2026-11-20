import type { Cursor } from '../db'

// network: retry later. auth: refresh the session, then retry. rejected: the server refused
// the data itself (a constraint, a policy, a foreign key); retrying can't help.
export type RemoteError = { kind: 'network' | 'auth' | 'rejected'; code: string; message: string }

export type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: RemoteError }

export type PullFrom =
  | { kind: 'all' }
  // updated_at >= updatedAt: the first page of a pull, starting before the saved cursor.
  | { kind: 'since'; updatedAt: string }
  // (updated_at, id) > cursor: the next page.
  | { kind: 'after'; cursor: Cursor }

// The sync's only view of the server. Supabase implements it in production; a fake that keeps
// the same rules implements it in unit tests.
export type Remote = {
  upsert: (table: string, rows: readonly Record<string, unknown>[]) => Promise<RemoteResult<null>>
  pullPage: (
    table: string,
    from: PullFrom,
    limit: number,
  ) => Promise<RemoteResult<Record<string, unknown>[]>>
}
