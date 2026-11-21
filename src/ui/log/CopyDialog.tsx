import { type FormEvent, useId, useState } from 'react'

import { isMeal, type Meal, meals } from '@/domain/nutrition'
import { strings } from '@/strings'

import { Modal } from '../Modal'

type Props = {
  into: Meal
  date: string
  meal: Meal
  onDateChange: (date: string) => void
  onMealChange: (meal: Meal) => void
  // How many entries the chosen meal holds; undefined while it loads.
  count: number | undefined
  locale: string
  onCopy: (from: { date: string; meal: Meal }) => Promise<void>
  onClose: () => void
}

export const CopyDialog = ({
  into,
  date,
  meal,
  onDateChange,
  onMealChange,
  count,
  locale,
  onCopy,
  onClose,
}: Props) => {
  const text = strings.log.copy
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const dateId = useId()
  const mealId = useId()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!count) return
    setBusy(true)
    setFailed(false)
    try {
      await onCopy({ date, meal })
      onClose()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={strings.log.copyInto(strings.log.meals[into])} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={dateId} className="font-medium">
            {text.date}
          </label>
          <input
            id={dateId}
            type="date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
            className="min-h-11 rounded-lg border border-border bg-bg px-3 text-base"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={mealId} className="font-medium">
            {text.meal}
          </label>
          <select
            id={mealId}
            value={meal}
            onChange={(event) => {
              if (isMeal(event.target.value)) onMealChange(event.target.value)
            }}
            className="min-h-11 rounded-lg border border-border bg-bg px-3 text-base"
          >
            {meals.map((option) => (
              <option key={option} value={option}>
                {strings.log.meals[option]}
              </option>
            ))}
          </select>
        </div>
        <p aria-live="polite" className="text-muted">
          {count === undefined
            ? strings.loading
            : count === 0
              ? text.none
              : text.count(new Intl.NumberFormat(locale).format(count), count === 1)}
        </p>
        {failed && (
          <p role="alert" className="text-danger">
            {text.failed}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy || !count}
            className="min-h-11 flex-1 rounded-lg bg-accent px-4 font-semibold text-accent-text disabled:opacity-60"
          >
            {text.copy}
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
