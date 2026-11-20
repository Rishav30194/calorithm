import { pull } from './pull'
import { push, type SyncContext } from './push'

export type SyncOutcome =
  | { status: 'done'; resynced: boolean; sent: number; failed: number; applied: number }
  | { status: 'retry_later' }
  | { status: 'needs_auth' }

// One sync: push local changes, then pull. A pull never replaces a row with a queued change,
// so it's safe even when the push couldn't finish, and it still brings in other devices'
// changes while this device's changes wait in backoff. A table not pulled within the
// retention window gets a full pull that also drops rows the server no longer has.
export const syncOnce = async (ctx: SyncContext): Promise<SyncOutcome> => {
  const pushed = await push(ctx)
  // An expired session fails the pull too; the app refreshes it first.
  if (pushed.status === 'needs_auth') return { status: 'needs_auth' }

  const pulled = await pull(ctx)
  if (pulled.status !== 'done') return { status: pulled.status }
  if (pushed.status === 'retry_later') return { status: 'retry_later' }

  return {
    status: 'done',
    resynced: pulled.resynced.length > 0,
    sent: pushed.sent,
    failed: pushed.failed,
    applied: pulled.applied,
  }
}
