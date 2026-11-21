import { type FormEvent, useId, useState } from 'react'

import type { SetWeighInResult } from '@/data/weights'
import { formatWeight } from '@/domain/format'
import type { WeighIn } from '@/domain/trend'
import { WEIGHT_KG_MAX, WEIGHT_KG_MIN, type WeightUnit } from '@/domain/weight'
import { strings } from '@/strings'

import { TextField } from '../TextField'
import { parseWeighInForm, type WeighInErrors } from './parse'

type Props = {
  today: string
  unit: WeightUnit
  locale: string
  // Days that already have a weigh-in, so the form can say a save replaces it.
  savedDays: ReadonlySet<string>
  onSave: (weighIn: WeighIn) => Promise<SetWeighInResult>
}

export const weightRangeError = (unit: WeightUnit, locale: string): string =>
  strings.weight.errors.weight(
    formatWeight(WEIGHT_KG_MIN, unit, locale),
    formatWeight(WEIGHT_KG_MAX, unit, locale),
  )

export const WeighInForm = ({ today, unit, locale, savedDays, onSave }: Props) => {
  const text = strings.weight
  const dayId = useId()
  const dayHintId = `${dayId}-hint`
  const dayErrorId = `${dayId}-error`
  const [day, setDay] = useState(today)
  const [weight, setWeight] = useState('')
  const [errors, setErrors] = useState<WeighInErrors>({})
  const [status, setStatus] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle')
  const replaces = savedDays.has(day)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = parseWeighInForm({ day, weight }, unit, today)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      setStatus('idle')
      return
    }
    setErrors({})
    setStatus('busy')
    try {
      const result = await onSave(parsed.weighIn)
      setStatus(result.ok ? 'saved' : 'failed')
      if (result.ok) setWeight('')
    } catch {
      setStatus('failed')
    }
  }

  const describedBy = [replaces ? dayHintId : null, errors.day ? dayErrorId : null]
    .filter(Boolean)
    .join(' ')

  return (
    <section aria-labelledby={`${dayId}-title`} className="flex flex-col gap-3">
      <h2 id={`${dayId}-title`} className="text-lg font-semibold">
        {text.add}
      </h2>
      <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={dayId} className="font-medium">
            {text.day}
          </label>
          {replaces && (
            <p id={dayHintId} className="text-sm text-muted">
              {text.replaces}
            </p>
          )}
          <input
            id={dayId}
            type="date"
            min="2000-01-01"
            max={today}
            value={day}
            onChange={(event) => {
              setDay(event.target.value)
              setStatus('idle')
            }}
            aria-invalid={errors.day ? true : undefined}
            aria-describedby={describedBy || undefined}
            className="min-h-11 rounded-lg border border-border bg-bg px-3 text-base aria-[invalid=true]:border-danger"
          />
          {errors.day && (
            <p id={dayErrorId} className="text-sm text-danger">
              {text.errors.day}
            </p>
          )}
        </div>
        <TextField
          label={text.weight(unit)}
          value={weight}
          onChange={(value) => {
            setWeight(value)
            setStatus('idle')
          }}
          inputMode="decimal"
          error={errors.weight ? weightRangeError(unit, locale) : undefined}
        />
        <button
          type="submit"
          disabled={status === 'busy'}
          className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-text disabled:opacity-60"
        >
          {text.save}
        </button>
        <p role="status" className="min-h-6">
          {status === 'saved' ? text.saved : ''}
        </p>
        {status === 'failed' && (
          <p role="alert" className="text-danger">
            {text.failed}
          </p>
        )}
      </form>
    </section>
  )
}
