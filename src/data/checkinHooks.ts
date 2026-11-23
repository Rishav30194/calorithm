import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback } from 'react'

import { type CalorieDays, dayTargets, type WeekPlan } from '@/domain/calorieDays'
import type { CheckinFields } from '@/domain/checkin'
import type { DailyTargets } from '@/domain/nutrition'

import { type CheckinState, checkinState, saveCheckin, weekPlan } from './checkins'
import { useData } from './DataProvider'
import { profileSettings, readProfile } from './profile'

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

// What each day's targets are worked out from; null before the first check-in, undefined
// while loading. Recomputed as check-ins or the profile change.
export const useWeekPlan = (): WeekPlan | null | undefined => {
  const { ctx, userId } = useData()
  return useLiveQuery(() => weekPlan(ctx.db, userId), [ctx.db, userId])
}

// The profile's higher-calorie days, none when not set; undefined while loading.
export const useCalorieDays = (): CalorieDays | undefined => {
  const { ctx, userId } = useData()
  return useLiveQuery(
    async () =>
      profileSettings(await readProfile(ctx.db, userId)).calorieDays ?? { days: 0, extraKcal: 0 },
    [ctx.db, userId],
  )
}

// A day's targets: the latest check-in's, with that weekday's kcal (decision 0033); null
// before the first check-in, undefined while loading.
export const useTargets = (date: string): DailyTargets | null | undefined => {
  const plan = useWeekPlan()
  return plan ? dayTargets(plan, date) : plan
}
