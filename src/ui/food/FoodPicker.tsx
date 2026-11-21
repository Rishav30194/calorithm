import { useEffect, useId, useRef, useState } from 'react'

import type { FoodView } from '@/data/foods'
import { strings } from '@/strings'

import { TextField } from '../TextField'

type Props = {
  foods: FoodView[]
  detailOf: (food: FoodView) => string
  onPick: (food: FoodView) => void
  onClose: () => void
}

// A modal <dialog> keeps focus inside it and closes on Escape.
export const FoodPicker = ({ foods, detailOf, onPick, onClose }: Props) => {
  const text = strings.recipes.picker
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [query, setQuery] = useState('')

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    dialog.showModal()
    return () => dialog.close()
  }, [])

  const shown = foods.filter((food) =>
    food.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      className="m-auto flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm flex-col gap-3 rounded-xl border border-border bg-bg p-4 text-text backdrop:bg-bg/80"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={titleId} className="text-lg font-semibold">
          {text.title}
        </h2>
        <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-3 font-medium">
          {text.close}
        </button>
      </div>
      {foods.length === 0 ? (
        <p className="text-muted">{text.empty}</p>
      ) : (
        <>
          <TextField
            label={text.search}
            value={query}
            onChange={setQuery}
            type="search"
            autoFocus
          />
          {shown.length === 0 ? (
            <p className="text-muted">{text.noMatch}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border overflow-y-auto">
              {shown.map((food) => (
                <li key={food.id}>
                  <button
                    type="button"
                    onClick={() => onPick(food)}
                    className="flex min-h-14 w-full flex-col items-start justify-center py-2 text-left"
                  >
                    <span className="font-medium">{food.name}</span>
                    <span className="text-sm text-muted">{detailOf(food)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </dialog>
  )
}
