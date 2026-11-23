import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'

import {
  type Meal,
  type Nutrients,
  type Source,
  sumNutrients,
  totalsByMeal,
} from '@/domain/nutrition'

import { type BarcodeLookup, lookupBarcode } from './barcodeLookup'
import { type CatalogFood, loadCatalog } from './catalog/search'
import { useData } from './DataProvider'
import type { CatalogCopy, FoodInput } from './foods'
import {
  changeServings,
  copyMealTo,
  dayComplete,
  entriesOn,
  type LoggedEntry,
  logCatalogFood,
  logNewFood,
  logPlate,
  logScannedFood,
  logSource,
  type PlateItem,
  type QuickPicks,
  quickPicks,
  removeEntry,
  setDayComplete,
} from './log'
import { lookupProduct } from './openFoodFacts/lookup'

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

// How logging a plate ended, for the picker's message (phase 15): which item stopped it, by
// its place on the plate, or a failure to write.
export type PlateOutcome =
  | { kind: 'logged' }
  | { kind: 'too_large' | 'not_found'; index: number }
  | { kind: 'failed' }

export type LogActions = {
  logPlate: (slot: Slot, items: PlateItem[]) => Promise<PlateOutcome>
  log: (slot: Slot, source: Source, servings: number) => Promise<boolean>
  logCatalog: (slot: Slot, item: CatalogFood, servings?: number) => Promise<boolean>
  // A barcode scan's results: a saved food, or a new one saved from the form.
  logScanned: (slot: Slot, foodId: string) => Promise<boolean>
  logNew: (slot: Slot, input: FoodInput | CatalogCopy) => Promise<boolean>
  changeServings: (id: string, servings: number) => Promise<boolean>
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
      logPlate: async (slot, items) => {
        const result = await synced(logPlate(ctx.db, ctx.clock, userId, slot, items))
        return result.ok ? { kind: 'logged' } : { kind: result.reason, index: result.index }
      },
      log: async (slot, source, servings) =>
        (await synced(logSource(ctx.db, ctx.clock, userId, { ...slot, source, servings }))).ok,
      logCatalog: async (slot, item, servings) => {
        await synced(logCatalogFood(ctx.db, ctx.clock, userId, slot, item, servings))
        return true
      },
      logScanned: async (slot, foodId) =>
        (await synced(logScannedFood(ctx.db, ctx.clock, userId, slot, foodId))).ok,
      logNew: async (slot, input) => {
        await synced(logNewFood(ctx.db, ctx.clock, userId, slot, input))
        return true
      },
      changeServings: async (id, servings) =>
        (await synced(changeServings(ctx.db, ctx.clock, id, servings))).ok,
      remove: (id) => synced(removeEntry(ctx.db, ctx.clock, id)),
      copyMeal: async (from, to) =>
        (await synced(copyMealTo(ctx.db, ctx.clock, userId, { from, to }))).length,
      setComplete: (date, complete) =>
        synced(setDayComplete(ctx.db, ctx.clock, userId, date, complete)),
    }
  }, [ctx, engine, userId])
}

export type CatalogState = CatalogFood[] | 'loading' | 'failed'

// The built-in food list, loaded once it's wanted (the first search), then kept. After a
// failure, retry() loads it again. Whether a browser retries a failed dynamic import without
// a reload is unverified.
export const useCatalog = (
  wanted: boolean,
): { state: CatalogState | undefined; retry: () => void } => {
  const [state, setState] = useState<CatalogState | undefined>(undefined)
  useEffect(() => {
    if (!wanted || state !== undefined) return
    setState('loading')
    loadCatalog().then(setState, () => setState('failed'))
  }, [wanted, state])
  return { state, retry: () => setState(undefined) }
}

// Looks a scanned or typed code up in your foods, then in Open Food Facts.
export const useBarcodeLookup = (): ((code: string) => Promise<BarcodeLookup>) => {
  const { ctx } = useData()
  return useMemo(
    () => (code: string) => lookupBarcode(ctx.db, code, (barcode) => lookupProduct(barcode)),
    [ctx.db],
  )
}
