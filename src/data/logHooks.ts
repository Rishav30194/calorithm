import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'

import {
  type Meal,
  type Nutrients,
  type Source,
  sumNutrients,
  totalsByMeal,
} from '@/domain/nutrition'

import { useData } from './DataProvider'
import {
  changeServings,
  copyMealTo,
  dayComplete,
  entriesOn,
  type LoggedEntry,
  logSource,
  type QuickPicks,
  quickPicks,
  removeEntry,
  setDayComplete,
} from './log'

export type DayView = {
  byMeal: Record<Meal, LoggedEntry[]>
  mealTotals: Record<Meal, Nutrients>
  total: Nutrients
  complete: boolean
}

// Undefined while loading.
export const useDay = (date: string): DayView | undefined => {
  const { ctx, userId } = useData()
  return useLiveQuery(async () => {
    const entries = await entriesOn(ctx.db, date)
    const inMeal = (meal: Meal) => entries.filter((entry) => entry.meal === meal)
    const byMeal: Record<Meal, LoggedEntry[]> = {
      breakfast: inMeal('breakfast'),
      lunch: inMeal('lunch'),
      dinner: inMeal('dinner'),
      snacks: inMeal('snacks'),
    }
    return {
      byMeal,
      mealTotals: totalsByMeal(entries),
      total: sumNutrients(entries),
      complete: await dayComplete(ctx.db, userId, date),
    }
  }, [ctx.db, userId, date])
}

export const useQuickPicks = (today: string): QuickPicks | undefined => {
  const { ctx } = useData()
  return useLiveQuery(() => quickPicks(ctx.db, today), [ctx.db, today])
}

// How many entries a meal holds, for the copy dialog's preview.
export const useMealCount = (date: string, meal: Meal): number | undefined => {
  const { ctx } = useData()
  return useLiveQuery(
    async () => (await entriesOn(ctx.db, date)).filter((entry) => entry.meal === meal).length,
    [ctx.db, date, meal],
  )
}

type Slot = { date: string; meal: Meal }

export type LogActions = {
  log: (slot: Slot, source: Source, servings: number) => Promise<boolean>
  changeServings: (id: string, servings: number) => Promise<void>
  remove: (id: string) => Promise<void>
  copyMeal: (from: Slot, to: Slot) => Promise<number>
  setComplete: (date: string, complete: boolean) => Promise<void>
}

// Every write asks sync to run a few seconds later, as other writes do.
export const useLogActions = (): LogActions => {
  const { ctx, engine, userId } = useData()
  return useMemo(() => {
    const synced = async <T>(write: Promise<T>): Promise<T> => {
      const result = await write
      engine.request('write')
      return result
    }
    return {
      log: async (slot, source, servings) =>
        (await synced(logSource(ctx.db, ctx.clock, userId, { ...slot, source, servings }))).ok,
      changeServings: (id, servings) => synced(changeServings(ctx.db, ctx.clock, id, servings)),
      remove: (id) => synced(removeEntry(ctx.db, ctx.clock, id)),
      copyMeal: async (from, to) =>
        (await synced(copyMealTo(ctx.db, ctx.clock, userId, { from, to }))).length,
      setComplete: (date, complete) =>
        synced(setDayComplete(ctx.db, ctx.clock, userId, date, complete)),
    }
  }, [ctx, engine, userId])
}
