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
  // Returns the rows the server stored. A row the server skipped as older than its own copy
  // (public.skip_stale_update) is missing from the result.
  upsert: (
    table: string,
    rows: readonly Record<string, unknown>[],
  ) => Promise<RemoteResult<Record<string, unknown>[]>>
  // The server's current copies of these rows; rows it doesn't have are missing.
  getRows: (
    table: string,
    ids: readonly string[],
  ) => Promise<RemoteResult<Record<string, unknown>[]>>
  pullPage: (
    table: string,
    from: PullFrom,
    limit: number,
  ) => Promise<RemoteResult<Record<string, unknown>[]>>
}
