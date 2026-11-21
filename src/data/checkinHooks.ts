import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback } from 'react'

import type { CheckinFields } from '@/domain/checkin'
import type { Nutrients } from '@/domain/nutrition'

import { type CheckinState, checkinState, latestCheckin, saveCheckin } from './checkins'
import { useData } from './DataProvider'

// Whether a check-in is due, and the one to save. Undefined while loading. Recomputed as the
// log, weigh-ins, or profile change.
export const useCheckinState = (today: string): CheckinState | undefined => {
  const { ctx, userId } = useData()
  return useLiveQuery(() => checkinState(ctx.db, userId, today), [ctx.db, userId, today])
}

// A save asks sync to run a few seconds later, as other writes do.
export const useSaveCheckin = (): ((fields: CheckinFields) => Promise<void>) => {
  const { ctx, userId, engine } = useData()
  return useCallback(
    async (fields) => {
      await saveCheckin(ctx.db, ctx.clock, userId, fields)
      engine.request('write')
    },
    [ctx, userId, engine],
  )
}

// The latest check-in's daily targets; null before the first check-in, undefined while
// loading.
export const useTargets = (): Nutrients | null | undefined => {
  const { ctx } = useData()
  return useLiveQuery(async () => {
    const latest = await latestCheckin(ctx.db)
    return latest ? { kcal: latest.kcalTarget, proteinG: latest.proteinTargetG } : null
  }, [ctx.db])
}
