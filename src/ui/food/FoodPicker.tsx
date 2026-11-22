import { useEffect, useId, useRef, useState } from 'react'

import type { CatalogFood } from '@/data/catalog/search'
import type { FoodView } from '@/data/foods'
import type { CatalogState } from '@/data/logHooks'
import { strings } from '@/strings'

import { TextField } from '../TextField'
import { BuiltInMatches } from './BuiltInMatches'

type Props = {
  foods: FoodView[]
  detailOf: (food: FoodView) => string
  onPick: (food: FoodView) => void
  // The built-in food list (phase 14): picking an item copies it into your foods, then adds it.
  builtIn: {
    state: CatalogState | undefined
    copied: ReadonlySet<string>
    locale: string
    onSearch: () => void
    onRetry: () => void
    onPick: (item: CatalogFood) => Promise<boolean>
  }
  onClose: () => void
}

// A modal <dialog> keeps focus inside it and closes on Escape.
export const FoodPicker = ({ foods, detailOf, onPick, builtIn, onClose }: Props) => {
  const text = strings.recipes.picker
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    dialog.showModal()
    return () => dialog.close()
  }, [])

  const shown = foods.filter((food) =>
    food.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )

  const search = (value: string) => {
    setQuery(value)
    if (value.trim() !== '') builtIn.onSearch()
  }

  const pickBuiltIn = async (item: CatalogFood) => {
    setBusy(true)
    setFailed(false)
    const ok = await builtIn.onPick(item).catch(() => false)
    setBusy(false)
    if (!ok) setFailed(true)
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      className="m-auto flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-bg p-4 text-text backdrop:bg-bg/80"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={titleId} className="text-lg font-semibold">
          {text.title}
        </h2>
        <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-3 font-medium">
          {text.close}
        </button>
      </div>
      {failed && (
        <p role="alert" className="text-danger">
          {strings.foods.addBuiltInFailed}
        </p>
      )}
      <TextField label={text.search} value={query} onChange={search} type="search" autoFocus />
      {foods.length === 0 && query.trim() === '' && <p className="text-muted">{text.empty}</p>}
      {shown.length > 0 && (
        <ul className="flex flex-col divide-y divide-border">
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
      <BuiltInMatches
        state={builtIn.state}
        query={query}
        copied={builtIn.copied}
        locale={builtIn.locale}
        ownMatches={shown.length}
        noMatch={text.noMatch}
        busy={busy}
        onRetry={builtIn.onRetry}
        onPick={(item) => void pickBuiltIn(item)}
      />
    </dialog>
  )
}
