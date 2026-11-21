import { type FormEvent, useEffect, useRef, useState } from 'react'

import type { FoodInput, FoodView } from '@/data/foods'
import { strings } from '@/strings'

import { TextField } from '../TextField'
import { editableNumber, type FoodField, type FoodFormValues, parseFoodForm } from './forms'

type Props = {
  food: FoodView | null
  locale: string
  backHref: string
  onSave: (input: FoodInput) => Promise<boolean>
  onSetArchived: (archived: boolean) => Promise<void>
}

const initialValues = (food: FoodView | null, locale: string): FoodFormValues => {
  const show = (value: number) => editableNumber(value, locale)
  return food
    ? {
        name: food.name,
        servingSize: show(food.servingSize),
        servingUnit: food.servingUnit,
        kcal: show(food.kcal),
        proteinG: show(food.proteinG),
      }
    : { name: '', servingSize: '', servingUnit: '', kcal: '', proteinG: '' }
}

export const FoodEditor = ({ food, locale, backHref, onSave, onSetArchived }: Props) => {
  const text = strings.foods.editor
  const [values, setValues] = useState(() => initialValues(food, locale))
  const [errors, setErrors] = useState<Partial<Record<FoodField, string>>>({})
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [archiving, setArchiving] = useState(false)
  const [archiveFailed, setArchiveFailed] = useState(false)
  const form = useRef<HTMLFormElement>(null)

  // After a rejected save, focus moves to the first field with an error.
  useEffect(() => {
    if (attempt === 0) return
    form.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus()
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

  const set = (key: FoodField) => (value: string) => setValues((old) => ({ ...old, [key]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setFailed(false)
    const parsed = parseFoodForm(values)
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
    <div className="flex flex-col gap-4">
      <a href={backHref} className="inline-flex min-h-11 items-center self-start text-accent">
        {text.back}
      </a>
      <h2 className="text-xl font-semibold">{food ? text.editTitle : text.newTitle}</h2>
      {food?.archived && <p className="text-muted">{text.archivedNote}</p>}
      <form ref={form} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          label={text.name}
          value={values.name}
          onChange={set('name')}
          error={errors.name}
        />
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
