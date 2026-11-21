import { lightFormat } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { refreshSession, signOut } from './auth'
import { dbNameFor, LocalDb, type OutboxEntry } from './db'
import type { Env } from './env'
import { readProfile, type SetUnitsResult, setUnits, type Units } from './profile'
import { browserPendingDeletes } from './storage'
import { getClient } from './supabase'
import { type DiscardOutcome, discardFailed } from './sync/discard'
import { createEngine, type Engine, type SyncStatus } from './sync/engine'
import type { SyncContext } from './sync/push'
import {
  finishSignOut,
  syncBeforeSignOut,
  unsentExport,
  unsentExportFileName,
} from './sync/session'
import { createSupabaseRemote, fetchMinAppVersion } from './sync/supabaseRemote'
import { syncedTables } from './tables'

// `generation` is the one the session was opened for, so a stale one is never shown.
type Session = { ctx: SyncContext; engine: Engine; generation: number }

type SignOutStep =
  | { step: 'idle' | 'syncing' | 'deleting' | 'failed' }
  | { step: 'confirm'; entries: OutboxEntry[] }

export type SignOutState =
  | { step: 'idle' | 'syncing' | 'deleting' | 'failed' }
  | { step: 'confirm'; count: number }

export type UnsentFile = { name: string; contents: string }

export type SignOutControls = {
  state: SignOutState
  // Syncs, then signs out, or stops at 'confirm' when changes couldn't be sent.
  start: () => Promise<void>
  confirm: () => void
  cancel: () => void
  unsentFile: () => UnsentFile | null
}

type DataContextValue = Session & {
  userId: string
  status: SyncStatus
  signOut: SignOutControls
}

const DataContext = createContext<DataContextValue | null>(null)

const useData = (): DataContextValue => {
  const value = useContext(DataContext)
  if (!value) throw new Error('Data hooks must be used inside <DataProvider>')
  return value
}

