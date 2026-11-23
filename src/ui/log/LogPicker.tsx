import { useState } from 'react'
import type { BarcodeLookup } from '@/data/barcodeLookup'
import type { CatalogFood } from '@/data/catalog/search'
import { searchCatalog } from '@/data/catalog/search'
import type { CatalogCopy, FoodInput, FoodView, RecipeView } from '@/data/foods'
import type { QuickPicks } from '@/data/log'
import type { CatalogState } from '@/data/logHooks'
import { formatAmount } from '@/domain/format'
import { entryFits } from '@/domain/limits'
import {
  type Meal,
  type Nutrients,
  type QuickPick,
  type Source,
  sourceKey,
} from '@/domain/nutrition'
import { isMeasuredByWeight, type Portion, weightPerServing } from '@/domain/portion'
import { strings } from '@/strings'
import { Modal } from '../Modal'
import { macroText } from '../macros'
import { TextField } from '../TextField'
import { AmountFields } from './AmountFields'
import { BarcodePanel } from './BarcodePanel'
import { LabelPanel } from './LabelPanel'

type Props = {
  meal: Meal
  picks: QuickPicks | undefined
  foods: FoodView[] | undefined
  recipes: RecipeView[] | undefined
  // The built-in food list (decision 0027); undefined until the first search asks for it.
  builtIn: CatalogState | undefined
  locale: string
  onPick: (source: Source, servings: number) => Promise<boolean>
  onPickBuiltIn: (item: CatalogFood, servings: number) => Promise<boolean>
  onSearch: () => void
  onRetryBuiltIn: () => void
  onLookup: (code: string) => Promise<BarcodeLookup>
  onLogScanned: (foodId: string) => Promise<boolean>
  onLogNew: (input: FoodInput | CatalogCopy) => Promise<boolean>
  onClose: () => void
}

type Row = {
  key: string
  // A built-in item has no source until it's copied into your foods.
  pick: { source: Source; servings: number } | { builtIn: CatalogFood }
  name: string
  detail: string
  // A food measured by weight opens the amount step instead of logging at once (phase 14).
  weighed: Weighed | null
}

type Weighed = { portion: Portion; perServing: Nutrients }

const weighedOf = (servingSize: number, servingUnit: string, perServing: Nutrients) => {
  if (!isMeasuredByWeight(servingUnit)) return null
  const portion = weightPerServing(servingSize, servingUnit)
  return portion ? { portion, perServing } : null
}

