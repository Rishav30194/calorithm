import { useState } from 'react'
import type { CatalogFood } from '@/data/catalog/search'
import { searchCatalog } from '@/data/catalog/search'
import type { FoodView, RecipeView } from '@/data/foods'
import type { QuickPicks } from '@/data/log'
import type { CatalogState } from '@/data/logHooks'
import { formatAmount } from '@/domain/format'
import { type Meal, type QuickPick, type Source, sourceKey } from '@/domain/nutrition'
import { strings } from '@/strings'
import { Modal } from '../Modal'
import { macroText } from '../macros'
import { TextField } from '../TextField'

type Props = {
  meal: Meal
  picks: QuickPicks | undefined
  foods: FoodView[] | undefined
  recipes: RecipeView[] | undefined
  // The built-in food list (decision 0027); undefined until the first search asks for it.
  builtIn: CatalogState | undefined
  locale: string
  onPick: (source: Source, servings: number) => Promise<boolean>
  onPickBuiltIn: (item: CatalogFood) => Promise<boolean>
  onSearch: () => void
  onClose: () => void
}

type Row = {
  key: string
  // A built-in item has no source until it's copied into your foods.
  pick: { source: Source; servings: number } | { builtIn: CatalogFood }
  name: string
  detail: string
}

const PickList = ({
  title,
  rows,
  onPick,
}: {
  title: string
  rows: Row[]
  onPick: (row: Row) => void
}) =>
  rows.length === 0 ? null : (
    <section className="flex flex-col">
      <h3 className="text-sm font-semibold text-muted">{title}</h3>
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              onClick={() => onPick(row)}
              className="flex min-h-14 w-full flex-col items-start justify-center py-2 text-left"
            >
              <span className="font-medium">{row.name}</span>
              <span className="text-sm text-muted">{row.detail}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )

// Opened from a meal's Add button: one more tap on any row logs it, so a saved food takes two
// taps from the log screen.
export const LogPicker = ({
  meal,
  picks,
  foods,
  recipes,
  builtIn,
  locale,
  onPick,
  onPickBuiltIn,
  onSearch,
  onClose,
}: Props) => {
  const text = strings.log.picker
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const servingsText = (servings: number) =>
    strings.log.servings(formatAmount(servings, locale), servings === 1)

  const quick = (prefix: string, list: QuickPick[] | undefined): Row[] =>
    (list ?? []).map((pick) => ({
      key: `${prefix}:${pick.source.kind}:${pick.source.id}`,
      pick: { source: pick.source, servings: pick.servings },
      name: pick.name,
      detail: servingsText(pick.servings),
    }))

  const scoreOf = (source: Source) => picks?.scores.get(sourceKey(source)) ?? 0
  const needle = query.trim().toLocaleLowerCase()
  const saved: (Row & { source: Source })[] = [
    ...(foods ?? [])
      .filter((food) => !food.archived)
      .map((food) => ({
        key: `all:food:${food.id}`,
        source: { kind: 'food' as const, id: food.id },
        pick: { source: { kind: 'food' as const, id: food.id }, servings: 1 },
        name: food.name,
        detail: strings.foods.detail(
          strings.foods.serving(formatAmount(food.servingSize, locale), food.servingUnit),
          macroText(food, locale),
        ),
      })),
    ...(recipes ?? [])
      .filter((recipe) => !recipe.archived)
      .map((recipe) => ({
        key: `all:recipe:${recipe.id}`,
        source: { kind: 'recipe' as const, id: recipe.id },
        pick: { source: { kind: 'recipe' as const, id: recipe.id }, servings: 1 },
        name: recipe.name,
        detail: text.recipeDetail(macroText(recipe.perServing, locale)),
      })),
  ]
    .filter((row) => row.name.toLocaleLowerCase().includes(needle))
    // What you eat most comes first, then by name.
    .sort(
      (a, b) =>
        scoreOf(b.source) - scoreOf(a.source) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    )

  // Built-in items you've already copied show as your own food instead.
  const copied = new Set(
    (foods ?? []).flatMap((food) => (!food.archived && food.catalogId ? [food.catalogId] : [])),
  )
  const builtInRows: Row[] = Array.isArray(builtIn)
    ? searchCatalog(builtIn, needle, copied).map((item) => ({
        key: `builtin:${item.id}`,
        pick: { builtIn: item },
        name: item.name,
        detail: strings.foods.detail(
          strings.foods.serving(formatAmount(item.servingSize, locale), item.servingUnit),
          macroText(item, locale),
        ),
      }))
    : []

  const search = (value: string) => {
    setQuery(value)
    if (value.trim() !== '') onSearch()
  }

  const pick = async (row: Row) => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const ok = await ('builtIn' in row.pick
      ? onPickBuiltIn(row.pick.builtIn)
      : onPick(row.pick.source, row.pick.servings)
    ).catch(() => false)
    setBusy(false)
    if (ok) onClose()
    else setFailed(true)
  }

  const loading = foods === undefined || recipes === undefined
  const nothingSaved = !loading && saved.length === 0 && needle === ''

  return (
    <Modal
      title={strings.log.addTo(strings.log.meals[meal])}
      onClose={onClose}
      action={
        <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-3 font-medium">
          {text.close}
        </button>
      }
    >
      {failed && (
        <p role="alert" className="text-danger">
          {text.failed}
        </p>
      )}
      {loading ? (
        <p className="text-muted">{strings.loading}</p>
      ) : (
        <>
          {nothingSaved && <p className="text-muted">{text.empty}</p>}
          {needle === '' && (
            <>
              <PickList title={text.recent} rows={quick('recent', picks?.recent)} onPick={pick} />
              <PickList title={text.mostUsed} rows={quick('most', picks?.mostUsed)} onPick={pick} />
            </>
          )}
          <TextField label={text.search} value={query} onChange={search} type="search" />
          {saved.length > 0 && <PickList title={text.all} rows={saved} onPick={pick} />}
          {needle !== '' && (
            <section aria-label={text.builtIn} className="flex flex-col gap-1">
              {builtIn === 'loading' && <p className="text-muted">{text.builtInLoading}</p>}
              {builtIn === 'failed' && <p className="text-muted">{text.builtInFailed}</p>}
              <PickList title={text.builtIn} rows={builtInRows} onPick={pick} />
              {builtInRows.length > 0 && <p className="text-xs text-muted">{text.builtInSource}</p>}
            </section>
          )}
          {needle !== '' &&
            saved.length === 0 &&
            builtInRows.length === 0 &&
            builtIn !== 'loading' && <p className="text-muted">{text.noMatch}</p>}
        </>
      )}
    </Modal>
  )
}
