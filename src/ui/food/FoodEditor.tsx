import { useState } from 'react'

import type { FoodInput, FoodView } from '@/data/foods'
import { OPEN_FOOD_FACTS_SOURCE } from '@/data/openFoodFacts/lookup'
import { strings } from '@/strings'

import { OpenFoodFactsCredit } from '../OpenFoodFactsCredit'
import { emptyFoodValues, FoodForm, foodValues } from './FoodForm'

type Props = {
  food: FoodView | null
  locale: string
  backHref: string
  onSave: (input: FoodInput) => Promise<boolean>
  onSetArchived: (archived: boolean) => Promise<void>
}

export const FoodEditor = ({ food, locale, backHref, onSave, onSetArchived }: Props) => {
  const text = strings.foods.editor
  const [archiving, setArchiving] = useState(false)
  const [archiveFailed, setArchiveFailed] = useState(false)

  const toggleArchived = async (archived: boolean) => {
    setArchiving(true)
    setArchiveFailed(false)
    try {
      await onSetArchived(archived)
    } catch {
      setArchiveFailed(true)
    } finally {
      setArchiving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <a href={backHref} className="inline-flex min-h-11 items-center self-start text-accent">
        {text.back}
      </a>
      <h2 className="text-xl font-semibold">{food ? text.editTitle : text.newTitle}</h2>
      {food?.archived && <p className="text-muted">{text.archivedNote}</p>}
      <FoodForm
        initial={food ? foodValues(food, locale) : emptyFoodValues}
        savedBarcode={food?.barcode ?? null}
        note={
          food?.catalogId === OPEN_FOOD_FACTS_SOURCE ? (
            <div>
              <p className="text-sm text-muted">{text.fromOpenFoodFacts}</p>
              <OpenFoodFactsCredit />
            </div>
          ) : (
            food?.catalogId && <p className="text-sm text-muted">{text.fromBuiltIn}</p>
          )
        }
        onSave={onSave}
      />
      {food && (
        <>
          {archiveFailed && (
            <p role="alert" className="text-danger">
              {text.archiveFailed}
            </p>
          )}
          <button
            type="button"
            disabled={archiving}
            onClick={() => void toggleArchived(!food.archived)}
            className="min-h-11 self-start rounded-lg border border-border px-4 font-medium disabled:opacity-60"
          >
            {food.archived ? text.restore : text.archive}
          </button>
        </>
      )}
    </div>
  )
}
