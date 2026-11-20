import { needsFullResync } from '@/domain/retention'

import { pull } from './pull'
import { push, type SyncContext } from './push'

export type SyncOutcome =
  | { status: 'done'; resynced: boolean; sent: number; failed: number; applied: number }
  | { status: 'retry_later' }
  | { status: 'needs_auth' }

// The oldest table's last pull; null if any table has never been pulled.
const lastPullOf = async (ctx: SyncContext): Promise<number | null> => {
  let oldest: number | null = Number.POSITIVE_INFINITY
  for (const spec of ctx.tables) {
    const at = (await ctx.db.sync_state.get(spec.name))?.lastPullAt ?? null
    if (at === null) return null
    oldest = Math.min(oldest, at)
  }
  return oldest
}

// One sync: push local changes first, then pull. Pushing first means a pull never brings back
// an older server copy over an edit that only exists here. A device that hasn't pulled within
// the retention window pulls everything and drops rows the server no longer has.
export const syncOnce = async (ctx: SyncContext): Promise<SyncOutcome> => {
  const pushed = await push(ctx)
  if (pushed.status !== 'done') return { status: pushed.status }

  const resync = needsFullResync(await lastPullOf(ctx), ctx.clock().getTime())
  const pulled = await pull(ctx, { full: resync })
  if (pulled.status !== 'done') return { status: pulled.status }

  return {
    status: 'done',
    resynced: resync,
    sent: pushed.sent,
    failed: pushed.failed,
    applied: pulled.applied,
  }
}
