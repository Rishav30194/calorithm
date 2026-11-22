import { useState } from 'react'

import { formatAmount } from '@/domain/format'
import type { Nutrients } from '@/domain/nutrition'
import { scaleNutrients } from '@/domain/nutrition'
import { amountForServings, type Portion, servingsForAmount } from '@/domain/portion'
import { strings } from '@/strings'

import { editableNumber, toNumber } from '../food/forms'
import { macroText } from '../macros'
import { TextField } from '../TextField'
import { parseServings } from './parse'

type Props = {
  // One serving's weight; null for a recipe or a piece, which have servings only.
  portion: Portion | null
  perServing: Nutrients
  initialServings: number
  locale: string
  // Shown on the field typed last, which is the one that didn't parse.
  error: string | undefined
  // The servings typed or worked out from the amount; null while they don't parse.
  onChange: (servings: number | null) => void
}

// Servings, and for a food with a weight its amount in grams or ml, kept in step as either is
// typed, with what the entry will come to.
export const AmountFields = ({
  portion,
  perServing,
  initialServings,
  locale,
  error,
  onChange,
}: Props) => {
  const text = strings.log.amount
  const show = (value: number) => editableNumber(value, locale)
  const [servingsText, setServingsText] = useState(() => show(initialServings))
  const [amountText, setAmountText] = useState(() =>
    portion ? show(amountForServings(initialServings, portion)) : '',
  )
  const [servings, setServings] = useState<number | null>(initialServings)
  const [typedAmount, setTypedAmount] = useState(portion !== null)

  const report = (value: number | null) => {
    setServings(value)
    onChange(value)
  }

  // The other field follows; while this one doesn't parse, the other is cleared rather than
  // left showing a value that no longer matches.
  const typeServings = (value: string) => {
    setServingsText(value)
    setTypedAmount(false)
    const parsed = parseServings(value)
    report(parsed)
    if (portion) setAmountText(parsed === null ? '' : show(amountForServings(parsed, portion)))
  }

  const typeAmount = (value: string) => {
    setAmountText(value)
    const amount = toNumber(value)
    const parsed =
      portion && Number.isFinite(amount) && amount > 0
        ? parseServings(show(servingsForAmount(amount, portion)))
        : null
    setTypedAmount(true)
    report(parsed)
    setServingsText(parsed === null ? '' : show(parsed))
  }

  return (
    <div className="flex flex-col gap-3">
      {portion && (
        <TextField
          label={text.amount(portion.unit)}
          value={amountText}
          onChange={typeAmount}
          inputMode="decimal"
          error={typedAmount ? error : undefined}
          autoFocus
        />
      )}
      <TextField
        label={text.servings}
        hint={
          portion
            ? text.perServing(text.weight(formatAmount(portion.amount, locale), portion.unit))
            : undefined
        }
        value={servingsText}
        onChange={typeServings}
        inputMode="decimal"
        error={typedAmount ? undefined : error}
      />
      {servings !== null && (
        <p role="status" className="text-muted">
          {text.preview(macroText(scaleNutrients(perServing, servings), locale))}
        </p>
      )}
    </div>
  )
}
