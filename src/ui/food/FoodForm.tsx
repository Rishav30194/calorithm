import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'

import type { FoodInput, FoodView } from '@/data/foods'
import { strings } from '@/strings'

import { TextField } from '../TextField'
import { editableNumber, type FoodField, type FoodFormValues, parseFoodForm } from './forms'

export const emptyFoodValues: FoodFormValues = {
  name: '',
  servingSize: '',
  servingUnit: '',
  kcal: '',
  proteinG: '',
  carbsG: '',
  fatG: '',
  barcode: '',
}

export const foodValues = (food: FoodView, locale: string): FoodFormValues => {
  const show = (value: number) => editableNumber(value, locale)
  return {
    name: food.name,
    servingSize: show(food.servingSize),
    servingUnit: food.servingUnit,
    kcal: show(food.kcal),
    proteinG: show(food.proteinG),
    // Not set on foods saved before carbs and fat existed: left empty to fill in.
    carbsG: food.carbsG === null ? '' : show(food.carbsG),
    fatG: food.fatG === null ? '' : show(food.fatG),
    barcode: food.barcode ?? '',
  }
}

type Props = {
  initial: FoodFormValues
  // The barcode the food has saved, which can be changed but not removed (decision 0025).
  savedBarcode: string | null
  // Shown under the serving fields, such as where the values came from.
  note?: ReactNode
  submitLabel?: string
  // Told of every edit, so a screen can keep what was typed when it swaps the form out.
  onValuesChange?: (values: FoodFormValues) => void
  onSave: (input: FoodInput) => Promise<boolean>
}

// The food fields, shared by the food editor and the picker's barcode flow.
export const FoodForm = ({
  initial,
  savedBarcode,
  note,
  submitLabel,
  onValuesChange,
  onSave,
}: Props) => {
  const text = strings.foods.editor
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<Partial<Record<FoodField, string>>>({})
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const form = useRef<HTMLFormElement>(null)

  // After a rejected save, focus moves to the first field with an error.
  useEffect(() => {
    if (attempt === 0) return
    form.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus()
  }, [attempt])

  const set = (key: FoodField) => (value: string) => {
    const next = { ...values, [key]: value }
    setValues(next)
    onValuesChange?.(next)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setFailed(false)
    const parsed = parseFoodForm(values, savedBarcode)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      setAttempt((n) => n + 1)
      return
    }
    setErrors({})
    setSaving(true)
    const saved = await onSave(parsed.input).catch(() => false)
    setSaving(false)
    if (!saved) setFailed(true)
  }

  return (
    <form ref={form} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <TextField label={text.name} value={values.name} onChange={set('name')} error={errors.name} />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label={text.servingSize}
          value={values.servingSize}
          onChange={set('servingSize')}
          inputMode="decimal"
          error={errors.servingSize}
        />
        <TextField
          label={text.servingUnit}
          hint={text.servingUnitHint}
          value={values.servingUnit}
          onChange={set('servingUnit')}
          error={errors.servingUnit}
        />
      </div>
      {note}
      <TextField
        label={text.kcal}
        value={values.kcal}
        onChange={set('kcal')}
        inputMode="numeric"
        error={errors.kcal}
      />
      <TextField
        label={text.proteinG}
        value={values.proteinG}
        onChange={set('proteinG')}
        inputMode="decimal"
        error={errors.proteinG}
      />
      <TextField
        label={text.carbsG}
        value={values.carbsG}
        onChange={set('carbsG')}
        inputMode="decimal"
        error={errors.carbsG}
      />
      <TextField
        label={text.fatG}
        value={values.fatG}
        onChange={set('fatG')}
        inputMode="decimal"
        error={errors.fatG}
      />
      <TextField
        label={text.barcode}
        hint={text.barcodeHint}
        value={values.barcode}
        onChange={set('barcode')}
        inputMode="numeric"
        error={errors.barcode}
      />
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
        {saving ? text.saving : (submitLabel ?? text.save)}
      </button>
    </form>
  )
}