// Opens the signed-in user's local database and runs sync for it. Screens use the hooks
// below; they never see the database or the Supabase client.
export const DataProvider = ({
  env,
  userId,
  loading,
  children,
}: {
  env: Env
  userId: string
  loading: ReactNode
  children: ReactNode
}) => {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<SyncStatus>({
    state: 'idle',
    lastSyncedAt: null,
    problem: null,
  })
  const [signOutStep, setSignOutStep] = useState<SignOutStep>({ step: 'idle' })
  // Bumped to open a fresh database after a sign-out that deleted it but then failed.
  const [generation, setGeneration] = useState(0)
  const deleting = useRef(false)
  const pending = useMemo(browserPendingDeletes, [])
  const client = getClient(env)

  // The database and engine are made and closed in one effect, so each run of the effect
  // (React runs it twice in development) cleans up exactly what it opened.
  // A new generation reopens the database after a failed sign-out deleted it.
  useEffect(() => {
    const db = new LocalDb(dbNameFor(userId))
    const ctx: SyncContext = {
      db,
      remote: createSupabaseRemote(client),
      tables: syncedTables,
      clock: () => new Date(),
      random: Math.random,
    }
    const engine = createEngine({
      ctx,
      appVersion: __APP_VERSION__,
      minAppVersion: () => fetchMinAppVersion(client),
      refreshSession: () => refreshSession(client),
      onStatus: setStatus,
    })
    const online = () => engine.request('online')
    const visible = () => {
      if (document.visibilityState === 'visible') engine.request('visible')
    }
    window.addEventListener('online', online)
    document.addEventListener('visibilitychange', visible)
    // Another tab signing out deletes this database. Dexie then closes it but would reopen it
    // on the next query, recreating it; closing again turns that off. The screens wait on the
    // loading screen until that tab's sign-out reaches this one.
    db.on('versionchange', () => {
      engine.stop()
      db.close()
      setSession(null)
    })
    setSession({ ctx, engine, generation })
    engine.request('start')

    return () => {
      window.removeEventListener('online', online)
      document.removeEventListener('visibilitychange', visible)
      engine.stop()
      setSession(null)
      // A sync already running finishes before its database closes.
      void engine.whenIdle().then(() => db.close())
    }
  }, [userId, client, generation])

  // Runs after the screens below have unmounted, so none reads the database as it closes.
  // The ref keeps React's development double-run from deleting and signing out twice.
  useEffect(() => {
    if (signOutStep.step !== 'deleting' || !session || deleting.current) return
    deleting.current = true
    void finishSignOut({
      db: session.ctx.db,
      engine: session.engine,
      pending,
      signOut: () => signOut(client),
    })
      .catch((error: unknown) => {
        console.error('sign-out failed', error)
        return { ok: false }
      })
      .then((result) => {
        // On success the session listener replaces this provider with the sign-in screen.
        if (result.ok) return
        deleting.current = false
        setGeneration((value) => value + 1)
        setSignOutStep({ step: 'failed' })
      })
  }, [signOutStep.step, session, pending, client])

  const signOutControls = useMemo((): SignOutControls | null => {
    if (!session) return null
    const state: SignOutState =
      signOutStep.step === 'confirm'
        ? { step: 'confirm', count: signOutStep.entries.length }
        : signOutStep
    return {
      state,
      start: async () => {
        setSignOutStep({ step: 'syncing' })
        try {
          const check = await syncBeforeSignOut({ db: session.ctx.db, engine: session.engine })
          setSignOutStep(
            check.status === 'clear'
              ? { step: 'deleting' }
              : { step: 'confirm', entries: check.entries },
          )
        } catch (error) {
          console.error('sync before sign-out failed', error)
          setSignOutStep({ step: 'failed' })
        }
      },
      confirm: () => setSignOutStep({ step: 'deleting' }),
      cancel: () => setSignOutStep({ step: 'idle' }),
      unsentFile: () => {
        if (signOutStep.step !== 'confirm') return null
        const now = new Date()
        return {
          // The local calendar day, like every other date in the app.
          name: unsentExportFileName(lightFormat(now, 'yyyy-MM-dd')),
          contents: JSON.stringify(unsentExport(signOutStep.entries, now), null, 2),
        }
      },
    }
  }, [session, signOutStep])

  const value = useMemo(
    () =>
      session && signOutControls ? { ...session, userId, status, signOut: signOutControls } : null,
    [session, userId, status, signOutControls],
  )
  // After a failed sign-out, the deleted database stays hidden until the new one is open.
  if (!value || value.generation !== generation || signOutStep.step === 'deleting') {
    return loading
  }
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export const useSyncStatus = (): SyncStatus => useData().status

export const useSignOut = (): SignOutControls => useData().signOut

export type FailedChange = { seq: number; table: string; code: string; message: string }

export const useOutbox = (): { pending: number; failed: FailedChange[] } => {
  const { ctx } = useData()
  const entries = useLiveQuery(() => ctx.db.outbox.toArray(), [ctx.db], [])
  return useMemo(() => {
    const failed: FailedChange[] = entries.flatMap((entry) =>
      entry.failure && entry.seq !== undefined
        ? [{ seq: entry.seq, table: entry.table, ...entry.failure }]
        : [],
    )
    return { pending: entries.length - failed.length, failed }
  }, [entries])
}

export const useUnits = (): Units => {
  const { ctx, userId } = useData()
  const profile = useLiveQuery(() => readProfile(ctx.db, userId), [ctx.db, userId], null)
  return profile?.units === 'imperial' ? 'imperial' : 'metric'
}

export const useSetUnits = (): ((units: Units) => Promise<SetUnitsResult>) => {
  const { ctx, userId, engine } = useData()
  return useCallback(
    async (units) => {
      const result = await setUnits(ctx, userId, units)
      if (result.ok) engine.request('write')
      return result
    },
    [ctx, userId, engine],
  )
}

export const useDiscard = (): ((seq: number) => Promise<DiscardOutcome>) => {
  const { ctx } = useData()
  return useCallback((seq) => discardFailed(ctx, seq), [ctx])
}
