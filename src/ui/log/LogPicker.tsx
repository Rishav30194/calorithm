import { useRef, useState } from 'react'
import type { BarcodeLookup } from '@/data/barcodeLookup'
import type { CatalogFood } from '@/data/catalog/search'
import { searchCatalog } from '@/data/catalog/search'
import type { CatalogCopy, FoodInput, FoodView, RecipeView } from '@/data/foods'
import type { PlateItem, QuickAdd, QuickPicks } from '@/data/log'
import type { CatalogState, PlateOutcome } from '@/data/logHooks'
import { formatAmount, formatKcal, formatProtein } from '@/domain/format'
import { entryFits } from '@/domain/limits'
import {
  ingredientServings,
  type Meal,
  type Nutrients,
  type QuickPick,
  type Source,
  scaleNutrients,
  sourceKey,
  sumNutrients,
} from '@/domain/nutrition'
import { isMeasuredByWeight, type Portion, weightPerServing } from '@/domain/portion'
import { strings } from '@/strings'
import { Modal } from '../Modal'
import { macroText } from '../macros'
import { TextField } from '../TextField'
import { AmountFields } from './AmountFields'
import { BarcodePanel } from './BarcodePanel'
import { LabelPanel } from './LabelPanel'
import { QuickAddPanel } from './QuickAddPanel'

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
  // Logs the plate's items in one go (phase 15).
  onLogPlate: (items: PlateItem[]) => Promise<PlateOutcome>
  // Logs a meal by its numbers (phase 16).
  onQuickAdd: (input: QuickAdd) => Promise<boolean>
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
  // One serving's weight, when it has one (a "bowl (40 g)" too), so the plate can change the
  // amount in grams or ml, as the entry dialog does.
  portion: Portion | null
  // One serving's values, to refuse servings past what an entry holds before logging, and to
  // total the plate; null only for a quick pick whose food isn't loaded.
  perServing: Nutrients | null
}

// An item on the plate: the row it came from and the servings chosen.
type PlateEntry = { id: number; row: Row; servings: number }

type Weighed = { portion: Portion; perServing: Nutrients }

