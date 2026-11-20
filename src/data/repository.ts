import type { LocalDb } from './db'
import type { SyncRow, TableSpec } from './tables'

export type Clock = () => Date

// The only way rows change locally: the row and its outbox entry are written in one
// transaction, so a crash never leaves a change that won't sync, or an entry with no row.
// Callers parse user input before building the draft, so a draft that doesn't fit the table
// is a bug and throws, rather than an expected failure with a typed result.
export const writeRow = async <Row extends SyncRow>(
  db: LocalDb,
  spec: TableSpec<Row>,
  draft: Row,
  clock: Clock,
): Promise<Row> => {
  const now = clock().toISOString()
  const row = spec.parse({
    ...draft,
    client_updated_at: now,
    schema_version: spec.schemaVersion,
    // The server overwrites updated_at; locally it only needs a valid value until the pull.
    updated_at: draft.updated_at || now,
  })
  if (!row) throw new Error(`writeRow: the row doesn't match the ${spec.name} table`)

  await db.transaction('rw', db.rows(spec.name), db.outbox, async () => {
    await db.rows(spec.name).put(row)
    const existing = await db.outbox.where('[table+rowId]').equals([spec.name, row.id]).first()
    if (existing?.seq !== undefined) {
      await db.outbox.update(existing.seq, {
        row,
        schemaVersion: spec.schemaVersion,
        rev: existing.rev + 1,
        attempts: 0,
        nextAttemptAt: 0,
        failure: null,
      })
    } else {
      await db.outbox.add({
        table: spec.name,
        rowId: row.id,
        row,
        schemaVersion: spec.schemaVersion,
        rev: 1,
        attempts: 0,
        nextAttemptAt: 0,
        failure: null,
      })
    }
  })
  return row
}

export const softDelete = async <Row extends SyncRow>(
  db: LocalDb,
  spec: TableSpec<Row>,
  id: string,
  clock: Clock,
): Promise<void> => {
  const current = spec.parse(await db.rows(spec.name).get(id))
  if (!current) return
  await writeRow(db, spec, { ...current, deleted_at: clock().toISOString() }, clock)
}

// Screens read through this, so soft-deleted rows never show.
export const visibleRows = async <Row extends SyncRow>(
  db: LocalDb,
  spec: TableSpec<Row>,
): Promise<Row[]> => {
  const all = await db.rows(spec.name).toArray()
  return all.flatMap((raw) => {
    const row = spec.parse(raw)
    return row && row.deleted_at === null ? [row] : []
  })
}
