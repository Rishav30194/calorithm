import { type FormEvent, useState } from 'react'

import type { FoodInput } from '@/data/foods'
import { type LabelReading, parseNutritionLabel } from '@/domain/label'
import { strings } from '@/strings'

import { emptyFoodValues, FoodForm } from '../food/FoodForm'
import type { FoodFormValues } from '../food/forms'
import { editableNumber } from '../food/forms'
import { TextField } from '../TextField'

type Props = {
  // Kept on the saved food when the label is read after an unknown barcode.
  barcode: string | null
  locale: string
  onLogNew: (input: FoodInput) => Promise<boolean>
  onBack: () => void
  backLabel?: string
  // After the food is logged, the picker closes.
  onDone: () => void
}

type Step = { kind: 'paste' } | { kind: 'form'; reading: LabelReading | null }

const valuesOf = (reading: LabelReading | null, barcode: string | null, locale: string) => {
  const show = (value: number | null) => (value === null ? '' : editableNumber(value, locale))
  const values: FoodFormValues = { ...emptyFoodValues, barcode: barcode ?? '' }
  if (!reading) return values
  return {
    ...values,
    servingSize: reading.basis ? show(reading.basis.size) : '',
    servingUnit: reading.basis?.unit ?? '',
    kcal: show(reading.kcal),
    proteinG: show(reading.proteinG),
    carbsG: show(reading.carbsG),
    fatG: show(reading.fatG),
  }
}

const valuesRead = (reading: LabelReading) =>
  [reading.kcal, reading.proteinG, reading.carbsG, reading.fatG].filter((value) => value !== null)
    .length

// Reads a nutrition label's text into the food form, for the user to name and check.
export const LabelPanel = ({ barcode, locale, onLogNew, onBack, backLabel, onDone }: Props) => {
  const text = strings.log.label
  const [step, setStep] = useState<Step>({ kind: 'paste' })
  const [labelText, setLabelText] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)

  const read = (event: FormEvent) => {
    event.preventDefault()
    const reading = parseNutritionLabel(labelText)
    if (valuesRead(reading) === 0) {
      setError(text.nothingRead)
      return
    }
    setError(undefined)
    setStep({ kind: 'form', reading })
  }

  // The form shows its own error when this returns false.
  const logNew = async (input: FoodInput): Promise<boolean> => {
    const ok = await onLogNew(input)
    if (ok) onDone()
    return ok
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center self-start text-accent"
      >
        {backLabel ?? text.back}
      </button>
      {step.kind === 'paste' && (
        <form onSubmit={read} noValidate className="flex flex-col gap-3">
          <TextField
            label={text.text}
            hint={text.textHint}
            value={labelText}
            onChange={setLabelText}
            error={error}
            rows={8}
          />
          <button
            type="submit"
            className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-text"
          >
            {text.read}
          </button>
          {error && (
            <button
              type="button"
              onClick={() => setStep({ kind: 'form', reading: null })}
              className="min-h-11 self-start rounded-lg border border-border px-3 font-medium"
            >
              {text.enterByHand}
            </button>
          )}
        </form>
      )}
      {step.kind === 'form' && (
        <>
          {step.reading && (
            <p role="status">
              {text.check}
              {valuesRead(step.reading) < 4 || step.reading.basis === null
                ? ` ${text.partial}`
                : ''}
            </p>
          )}
          <FoodForm
            initial={valuesOf(step.reading, barcode, locale)}
            savedBarcode={null}
            submitLabel={strings.log.barcode.saveAndLog}
            onSave={logNew}
          />
        </>
      )}
    </div>
  )
}
