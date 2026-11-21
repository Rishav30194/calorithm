import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'

import type { WeighIn } from '@/domain/trend'

import { useData } from './DataProvider'
import { removeWeighIn, type SetWeighInResult, setWeighIn, weighIns } from './weights'

// Every visible weigh-in, oldest first. Undefined while loading.
export const useWeighIns = (): WeighIn[] | undefined => {
  const { ctx } = useData()
  return useLiveQuery(() => weighIns(ctx.db), [ctx.db])
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
