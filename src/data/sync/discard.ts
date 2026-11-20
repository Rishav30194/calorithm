import type { SyncContext } from './push'

export type DiscardOutcome = { status: 'done' | 'retry_later' | 'needs_auth' }

// Drops a change the server refused. Pulls skip rows with a failed change, so the local row
// may be out of date; it's replaced with the server's copy, or removed if the row never
// reached the server. Needs the network: offline, the failed change stays until it can.
export const discardFailed = async (ctx: SyncContext, seq: number): Promise<DiscardOutcome> => {
  const entry = await ctx.db.outbox.get(seq)
  if (!entry?.failure) return { status: 'done' }
  const spec = ctx.tables.find((table) => table.name === entry.table)

  const fetched = spec ? await ctx.remote.getRows(spec.name, [entry.rowId]) : null
  if (fetched && !fetched.ok) {
    return { status: fetched.error.kind === 'auth' ? 'needs_auth' : 'retry_later' }
  }

  await ctx.db.transaction('rw', ctx.db.outbox, async () => {
    const current = await ctx.db.outbox.get(seq)
    // A new edit since the failure is a new attempt; leave it.
    if (current?.rev !== entry.rev) return
    await ctx.db.outbox.delete(seq)
  })
  if (!spec || !fetched) return { status: 'done' }

  const serverRow = spec.parse(fetched.value[0] ?? null)
  await ctx.db.transaction('rw', ctx.db.rows(spec.name), ctx.db.outbox, async () => {
    // Re-check inside the transaction: a new edit may have queued the row again.
    const queued = await ctx.db.outbox
      .where('[table+rowId]')
      .equals([spec.name, entry.rowId])
      .first()
    if (queued) return
    if (serverRow) await ctx.db.rows(spec.name).put(serverRow)
    else await ctx.db.rows(spec.name).delete(entry.rowId)
  })
  return { status: 'done' }
}
