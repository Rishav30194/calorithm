import Dexie from 'dexie'

import type { LocalDb, OutboxEntry } from '../db'
import type { Engine } from './engine'

// Names of local databases whose delete has started. Kept outside IndexedDB, so a delete cut
// short by the app closing is finished on the next start (decision 0017).
export type PendingDeletes = {
  list: () => string[]
  add: (name: string) => void
  remove: (name: string) => void
}

export type SignOutDeps = {
  db: LocalDb
  engine: Pick<Engine, 'request' | 'whenIdle' | 'stop'>
  pending: PendingDeletes
  signOut: () => Promise<{ ok: boolean }>
}

export type SignOutCheck = { status: 'clear' } | { status: 'unsent'; entries: OutboxEntry[] }

// Syncs once more and reports what's still waiting, including changes the server refused.
// Deletes nothing and leaves sync running, so cancelling the warning changes nothing.
export const syncBeforeSignOut = async ({
  db,
  engine,
}: Pick<SignOutDeps, 'db' | 'engine'>): Promise<SignOutCheck> => {
  engine.request('sign_out')
  await engine.whenIdle()
  const entries = await db.outbox.orderBy('seq').toArray()
  return entries.length === 0 ? { status: 'clear' } : { status: 'unsent', entries }
}

// Deletes the local database, then signs out. In this order, an app closed partway leaves
// the user signed in, and the next attempt or the next start finishes the job.
export const finishSignOut = async ({
  db,
  engine,
  pending,
  signOut,
}: SignOutDeps): Promise<{ ok: boolean }> => {
  engine.stop()
  await engine.whenIdle()
  db.close()
  if (!(await deleteDatabase(db.name, pending))) return { ok: false }
  return signOut()
}

// A failed delete drops its name from the list: the user stays signed in and goes on using
// the database, so a later start must not delete it. Signing out again retries.
const deleteDatabase = async (name: string, pending: PendingDeletes): Promise<boolean> => {
  pending.add(name)
  try {
    await Dexie.delete(name)
    return true
  } catch (error) {
    console.error('couldn’t delete a local database', error)
    return false
  } finally {
    pending.remove(name)
  }
}

export const deletePendingDatabases = async (pending: PendingDeletes): Promise<void> => {
  for (const name of pending.list()) {
    await deleteDatabase(name, pending)
  }
}

export type UnsentExport = {
  format: 'calorithm-unsent-changes'
  version: 1
  exported_at: string
  changes: { table: string; row: Record<string, unknown> }[]
}

export const unsentExport = (entries: readonly OutboxEntry[], exportedAt: Date): UnsentExport => ({
  format: 'calorithm-unsent-changes',
  version: 1,
  exported_at: exportedAt.toISOString(),
  changes: entries.map(({ table, row }) => ({ table, row })),
})

// `day` is the device's local calendar day, YYYY-MM-DD.
export const unsentExportFileName = (day: string): string => `calorithm-unsent-changes-${day}.json`
