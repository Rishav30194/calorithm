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

import { refreshSession } from './auth'
import { dbNameFor, LocalDb } from './db'
import type { Env } from './env'
import { readProfile, setUnits, type Units } from './profile'
import { getClient } from './supabase'
import { type DiscardOutcome, discardFailed } from './sync/discard'
import { createEngine, type Engine, type SyncStatus } from './sync/engine'
import type { SyncContext } from './sync/push'
import { createSupabaseRemote, fetchMinAppVersion } from './sync/supabaseRemote'
import { syncedTables } from './tables'

type DataContextValue = {
  userId: string
  ctx: SyncContext
  status: SyncStatus
  engine: () => Engine | null
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
  children,
}: {
  env: Env
  userId: string
  children: ReactNode
}) => {
  const [status, setStatus] = useState<SyncStatus>({
    state: 'idle',
    lastSyncedAt: null,
    problem: null,
  })
  const engineRef = useRef<Engine | null>(null)
  const client = getClient(env)
  const db = useMemo(() => new LocalDb(dbNameFor(userId)), [userId])
  const ctx = useMemo<SyncContext>(
    () => ({
      db,
      remote: createSupabaseRemote(client),
      tables: syncedTables,
      clock: () => new Date(),
      random: Math.random,
    }),
    [db, client],
  )

  useEffect(() => {
    const engine = createEngine({
      ctx,
      appVersion: __APP_VERSION__,
      minAppVersion: () => fetchMinAppVersion(client),
      refreshSession: () => refreshSession(client),
      onStatus: setStatus,
    })
    engineRef.current = engine
    const online = () => engine.request('online')
    const visible = () => {
      if (document.visibilityState === 'visible') engine.request('visible')
    }
    window.addEventListener('online', online)
    document.addEventListener('visibilitychange', visible)
    engine.request('start')
    return () => {
      window.removeEventListener('online', online)
      document.removeEventListener('visibilitychange', visible)
      engine.stop()
      engineRef.current = null
    }
  }, [ctx, client])

  useEffect(() => () => db.close(), [db])

  const value = useMemo(
    () => ({ userId, ctx, status, engine: () => engineRef.current }),
    [userId, ctx, status],
  )
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

export const useSetUnits = (): ((units: Units) => Promise<void>) => {
  const { ctx, userId, engine } = useData()
  return useCallback(
    async (units) => {
      await setUnits(ctx.db, userId, units, ctx.clock)
      engine()?.request('write')
    },
    [ctx, userId, engine],
  )
}

export const useDiscard = (): ((seq: number) => Promise<DiscardOutcome>) => {
  const { ctx } = useData()
  return useCallback((seq) => discardFailed(ctx, seq), [ctx])
}
