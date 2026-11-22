import { type FormEvent, useEffect, useRef, useState } from 'react'

import type { FoodView, RecipeDetail, RecipeInput } from '@/data/foods'
import { formatAmount } from '@/domain/format'
import {
  type Ingredient,
  missingCarbsOrFat,
  type Nutrients,
  recipePerServing,
  recipeTotals,
  scaleNutrients,
} from '@/domain/nutrition'
import { strings } from '@/strings'

import { macroText } from '../macros'
import { TextField } from '../TextField'
import { FoodPicker } from './FoodPicker'
import { editableNumber, parseRecipeForm, type RecipeField, toNumber } from './forms'

type Props = {
  recipe: RecipeDetail | null
  foods: FoodView[]
  locale: string
  backHref: string
  onSave: (input: RecipeInput) => Promise<boolean>
  onSetArchived: (archived: boolean) => Promise<void>
}

type Item = { foodId: string; servings: string }

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

export const RecipeEditor = ({ recipe, foods, locale, backHref, onSave, onSetArchived }: Props) => {
  const text = strings.recipes.editor
  const show = (value: number) => editableNumber(value, locale)
  const [name, setName] = useState(recipe?.name ?? '')
  const [servings, setServings] = useState(recipe ? show(recipe.servings) : '')
  const [items, setItems] = useState<Item[]>(
    () =>
      recipe?.items.map((item) => ({ foodId: item.foodId, servings: show(item.servings) })) ?? [],
  )
  const [errors, setErrors] = useState<Partial<Record<RecipeField, string>>>({})
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({})
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [archiving, setArchiving] = useState(false)
  const [archiveFailed, setArchiveFailed] = useState(false)
  const form = useRef<HTMLFormElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (attempt === 0) return
    const invalid = form.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')
    if (invalid) invalid.focus()
    else addButton.current?.focus()
  }, [attempt])

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

  // Foods by id, archived ones too, since a recipe can keep an archived ingredient.
  const foodById = new Map(foods.map((food) => [food.id, food]))
  const nameOf = (foodId: string) =>
    foodById.get(foodId)?.name ?? recipe?.items.find((item) => item.foodId === foodId)?.name ?? ''
  const perServingOf = (foodId: string): Nutrients | null => {
    const food = foodById.get(foodId)
    return food
      ? { kcal: food.kcal, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG }
      : null
  }

  const nutrientText = (nutrients: Nutrients) => macroText(nutrients, locale)
  const describeFood = (food: FoodView) =>
    strings.foods.detail(
      strings.foods.serving(formatAmount(food.servingSize, locale), food.servingUnit),
      nutrientText(food),
    )

  // Totals follow the fields as typed, counting only servings that parse.
  const ingredients: Ingredient[] = items.flatMap((item) => {
    const perServing = perServingOf(item.foodId)
    const amount = toNumber(item.servings)
    return perServing && amount > 0 ? [{ perServing, servings: amount }] : []
  })
  const makes = toNumber(servings)
  const totals = recipeTotals(ingredients)
  const perServing = makes > 0 ? scaleNutrients(recipePerServing(ingredients, makes), 1) : null

  const sorted = [...items].sort((a, b) =>
    byName({ name: nameOf(a.foodId) }, { name: nameOf(b.foodId) }),
  )
  const pickable = foods.filter(
    (food) => !food.archived && !items.some((item) => item.foodId === food.id),
  )

  const setItemServings = (foodId: string, value: string) =>
    setItems((old) =>
      old.map((item) => (item.foodId === foodId ? { ...item, servings: value } : item)),
    )

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setFailed(false)
    const parsed = parseRecipeForm({ name, servings, items })
    if (!parsed.ok) {
      setErrors(parsed.errors)
      setItemErrors(parsed.itemErrors)
      setAttempt((n) => n + 1)
      return
    }
    setErrors({})
    setItemErrors({})
    setSaving(true)
    const saved = await onSave(parsed.input).catch(() => false)
    setSaving(false)
    if (!saved) setFailed(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <a href={backHref} className="inline-flex min-h-11 items-center self-start text-accent">
        {text.back}
      </a>
      <h2 className="text-xl font-semibold">{recipe ? text.editTitle : text.newTitle}</h2>
      {recipe?.archived && <p className="text-muted">{text.archivedNote}</p>}
      <form ref={form} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField label={text.name} value={name} onChange={setName} error={errors.name} />
        <TextField
          label={text.servings}
          value={servings}
          onChange={setServings}
          inputMode="decimal"
          error={errors.servings}
        />

        <section aria-labelledby="ingredients-heading" className="flex flex-col gap-3">
          <h3 id="ingredients-heading" className="text-lg font-semibold">
            {text.ingredients}
          </h3>
          {sorted.length === 0 && <p className="text-muted">{text.noIngredients}</p>}
          <ul className="flex flex-col gap-3">
            {sorted.map((item) => {
              const itemName = nameOf(item.foodId)
              const food = foodById.get(item.foodId)
              return (
                <li key={item.foodId} className="flex items-end gap-2 border-b border-border pb-3">
                  <div className="flex-1">
                    <TextField
                      label={text.ingredientServings(itemName)}
                      hint={food ? describeFood(food) : undefined}
                      value={item.servings}
                      onChange={(value) => setItemServings(item.foodId, value)}
                      inputMode="decimal"
                      error={itemErrors[item.foodId]}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={text.remove(itemName)}
                    onClick={() => setItems((old) => old.filter((i) => i.foodId !== item.foodId))}
                    className="min-h-11 rounded-lg border border-border px-3 font-medium"
                  >
                    {text.removeLabel}
                  </button>
                </li>
              )
            })}
          </ul>
          {errors.items && (
            <p role="alert" className="text-danger">
              {errors.items}
            </p>
          )}
          <button
            ref={addButton}
            type="button"
            onClick={() => setPicking(true)}
            className="min-h-11 self-start rounded-lg border border-border px-4 font-medium"
          >
            {text.addIngredient}
          </button>
        </section>

        <dl className="grid grid-cols-2 gap-2 rounded-lg bg-surface p-3">
          <dt className="text-muted">{text.totals}</dt>
          <dd>{nutrientText(totals)}</dd>
          <dt className="text-muted">{text.perServing}</dt>
          <dd>{perServing ? nutrientText(perServing) : text.noPerServing}</dd>
        </dl>
        {missingCarbsOrFat(ingredients.map((ingredient) => ingredient.perServing)) && (
          <p className="text-sm text-muted">{strings.recipes.missingCarbsOrFat}</p>
        )}

        {failed && (
          <p role="alert" className="text-danger">
            {text.saveFailed}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-text disabled:opacity-60"
        >
          {saving ? text.saving : text.save}
        </button>
      </form>
      {recipe && (
        <>
          {archiveFailed && (
            <p role="alert" className="text-danger">
              {text.archiveFailed}
            </p>
          )}
          <button
            type="button"
            disabled={archiving}
            onClick={() => void toggleArchived(!recipe.archived)}
            className="min-h-11 self-start rounded-lg border border-border px-4 font-medium disabled:opacity-60"
          >
            {recipe.archived ? text.restore : text.archive}
          </button>
        </>
      )}
      {picking && (
        <FoodPicker
          foods={pickable}
          detailOf={describeFood}
          onPick={(food) => {
            setItems((old) => [...old, { foodId: food.id, servings: show(1) }])
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}
