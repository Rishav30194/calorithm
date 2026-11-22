import type { PullFrom, Remote, RemoteError, RemoteResult } from '../remote'

type Row = Record<string, unknown> & {
  id: string
  user_id: string
  updated_at: string
  client_updated_at: string
}

const timestampPattern =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/

// Microseconds since the epoch, so timestamps compare exactly as Postgres compares them,
// whatever their text format.
export const toMicros = (timestamp: string): bigint => {
  const match = timestampPattern.exec(timestamp)
  if (!match) throw new Error(`FakeRemote: not a timestamp: ${timestamp}`)
  const millis = Date.parse(`${match[1]}${match[3]}`)
  return BigInt(millis) * 1000n + BigInt((match[2] ?? '').padEnd(6, '0'))
}

// The text format PostgREST returns for timestamptz.
export const fromMicros = (micros: bigint): string => {
  const iso = new Date(Number(micros / 1000n)).toISOString()
  const fraction = (micros % 1_000_000n).toString().padStart(6, '0')
  return `${iso.slice(0, 19)}.${fraction}+00:00`
}

const newer = (a: Row, b: Row): number => {
  const byTime = toMicros(a.updated_at) - toMicros(b.updated_at)
  if (byTime < 0n) return -1
  if (byTime > 0n) return 1
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

const networkError: RemoteError = { kind: 'network', code: 'network', message: 'Failed to fetch' }

const isRow = (raw: Record<string, unknown>): raw is Row =>
  typeof raw.id === 'string' &&
  typeof raw.user_id === 'string' &&
  typeof raw.client_updated_at === 'string'

// An in-memory server with the rules that matter to sync: row-level security on user_id,
// one updated_at per statement (Postgres now() is the transaction's start time), skipping
// updates older than the stored row, and statements that fail as a whole.
export class FakeRemote implements Remote {
  offline = false
  // Applies the write, then loses the response, as when a connection drops mid-request.
  loseNextResponse = false
  // Stamps the next write now but makes it visible only on release(): a slow transaction.
  holdNextUpsert = false
  failNextWith: RemoteError | null = null
  reject: (table: string, row: Row) => { code: string; message: string } | null = () => null
  readonly upserts: { table: string; ids: string[] }[] = []

  private nowMicros: bigint
  private readonly tables = new Map<string, Map<string, Row>>()
  private readonly held: { table: string; rows: Row[] }[] = []

  constructor(
    private readonly userId: string,
    start = '2026-11-20T10:00:00.000Z',
  ) {
    this.nowMicros = toMicros(start)
  }

  advance(ms: number): void {
    this.nowMicros += BigInt(ms) * 1000n
  }

  release(): void {
    for (const { table, rows } of this.held.splice(0)) {
      for (const row of rows) this.store(table).set(row.id, row)
    }
  }

  hardDelete(table: string, id: string): void {
    this.store(table).delete(id)
  }

  rows(table: string): Row[] {
    return [...this.store(table).values()].sort(newer)
  }

  async upsert(
    table: string,
    incoming: readonly Record<string, unknown>[],
  ): Promise<RemoteResult<Record<string, unknown>[]>> {
    if (this.offline) return { ok: false, error: networkError }
    if (this.failNextWith) {
      const error = this.failNextWith
      this.failNextWith = null
      return { ok: false, error }
    }

    const rows: Row[] = []
    for (const raw of incoming) {
      const row = { ...raw }
      if (!isRow(row)) {
        return { ok: false, error: { kind: 'rejected', code: '23502', message: 'missing column' } }
      }
      rows.push(row)
    }
    for (const row of rows) {
      if (row.user_id !== this.userId) {
        return {
          ok: false,
          error: { kind: 'rejected', code: '42501', message: 'row-level security' },
        }
      }
      const refusal = this.reject(table, row)
      if (refusal) return { ok: false, error: { kind: 'rejected', ...refusal } }
    }

    this.upserts.push({ table, ids: rows.map((row) => row.id) })
    this.nowMicros += 1n
    const updatedAt = fromMicros(this.nowMicros)
    const written = rows.flatMap((row) => {
      const stored = this.store(table).get(row.id)
      // public.skip_stale_update(): an older edit leaves the stored row alone.
      if (stored && toMicros(row.client_updated_at) < toMicros(stored.client_updated_at)) return []
      // Like PostgREST's upsert, a column the row leaves out keeps its stored value.
      return [{ ...stored, ...row, updated_at: updatedAt }]
    })

    if (this.holdNextUpsert) {
      this.holdNextUpsert = false
      this.held.push({ table, rows: written })
    } else {
      for (const row of written) this.store(table).set(row.id, row)
    }

    if (this.loseNextResponse) {
      this.loseNextResponse = false
      return { ok: false, error: networkError }
    }
    return { ok: true, value: written.map((row) => ({ ...row })) }
  }

  async getRows(
    table: string,
    ids: readonly string[],
  ): Promise<RemoteResult<Record<string, unknown>[]>> {
    if (this.offline) return { ok: false, error: networkError }
    const wanted = new Set(ids)
    const rows = this.rows(table).filter((row) => row.user_id === this.userId && wanted.has(row.id))
    return { ok: true, value: rows.map((row) => ({ ...row })) }
  }

  async pullPage(
    table: string,
    from: PullFrom,
    limit: number,
  ): Promise<RemoteResult<Record<string, unknown>[]>> {
    if (this.offline) return { ok: false, error: networkError }
    const after = (row: Row): boolean => {
      switch (from.kind) {
        case 'all':
          return true
        case 'since':
          return toMicros(row.updated_at) >= toMicros(from.updatedAt)
        case 'after': {
          const time = toMicros(row.updated_at) - toMicros(from.cursor.updatedAt)
          return time > 0n || (time === 0n && row.id > from.cursor.id)
        }
      }
    }
    const page = this.rows(table)
      .filter((row) => row.user_id === this.userId && after(row))
      .slice(0, limit)
    return { ok: true, value: page.map((row) => ({ ...row })) }
  }

  private store(table: string): Map<string, Row> {
    let rows = this.tables.get(table)
    if (!rows) {
      rows = new Map()
      this.tables.set(table, rows)
    }
    return rows
  }
}
