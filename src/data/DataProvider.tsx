import { useLiveQuery } from 'dexie-react-hooks'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { refreshSession } from './auth'
import { dbNameFor, LocalDb } from './db'
import type { Env } from './env'
import { readProfile, type SetUnitsResult, setUnits, type Units } from './profile'
import { getClient } from './supabase'
import { type DiscardOutcome, discardFailed } from './sync/discard'
import { createEngine, type Engine, type SyncStatus } from './sync/engine'
import type { SyncContext } from './sync/push'
import { createSupabaseRemote, fetchMinAppVersion } from './sync/supabaseRemote'
import { syncedTables } from './tables'

type Session = { ctx: SyncContext; engine: Engine }

type DataContextValue = Session & { userId: string; status: SyncStatus }

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
  const client = getClient(env)

  // The database and engine are made and closed in one effect, so each run of the effect
  // (React runs it twice in development) cleans up exactly what it opened.
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
    setSession({ ctx, engine })
    engine.request('start')

    return () => {
      window.removeEventListener('online', online)
      document.removeEventListener('visibilitychange', visible)
      engine.stop()
      setSession(null)
      // A sync already running finishes before its database closes.
      void engine.whenIdle().then(() => db.close())
    }
  }, [userId, client])

  const value = useMemo(
    () => (session ? { ...session, userId, status } : null),
    [session, userId, status],
  )
  if (!value) return loading
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export const useSyncStatus = (): SyncStatus => useData().status

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
