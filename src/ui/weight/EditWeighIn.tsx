import { type FormEvent, useState } from 'react'

import type { SetWeighInResult } from '@/data/weights'
import type { WeighIn } from '@/domain/trend'
import { fromKg, type WeightUnit } from '@/domain/weight'
import { strings } from '@/strings'

import { editableNumber } from '../food/forms'
import { Modal } from '../Modal'
import { TextField } from '../TextField'
import { formatDay } from './days'
import { parseWeighInForm } from './parse'
import { weightRangeError } from './WeighInForm'

type Props = {
  weighIn: WeighIn
  today: string
  unit: WeightUnit
  locale: string
  onSave: (weighIn: WeighIn) => Promise<SetWeighInResult>
  onRemove: (date: string) => Promise<void>
  onClose: () => void
}

// Pounds are shown with one decimal, as everywhere else, so saving unchanged keeps the value.
const shown = (kg: number, unit: WeightUnit, locale: string): string =>
  editableNumber(unit === 'kg' ? kg : Math.round(fromKg(kg, unit) * 10) / 10, locale)

export const EditWeighIn = ({ weighIn, today, unit, locale, onSave, onRemove, onClose }: Props) => {
  const text = strings.weight
  const [weight, setWeight] = useState(() => shown(weighIn.kg, unit, locale))
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const run = async (write: () => Promise<boolean>) => {
    setBusy(true)
    setFailed(false)
    try {
      if (await write()) onClose()
      else setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = parseWeighInForm({ day: weighIn.date, weight }, unit, today)
    if (!parsed.ok) {
      setError(true)
      return
    }
    setError(false)
    void run(async () => (await onSave(parsed.weighIn)).ok)
  }

  return (
    <Modal title={text.editTitle(formatDay(weighIn.date, locale))} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <TextField
          label={text.weight(unit)}
          value={weight}
          onChange={setWeight}
          inputMode="decimal"
          error={error ? weightRangeError(unit, locale) : undefined}
        />
        {failed && (
          <p role="alert" className="text-danger">
            {text.failed}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-text disabled:opacity-60"
        >
          {text.save}
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await onRemove(weighIn.date)
                return true
              })
            }
            className="min-h-11 flex-1 rounded-lg border border-border px-4 font-medium text-danger disabled:opacity-60"
          >
            {text.remove}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-lg border border-border px-4 font-medium"
          >
            {text.cancel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