const servingsOf = (row: Row): number => ('builtIn' in row.pick ? 1 : row.pick.servings)

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
// taps from the log screen. A food measured by weight takes a third, to set the amount
// (decision 0031).
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
  onRetryBuiltIn,
  onLookup,
  onLogScanned,
  onLogNew,
  onClose,
}: Props) => {
  const text = strings.log.picker
  const [panel, setPanel] = useState<'scan' | 'enter' | 'label' | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  // The weighed food whose amount is being set, and the servings typed for it.
  const [amountFor, setAmountFor] = useState<(Row & { weighed: Weighed }) | null>(null)
  const [servings, setServings] = useState<number | null>(null)
  const [amountError, setAmountError] = useState<string | undefined>(undefined)

  const foodById = new Map((foods ?? []).map((food) => [food.id, food]))
  const weighedFood = (source: Source): Weighed | null => {
    const food = source.kind === 'food' ? foodById.get(source.id) : undefined
    return food ? weighedOf(food.servingSize, food.servingUnit, food) : null
  }

  const servingsText = (servings: number) =>
    strings.log.servings(formatAmount(servings, locale), servings === 1)

  const quick = (prefix: string, list: QuickPick[] | undefined): Row[] =>
    (list ?? []).map((pick) => ({
      key: `${prefix}:${pick.source.kind}:${pick.source.id}`,
      pick: { source: pick.source, servings: pick.servings },
      name: pick.name,
      detail: servingsText(pick.servings),
      weighed: weighedFood(pick.source),
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
        weighed: weighedOf(food.servingSize, food.servingUnit, food),
      })),
    ...(recipes ?? [])
      .filter((recipe) => !recipe.archived)
      .map((recipe) => ({
        key: `all:recipe:${recipe.id}`,
        source: { kind: 'recipe' as const, id: recipe.id },
        pick: { source: { kind: 'recipe' as const, id: recipe.id }, servings: 1 },
        name: recipe.name,
        detail: text.recipeDetail(macroText(recipe.perServing, locale)),
        weighed: null,
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
        weighed: weighedOf(item.servingSize, item.servingUnit, item),
      }))
    : []

  const search = (value: string) => {
    setQuery(value)
    if (value.trim() !== '') onSearch()
  }

  const log = async (row: Row, amount: number) => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const ok = await ('builtIn' in row.pick
      ? onPickBuiltIn(row.pick.builtIn, amount)
      : onPick(row.pick.source, amount)
    ).catch(() => false)
    setBusy(false)
    if (ok) onClose()
    else setFailed(true)
  }

  const pick = (row: Row) => {
    if (!row.weighed) {
      void log(row, servingsOf(row))
      return
    }
    setAmountFor({ ...row, weighed: row.weighed })
    setServings(servingsOf(row))
    setAmountError(undefined)
    setFailed(false)
  }

  const logAmount = () => {
    if (!amountFor) return
    if (servings === null) {
      setAmountError(strings.log.amount.error)
      return
    }
    if (!entryFits(amountFor.weighed.perServing, servings)) {
      setAmountError(strings.log.amount.tooLarge)
      return
    }
    void log(amountFor, servings)
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
      {amountFor ? (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            logAmount()
          }}
          className="flex flex-col gap-3"
        >
          <button
            type="button"
            onClick={() => {
              setAmountFor(null)
              setFailed(false)
              setAmountError(undefined)
            }}
            className="inline-flex min-h-11 items-center self-start text-accent"
          >
            {strings.log.label.back}
          </button>
          <h3 className="font-semibold">{amountFor.name}</h3>
          {failed && (
            <p role="alert" className="text-danger">
              {text.failed}
            </p>
          )}
          <AmountFields
            portion={amountFor.weighed.portion}
            perServing={amountFor.weighed.perServing}
            initialServings={servingsOf(amountFor)}
            locale={locale}
            error={amountError}
            onChange={(value) => {
              setServings(value)
              if (value !== null) setAmountError(undefined)
            }}
          />
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-text disabled:opacity-60"
          >
            {strings.log.amount.log}
          </button>
        </form>
      ) : panel === 'label' ? (
        <LabelPanel
          barcode={null}
          locale={locale}
          onLogNew={onLogNew}
          onBack={() => setPanel(null)}
          onDone={onClose}
        />
      ) : panel !== null ? (
        <BarcodePanel
          start={panel}
          locale={locale}
          onLookup={onLookup}
          onLogSaved={onLogScanned}
          onLogNew={onLogNew}
          onBack={() => setPanel(null)}
          onDone={onClose}
        />
      ) : (
        <>
          {failed && (
            <p role="alert" className="text-danger">
              {text.failed}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPanel('scan')}
              className="min-h-11 rounded-lg border border-border px-3 font-medium"
            >
              {text.scan}
            </button>
            <button
              type="button"
              onClick={() => setPanel('enter')}
              className="min-h-11 rounded-lg border border-border px-3 font-medium"
            >
              {text.enter}
            </button>
            <button
              type="button"
              onClick={() => setPanel('label')}
              className="col-span-2 min-h-11 rounded-lg border border-border px-3 font-medium"
            >
              {text.label}
            </button>
          </div>
          {loading ? (
            <p className="text-muted">{strings.loading}</p>
          ) : (
            <>
              {nothingSaved && <p className="text-muted">{text.empty}</p>}
              {needle === '' && (
                <>
                  <PickList
                    title={text.recent}
                    rows={quick('recent', picks?.recent)}
                    onPick={pick}
                  />
                  <PickList
                    title={text.mostUsed}
                    rows={quick('most', picks?.mostUsed)}
                    onPick={pick}
                  />
                </>
              )}
              <TextField label={text.search} value={query} onChange={search} type="search" />
              {saved.length > 0 && <PickList title={text.all} rows={saved} onPick={pick} />}
              {needle !== '' && (
                <section aria-label={text.builtIn} className="flex flex-col gap-1">
                  {builtIn === 'loading' && <p className="text-muted">{text.builtInLoading}</p>}
                  {builtIn === 'failed' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-muted">{text.builtInFailed}</p>
                      <button
                        type="button"
                        onClick={onRetryBuiltIn}
                        className="min-h-11 rounded-lg border border-border px-3 font-medium"
                      >
                        {text.builtInRetry}
                      </button>
                    </div>
                  )}
                  <PickList title={text.builtIn} rows={builtInRows} onPick={pick} />
                  {builtInRows.length > 0 && (
                    <p className="text-xs text-muted">{text.builtInSource}</p>
                  )}
                </section>
              )}
              {needle !== '' &&
                saved.length === 0 &&
                builtInRows.length === 0 &&
                // Only once the list has loaded: not while loading, nor beside its error.
                Array.isArray(builtIn) && <p className="text-muted">{text.noMatch}</p>}
            </>
          )}
        </>
      )}
    </Modal>
  )
}
