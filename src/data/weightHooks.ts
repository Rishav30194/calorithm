import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'

import type { WeighIn } from '@/domain/trend'
import type { WeightUnit } from '@/domain/weight'

import { useData } from './DataProvider'
import { readProfile } from './profile'
import { removeWeighIn, type SetWeighInResult, setWeighIn, weighIns } from './weights'

// Every visible weigh-in, oldest first. Undefined while loading.
export const useWeighIns = (): WeighIn[] | undefined => {
  const { ctx } = useData()
  return useLiveQuery(() => weighIns(ctx.db), [ctx.db])
}

// The profile's weight unit, or undefined while the profile loads, so a screen never reads a
// typed weight in the default unit before the user's own unit is known.
export const useWeightUnit = (): WeightUnit | undefined => {
  const { ctx, userId } = useData()
  return useLiveQuery(
    async () => ((await readProfile(ctx.db, userId))?.units === 'imperial' ? 'lb' : 'kg'),
    [ctx.db, userId],
  )
}

export type WeightActions = {
  set: (weighIn: WeighIn) => Promise<SetWeighInResult>
  remove: (date: string) => Promise<void>
}

// Every write asks sync to run a few seconds later, as other writes do.
export const useWeightActions = (): WeightActions => {
  const { ctx, engine, userId } = useData()
  return useMemo(() => {
    const synced = async <T>(write: Promise<T>): Promise<T> => {
      const result = await write
      engine.request('write')
      return result
    }
    return {
      set: (weighIn) => synced(setWeighIn(ctx.db, ctx.clock, userId, weighIn)),
      remove: (date) => synced(removeWeighIn(ctx.db, ctx.clock, userId, date)),
    }
  }, [ctx, engine, userId])
}
