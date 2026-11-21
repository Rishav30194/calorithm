import { BACKOFF_MIN_MS } from '@/domain/backoff'
import { isBelowMinimum } from '@/domain/version'

import type { SyncContext } from './push'
import type { RemoteResult } from './remote'
import { syncOnce } from './sync'

// Writes made within this window go out in one sync instead of one each.
export const WRITE_DELAY_MS = 3_000
// When a sync fails with nothing in backoff (a pull failed, say), try again after this long.
const RETRY_FALLBACK_MS = 30_000

// offline: the last sync couldn't reach the server; it retries on its own.
// signed_out: the session expired and couldn't be refreshed; the user must sign in again.
export type SyncProblem = 'offline' | 'signed_out' | null

export type SyncStatus =
  | { state: 'idle' | 'syncing'; lastSyncedAt: number | null; problem: SyncProblem }
  // This app version is older than app_config.min_app_version: syncing stops for good.
  | { state: 'update_required'; minimum: string }

export type SyncTrigger = 'start' | 'online' | 'visible' | 'write' | 'sign_out'

export type EngineDeps = {
  ctx: SyncContext
  appVersion: string
  minAppVersion: () => Promise<RemoteResult<string>>
  // Returns whether the session is valid again.
  refreshSession: () => Promise<boolean>
  onStatus: (status: SyncStatus) => void
  // Injected so tests control time; defaults to the global timers.
  timers?: Timers
}

// Starts a timer and returns the function that cancels it.
export type Timers = { set: (callback: () => void, ms: number) => () => void }

const globalTimers: Timers = {
  set: (callback, ms) => {
    const id = setTimeout(callback, ms)
    return () => clearTimeout(id)
  },
}

export type Engine = {
  request: (trigger: SyncTrigger) => void
  // Resolves once no sync is running, such as before signing out.
  whenIdle: () => Promise<void>
  stop: () => void
}

type Result = 'done' | 'retry_later' | 'needs_auth' | 'update_required'

// Decides when to sync: at start, when the connection returns, when the app comes back to
// the foreground, and a few seconds after writes. Only one sync runs at a time; a request
// made during one runs once more after it.
export const createEngine = (deps: EngineDeps): Engine => {
  let lastSyncedAt: number | null = null
  let problem: SyncProblem = null
  let running = false
  let again = false
  let stopped = false
  let requiredMinimum: string | null = null
  let cancelTimer: (() => void) | undefined
  let dueAt = Number.POSITIVE_INFINITY
  let current: Promise<void> = Promise.resolve()
  const timers = deps.timers ?? globalTimers

  const now = () => deps.ctx.clock().getTime()

  const cancel = () => {
    cancelTimer?.()
    cancelTimer = undefined
    dueAt = Number.POSITIVE_INFINITY
  }

  // Keeps whichever run is due first, so a stream of writes can't keep postponing sync and a
  // write never pushes a backoff retry later.
  const schedule = (ms: number) => {
    const at = now() + ms
    if (at >= dueAt) return
    cancel()
    dueAt = at
    cancelTimer = timers.set(() => {
      cancelTimer = undefined
      dueAt = Number.POSITIVE_INFINITY
      void run()
    }, ms)
  }

  // The soonest an outbox entry leaves backoff, or the fallback when none is waiting.
  const retryDelay = async (): Promise<number> => {
    const at = now()
    const waits = (await deps.ctx.db.outbox.toArray())
      .filter((entry) => entry.failure === null && entry.nextAttemptAt > at)
      .map((entry) => entry.nextAttemptAt - at)
    return waits.length > 0 ? Math.max(BACKOFF_MIN_MS, Math.min(...waits)) : RETRY_FALLBACK_MS
  }

  const syncChecked = async (): Promise<Result> => {
    const minimum = await deps.minAppVersion()
    if (!minimum.ok) return minimum.error.kind === 'auth' ? 'needs_auth' : 'retry_later'
    if (isBelowMinimum(deps.appVersion, minimum.value)) {
      requiredMinimum = minimum.value
      return 'update_required'
    }
    return (await syncOnce(deps.ctx)).status
  }

  const attempt = async (): Promise<Result> => {
    const result = await syncChecked()
    if (result !== 'needs_auth') return result
    return (await deps.refreshSession()) ? syncChecked() : 'needs_auth'
  }

  const finish = async (result: Result) => {
    switch (result) {
      case 'done':
        lastSyncedAt = now()
        problem = null
        return
      case 'retry_later':
        problem = 'offline'
        schedule(await retryDelay())
        return
      case 'needs_auth':
        problem = 'signed_out'
        return
      case 'update_required':
        cancel()
        return
    }
  }

  const run = (): Promise<void> => {
    if (stopped || requiredMinimum !== null) return current
    if (running) {
      again = true
      return current
    }
    running = true
    current = runOnce()
    return current
  }

  const runOnce = async (): Promise<void> => {
    deps.onStatus({ state: 'syncing', lastSyncedAt, problem })
    try {
      await finish(await attempt())
    } catch (error) {
      // A bug, not a sync outcome: report it and try again later rather than stop syncing.
      console.error('sync failed unexpectedly', error)
      problem = 'offline'
      schedule(RETRY_FALLBACK_MS)
    } finally {
      running = false
    }

    if (requiredMinimum !== null) {
      deps.onStatus({ state: 'update_required', minimum: requiredMinimum })
      return
    }
    deps.onStatus({ state: 'idle', lastSyncedAt, problem })
    if (again && !stopped) {
      again = false
      await run()
    }
  }

  return {
    request: (trigger) => {
      if (stopped || requiredMinimum !== null) return
      if (trigger === 'write') {
        schedule(WRITE_DELAY_MS)
        return
      }
      cancel()
      void run()
    },
    whenIdle: async () => {
      // A sync can start another before it ends, so wait until none is left running.
      while (running) await current
    },
    stop: () => {
      stopped = true
      cancel()
    },
  }
}