const noNutrients: Nutrients = { kcal: 0, proteinG: 0, carbsG: null, fatG: null }

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
  onAdd,
}: {
  title: string
  rows: Row[]
  onPick: (row: Row) => void
  onAdd: (row: Row) => void
}) =>
  rows.length === 0 ? null : (
    <section className="flex flex-col">
      <h3 className="text-sm font-semibold text-muted">{title}</h3>
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPick(row)}
              className="flex min-h-14 flex-1 flex-col items-start justify-center py-2 text-left"
            >
              <span className="font-medium">{row.name}</span>
              <span className="text-sm text-muted">{row.detail}</span>
            </button>
            <button
              type="button"
              aria-label={strings.log.plate.add(row.name)}
              onClick={() => onAdd(row)}
              className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-xl font-semibold"
            >
              +
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
  onLogPlate,
  onQuickAdd,
  onClose,
}: Props) => {
  const text = strings.log.picker
  const [panel, setPanel] = useState<'scan' | 'enter' | 'label' | 'quick' | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  // The alert shown after a pick wasn't logged.
  const [problem, setProblem] = useState<string | null>(null)
  // The weighed food whose amount is being set, and the servings typed for it.
  const [amountFor, setAmountFor] = useState<(Row & { weighed: Weighed }) | null>(null)
  const [servings, setServings] = useState<number | null>(null)
  const [amountError, setAmountError] = useState<string | undefined>(undefined)
  // The plate (phase 15), the item whose amount is being changed, and whether closing waits
  // for a confirmation because the plate isn't empty.
  const [plate, setPlate] = useState<PlateEntry[]>([])
  const [editing, setEditing] = useState<PlateEntry | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const nextPlateId = useRef(0)

  const foodById = new Map((foods ?? []).map((food) => [food.id, food]))
  const weighedFood = (source: Source): Weighed | null => {
    const food = source.kind === 'food' ? foodById.get(source.id) : undefined
    return food ? weighedOf(food.servingSize, food.servingUnit, food) : null
  }
  const portionOf = (source: Source): Portion | null => {
    const food = source.kind === 'food' ? foodById.get(source.id) : undefined
    return food ? weightPerServing(food.servingSize, food.servingUnit) : null
  }
  const recipeById = new Map((recipes ?? []).map((recipe) => [recipe.id, recipe]))
  const perServingOf = (source: Source): Nutrients | null =>
    (source.kind === 'food' ? foodById.get(source.id) : recipeById.get(source.id)?.perServing) ??
    null

  const servingsText = (servings: number) =>
    strings.log.servings(formatAmount(servings, locale), servings === 1)

  const quick = (prefix: string, list: QuickPick[] | undefined): Row[] =>
    (list ?? []).map((pick) => ({
      key: `${prefix}:${pick.source.kind}:${pick.source.id}`,
      pick: { source: pick.source, servings: pick.servings },
      name: pick.name,
      detail: servingsText(pick.servings),
      weighed: weighedFood(pick.source),
      portion: portionOf(pick.source),
      perServing: perServingOf(pick.source),
    }))

  const foodRow = (food: FoodView, prefix: string): Row & { source: Source } => ({
    key: `${prefix}:food:${food.id}`,
    source: { kind: 'food' as const, id: food.id },
    pick: { source: { kind: 'food' as const, id: food.id }, servings: 1 },
    name: food.name,
    detail: strings.foods.detail(
      strings.foods.serving(formatAmount(food.servingSize, locale), food.servingUnit),
      macroText(food, locale),
    ),
    weighed: weighedOf(food.servingSize, food.servingUnit, food),
    portion: weightPerServing(food.servingSize, food.servingUnit),
    perServing: food,
  })

  const scoreOf = (source: Source) => picks?.scores.get(sourceKey(source)) ?? 0
  const needle = query.trim().toLocaleLowerCase()
  const saved: (Row & { source: Source })[] = [
    ...(foods ?? []).filter((food) => !food.archived).map((food) => foodRow(food, 'all')),
    ...(recipes ?? [])
      .filter((recipe) => !recipe.archived)
      .map((recipe) => ({
        key: `all:recipe:${recipe.id}`,
        source: { kind: 'recipe' as const, id: recipe.id },
        pick: { source: { kind: 'recipe' as const, id: recipe.id }, servings: 1 },
        name: recipe.name,
        detail: text.recipeDetail(macroText(recipe.perServing, locale)),
        weighed: null,
        portion: null,
        perServing: recipe.perServing,
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
        portion: weightPerServing(item.servingSize, item.servingUnit),
        perServing: item,
      }))
    : []

  const search = (value: string) => {
    setQuery(value)
    if (value.trim() !== '') onSearch()
  }

  const log = async (row: Row, amount: number) => {
    if (busy) return
    if (row.perServing && !entryFits(row.perServing, amount)) {
      setProblem(strings.log.amount.tooLarge)
      return
    }
    setBusy(true)
    setProblem(null)
    const ok = await ('builtIn' in row.pick
      ? onPickBuiltIn(row.pick.builtIn, amount)
      : onPick(row.pick.source, amount)
    ).catch(() => false)
    setBusy(false)
    if (ok) onClose()
    else setProblem(text.failed)
  }

  // While the plate is being logged it can't change, so nothing added meanwhile is lost.
  const addToPlate = (row: Row) => {
    if (busy) return
    nextPlateId.current += 1
    const entry = { id: nextPlateId.current, row, servings: servingsOf(row) }
    setPlate((current) => [...current, entry])
    setProblem(null)
    setConfirmClose(false)
  }

  const removeFromPlate = (id: number) => {
    if (busy) return
    setPlate((current) => current.filter((entry) => entry.id !== id))
    setProblem(null)
  }

  const editAmount = (entry: PlateEntry) => {
    if (busy) return
    setEditing(entry)
    setServings(entry.servings)
    setAmountError(undefined)
  }

  const saveAmount = () => {
    if (!editing) return
    if (servings === null) {
      setAmountError(strings.log.amount.error)
      return
    }
    const perServing = editing.row.perServing
    if (perServing && !entryFits(perServing, servings)) {
      setAmountError(strings.log.amount.tooLarge)
      return
    }
    setPlate((current) =>
      current.map((entry) => (entry.id === editing.id ? { ...entry, servings } : entry)),
    )
    setEditing(null)
  }

  // Swaps a recipe on the plate for its ingredients, each scaled to the servings typed, so one
  // meal's amounts can change without editing the recipe (phase 16).
  const splitRecipe = () => {
    if (!editing || !('source' in editing.row.pick)) return
    if (servings === null) {
      setAmountError(strings.log.amount.error)
      return
    }
    const recipe = recipeById.get(editing.row.pick.source.id)
    if (!recipe) return
    const amounts = ingredientServings(recipe.servings, servings, recipe.ingredients)
    const entries = recipe.ingredients.flatMap((ingredient, index): PlateEntry[] => {
      const food = foodById.get(ingredient.foodId)
      if (!food) return []
      nextPlateId.current += 1
      return [
        {
          id: nextPlateId.current,
          row: foodRow(food, 'ingredient'),
          servings: amounts[index] ?? ingredient.servings,
        },
      ]
    })
    // A recipe whose foods are all gone would leave nothing in its place, so it stays.
    if (entries.length === 0) {
      setAmountError(strings.log.plate.noIngredients)
      return
    }
    const tooLarge = entries.find(
      (entry) => entry.row.perServing && !entryFits(entry.row.perServing, entry.servings),
    )
    if (tooLarge) {
      setAmountError(strings.log.plate.tooLarge(tooLarge.row.name))
      return
    }
    setPlate((current) => current.flatMap((entry) => (entry.id === editing.id ? entries : [entry])))
    setEditing(null)
  }

  const logPlate = async () => {
    if (busy || plate.length === 0) return
    const tooLarge = plate.find(
      (entry) => entry.row.perServing && !entryFits(entry.row.perServing, entry.servings),
    )
    if (tooLarge) {
      setProblem(strings.log.plate.tooLarge(tooLarge.row.name))
      return
    }
    setBusy(true)
    setProblem(null)
    const items: PlateItem[] = plate.map(({ row, servings: amount }) =>
      'builtIn' in row.pick
        ? { kind: 'builtIn', item: row.pick.builtIn, servings: amount }
        : { kind: 'saved', source: row.pick.source, servings: amount },
    )
    const outcome = await onLogPlate(items).catch((): PlateOutcome => ({ kind: 'failed' }))
    setBusy(false)
    switch (outcome.kind) {
      case 'logged':
        onClose()
        return
      case 'too_large':
      case 'not_found': {
        const name = plate[outcome.index]?.row.name ?? ''
        setProblem(
          outcome.kind === 'too_large'
            ? strings.log.plate.tooLarge(name)
            : strings.log.plate.missing(name),
        )
        return
      }
      case 'failed':
        setProblem(text.failed)
        return
    }
  }

  // Closing would drop the plate, so it asks first.
  const close = () => {
    if (plate.length === 0) {
      onClose()
      return
    }
    // From any view: the question shows on the list, beside the plate.
    setEditing(null)
    setAmountFor(null)
    setPanel(null)
    setConfirmClose(true)
  }

  // After a scan or a label logs a new food, the picker closes, unless a plate is waiting.
  const done = () => {
    if (plate.length > 0) setPanel(null)
    else onClose()
  }

  const pick = (row: Row) => {
    // While a plate is being built, a tap adds to it, so logging one food can't close the
    // picker and drop the plate.
    if (plate.length > 0) {
      addToPlate(row)
      return
    }
    if (!row.weighed) {
      void log(row, servingsOf(row))
      return
    }
    setAmountFor({ ...row, weighed: row.weighed })
    setServings(servingsOf(row))
    setAmountError(undefined)
    setProblem(null)
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

  const amountText = ({ row, servings: amount }: PlateEntry): string => {
    // Grams for a food measured by weight; servings, and their weight when a serving has one,
    // for a food counted in pieces, matching the fields Change shows.
    const { portion } = row
    if (!portion) return servingsText(amount)
    const weight = strings.log.amount.weight(
      formatAmount(amount * portion.amount, locale),
      portion.unit,
    )
    return row.weighed ? weight : `${servingsText(amount)} · ${weight}`
  }
  const plateNutrients = sumNutrients(
    plate.flatMap(({ row, servings: amount }) =>
      row.perServing ? [scaleNutrients(row.perServing, amount)] : [],
    ),
  )
  const plateTotal = `${formatKcal(plateNutrients.kcal, locale)} · ${strings.log.plate.protein(
    formatProtein(plateNutrients.proteinG, locale),
  )}`

  const loading = foods === undefined || recipes === undefined
  const nothingSaved = !loading && saved.length === 0 && needle === ''

  return (
    <Modal
      title={strings.log.addTo(strings.log.meals[meal])}
      onClose={close}
      action={
        <button type="button" onClick={close} className="min-h-11 rounded-lg px-3 font-medium">
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
              setProblem(null)
              setAmountError(undefined)
            }}
            className="inline-flex min-h-11 items-center self-start text-accent"
          >
            {strings.log.label.back}
          </button>
          <h3 className="font-semibold">{amountFor.name}</h3>
          {problem && (
            <p role="alert" className="text-danger">
              {problem}
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
      ) : editing ? (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            saveAmount()
          }}
          className="flex flex-col gap-3"
        >
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="inline-flex min-h-11 items-center self-start text-accent"
          >
            {strings.log.label.back}
          </button>
          <h3 className="font-semibold">{editing.row.name}</h3>
          <AmountFields
            portion={editing.row.portion}
            perServing={editing.row.perServing ?? editing.row.weighed?.perServing ?? noNutrients}
            initialServings={editing.servings}
            locale={locale}
            error={amountError}
            onChange={(value) => {
              setServings(value)
              if (value !== null) setAmountError(undefined)
            }}
          />
          <button
            type="submit"
            className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-text"
          >
            {strings.log.plate.update}
          </button>
          {'source' in editing.row.pick && editing.row.pick.source.kind === 'recipe' && (
            <button
              type="button"
              onClick={splitRecipe}
              className="min-h-11 rounded-lg border border-border px-4 font-medium"
            >
              {strings.log.plate.useIngredients}
            </button>
          )}
        </form>
      ) : panel === 'quick' ? (
        <QuickAddPanel onLog={onQuickAdd} onBack={() => setPanel(null)} onDone={done} />
      ) : panel === 'label' ? (
        <LabelPanel
          barcode={null}
          locale={locale}
          onLogNew={onLogNew}
          onBack={() => setPanel(null)}
          onDone={done}
        />
      ) : panel !== null ? (
        <BarcodePanel
          start={panel}
          locale={locale}
          onLookup={onLookup}
          onLogSaved={onLogScanned}
          onLogNew={onLogNew}
          onBack={() => setPanel(null)}
          onDone={done}
        />
      ) : (
        <>
          {problem && (
            <p role="alert" className="text-danger">
              {problem}
            </p>
          )}
          {confirmClose && (
            <div className="flex flex-col gap-2 rounded-lg bg-surface p-3">
              <p role="alert">{strings.log.plate.discardPrompt}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmClose(false)}
                  className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-text"
                >
                  {strings.log.plate.keep}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-11 rounded-lg border border-border px-4 font-medium text-danger"
                >
                  {strings.log.plate.discard}
                </button>
              </div>
            </div>
          )}
          {plate.length > 0 && (
            <section
              aria-label={strings.log.plate.title}
              className="flex flex-col gap-2 rounded-lg bg-surface p-3"
            >
              <h3 className="font-semibold">{strings.log.plate.title}</h3>
              <ul className="flex flex-col divide-y divide-border">
                {plate.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-2 py-1">
                    <span className="flex flex-1 flex-col">
                      <span className="font-medium">{entry.row.name}</span>
                      <span className="text-sm text-muted">{amountText(entry)}</span>
                    </span>
                    <button
                      type="button"
                      aria-label={strings.log.plate.edit(entry.row.name)}
                      onClick={() => editAmount(entry)}
                      className="min-h-11 rounded-lg px-2 font-medium text-accent"
                    >
                      {strings.log.plate.editShort}
                    </button>
                    <button
                      type="button"
                      aria-label={strings.log.plate.remove(entry.row.name)}
                      onClick={() => removeFromPlate(entry.id)}
                      className="min-h-11 rounded-lg px-2 font-medium text-danger"
                    >
                      {strings.log.plate.removeShort}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-sm">{strings.log.plate.total(plateTotal)}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void logPlate()}
                className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-text disabled:opacity-60"
              >
                {strings.log.plate.logAll}
              </button>
            </section>
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
              className="min-h-11 rounded-lg border border-border px-3 font-medium"
            >
              {text.label}
            </button>
            <button
              type="button"
              onClick={() => setPanel('quick')}
              className="min-h-11 rounded-lg border border-border px-3 font-medium"
            >
              {strings.log.quickAdd.open}
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
                    title={text.usual[meal]}
                    rows={quick('usual', picks?.byMeal[meal])}
                    onPick={pick}
                    onAdd={addToPlate}
                  />
                  <PickList
                    title={text.recent}
                    rows={quick('recent', picks?.recent)}
                    onPick={pick}
                    onAdd={addToPlate}
                  />
                  <PickList
                    title={text.mostUsed}
                    rows={quick('most', picks?.mostUsed)}
                    onPick={pick}
                    onAdd={addToPlate}
                  />
                </>
              )}
              <TextField label={text.search} value={query} onChange={search} type="search" />
              {needle === '' ? (
                saved.length > 0 && (
                  <PickList title={text.all} rows={saved} onPick={pick} onAdd={addToPlate} />
                )
              ) : (
                // Search results in groups (phase 15): what you've logged, then the rest of
                // yours; built-in foods follow.
                <>
                  <PickList
                    title={text.loggedBefore}
                    rows={saved.filter((row) => scoreOf(row.source) > 0)}
                    onPick={pick}
                    onAdd={addToPlate}
                  />
                  <PickList
                    title={text.yours}
                    rows={saved.filter((row) => scoreOf(row.source) === 0)}
                    onPick={pick}
                    onAdd={addToPlate}
                  />
                </>
              )}
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
                  <PickList
                    title={text.builtIn}
                    rows={builtInRows}
                    onPick={pick}
                    onAdd={addToPlate}
                  />
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
