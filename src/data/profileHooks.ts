import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useState } from 'react'

import type { ProfileSettings } from '@/domain/profile'
import type { WeightUnit } from '@/domain/weight'

import { useData } from './DataProvider'
import {
  loadProfile,
  profileSettings,
  readProfile,
  type SaveProfileResult,
  saveProfileSettings,
} from './profile'
import type { ProfileRow } from './tables'

export type ProfileView = { settings: ProfileSettings; unit: WeightUnit }

export type ProfileViewState =
  | { kind: 'loading' }
  | { kind: 'unavailable'; reason: 'offline' | 'signed_out'; retry: () => void }
  | { kind: 'ready'; view: ProfileView }

// The editable settings and the weight unit they're shown in. A device without the profile
// fetches the server's copy first, so the form never starts from defaults that would
// overwrite it.
export const useProfileView = (): ProfileViewState => {
  const { ctx, userId } = useData()
  const [attempt, setAttempt] = useState(0)
  const [load, setLoad] = useState<Awaited<ReturnType<typeof loadProfile>> | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the retry trigger
  useEffect(() => {
    let current = true
    setLoad(null)
    void loadProfile(ctx, userId).then(
      (result) => {
        if (current) setLoad(result)
      },
      () => {
        if (current) setLoad({ ok: false, reason: 'offline' })
      },
    )
    return () => {
      current = false
    }
  }, [ctx, userId, attempt])
  const row = useLiveQuery(() => readProfile(ctx.db, userId), [ctx.db, userId])

  if (row === undefined) return { kind: 'loading' }
  // A local profile is always safe to show, including one a sync pulled meanwhile. Without
  // one, the loaded row covers the moment before the live query sees what loadProfile stored.
  let shown: ProfileRow | null = row
  if (shown === null) {
    if (load === null) return { kind: 'loading' }
    if (!load.ok) {
      return { kind: 'unavailable', reason: load.reason, retry: () => setAttempt((n) => n + 1) }
    }
    shown = load.row
  }
  return {
    kind: 'ready',
    view: { settings: profileSettings(shown), unit: shown?.units === 'imperial' ? 'lb' : 'kg' },
  }
}

// A save asks sync to run a few seconds later, as other writes do.
export const useSaveProfile = (): ((
  changes: Partial<ProfileSettings>,
  today: string,
) => Promise<SaveProfileResult>) => {
  const { ctx, userId, engine } = useData()
  return useCallback(
    async (changes, today) => {
      const result = await saveProfileSettings(ctx, userId, changes, today)
      if (result.ok) engine.request('write')
      return result
    },
    [ctx, userId, engine],
  )
}
