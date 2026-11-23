import { type FormEvent, useState } from 'react'

import type { QuickAdd } from '@/data/log'
import { strings } from '@/strings'

import { TextField } from '../TextField'
import { parseQuickAdd, type QuickAddField, type QuickAddValues } from './parse'

type Props = {
  onLog: (input: QuickAdd) => Promise<boolean>
  onBack: () => void
  onDone: () => void
}

const empty: QuickAddValues = { name: '', kcal: '', proteinG: '', carbsG: '', fatG: '' }

// Phase 16: a meal logged by its numbers, for one you won't log again. It isn't saved as a food.
export const QuickAddPanel = ({ onLog, onBack, onDone }: Props) => {
  const text = strings.log.quickAdd
  const [values, setValues] = useState<QuickAddValues>(empty)
  const [errors, setErrors] = useState<Partial<Record<QuickAddField, true>>>({})
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const set = (field: QuickAddField) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = parseQuickAdd(values)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      return
    }
    setErrors({})
    setBusy(true)
    setFailed(false)
    const ok = await onLog(parsed.input).catch(() => false)
    setBusy(false)
    if (ok) onDone()
    else setFailed(true)
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center self-start text-accent"
      >
        {strings.log.label.back}
      </button>
      <h3 className="font-semibold">{text.title}</h3>
      <p className="text-sm text-muted">{text.hint}</p>
      {failed && (
        <p role="alert" className="text-danger">
          {strings.log.picker.failed}
        </p>
      )}
      <TextField
        label={text.name}
        value={values.name}
        onChange={set('name')}
        error={errors.name ? text.errors.name : undefined}
        autoFocus
      />
      <TextField
        label={text.kcal}
        value={values.kcal}
        onChange={set('kcal')}
        inputMode="numeric"
        error={errors.kcal ? text.errors.kcal : undefined}
      />
      <TextField
        label={text.protein}
        value={values.proteinG}
        onChange={set('proteinG')}
        inputMode="decimal"
        error={errors.proteinG ? text.errors.grams : undefined}
      />
      <TextField
        label={text.carbs}
        value={values.carbsG}
        onChange={set('carbsG')}
        inputMode="decimal"
        error={errors.carbsG ? text.errors.grams : undefined}
      />
      <TextField
        label={text.fat}
        value={values.fatG}
        onChange={set('fatG')}
        inputMode="decimal"
        error={errors.fatG ? text.errors.grams : undefined}
      />
      <button
        type="submit"
        disabled={busy}
        className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-text disabled:opacity-60"
      >
        {text.log}
      </button>
    </form>
  )
}
