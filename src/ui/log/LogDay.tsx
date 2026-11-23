import { useEffect, useId, useState } from 'react'

import type { LoggedEntry } from '@/data/log'
import type { DayView } from '@/data/logHooks'
import { addDays, EARLIEST_DAY } from '@/domain/dates'
import { formatAmount } from '@/domain/format'
import { type DailyTargets, type Meal, meals, missingCarbsOrFat } from '@/domain/nutrition'
import { strings } from '@/strings'

import { macroText } from '../macros'
import { routeHref } from '../routes'
import { TargetProgress } from './TargetProgress'

type Props = {
  date: string
  today: string
  day: DayView
  // The latest check-in's targets, with this weekday's kcal (decision 0033), shown on today
  // only; null before the first, undefined while loading.
  targets?: DailyTargets | null | undefined
  locale: string
  onAdd: (meal: Meal) => void
  onCopy: (meal: Meal) => void
  onOpenEntry: (entry: LoggedEntry) => void
  onSetComplete: (complete: boolean) => Promise<void>
}

export const dayTitle = (date: string, today: string, locale: string): string => {
  if (date === today) return strings.log.today
  if (date === addDays(today, -1)) return strings.log.yesterday
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric' }).format(
    new Date(year, month - 1, day),
  )
}

const dayHref = (date: string, today: string) =>
  routeHref({ tab: 'log', screen: 'log', date: date === today ? null : date })

export const LogDay = ({
  date,
  today,
  day,
  targets,
  locale,
  onAdd,
  onCopy,
  onOpenEntry,
  onSetComplete,
}: Props) => {
  const text = strings.log
  const completeId = useId()
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  // Shows the choice at once; the stored value catches up after the local write, and a change
  // synced from another device replaces it.
  const [complete, setCompleteShown] = useState(day.complete)
  useEffect(() => setCompleteShown(day.complete), [day.complete])
  const allEntries = meals.flatMap((meal) => day.byMeal[meal])

  const setComplete = async (value: boolean) => {
    setCompleteShown(value)
    setSaving(true)
    setFailed(false)
    try {
      await onSetComplete(value)
    } catch {
      setCompleteShown(day.complete)
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        {date > EARLIEST_DAY ? (
          <a
            href={dayHref(addDays(date, -1), today)}
            className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 font-medium"
          >
            {text.previousDay}
          </a>
        ) : (
          // Keeps the title centred where there's no earlier day to go to.
          <span aria-hidden="true" className="invisible px-3">
            {text.previousDay}
          </span>
        )}
        <h2 className="text-center text-lg font-semibold">{dayTitle(date, today, locale)}</h2>
        <a
          href={dayHref(addDays(date, 1), today)}
          className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 font-medium"
        >
          {text.nextDay}
        </a>
      </div>

      <div className="flex flex-col gap-2">
        <p className="rounded-lg bg-surface p-3">
          <span className="text-muted">{text.dayTotal} </span>
          <span className="font-semibold">
            {macroText(day.total, locale, allEntries.length === 0)}
          </span>
        </p>
        {missingCarbsOrFat(allEntries) && (
          <p className="text-sm text-muted">{text.missingCarbsOrFat}</p>
        )}
        {/* The targets are the latest check-in's, so only today is measured against them. */}
        {date === today && targets !== undefined && (
          <TargetProgress total={day.total} targets={targets} locale={locale} />
        )}
      </div>

      {meals.map((meal) => {
        const name = text.meals[meal]
        const entries = day.byMeal[meal]
        return (
          <section key={meal} aria-label={name} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-lg font-semibold">{name}</h3>
              <span className="text-sm text-muted">
                {macroText(day.mealTotals[meal], locale, entries.length === 0)}
              </span>
            </div>
            {entries.length === 0 ? (
              <p className="text-muted">{text.emptyMeal}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border border-y border-border">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => onOpenEntry(entry)}
                      className="flex min-h-14 w-full flex-col items-start justify-center py-2 text-left"
                    >
                      <span className="font-medium">{entry.name}</span>
                      <span className="text-sm text-muted">
                        {text.entryDetail(
                          text.servings(formatAmount(entry.servings, locale), entry.servings === 1),
                          macroText(entry, locale),
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                aria-label={text.addTo(name)}
                onClick={() => onAdd(meal)}
                className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-text"
              >
                {text.add}
              </button>
              <button
                type="button"
                aria-label={text.copyFromLabel(name)}
                onClick={() => onCopy(meal)}
                className="min-h-11 rounded-lg border border-border px-4 font-medium"
              >
                {text.copyFrom}
              </button>
            </div>
          </section>
        )
      })}

      <div className="flex flex-col gap-1">
        <label htmlFor={completeId} className="flex min-h-11 items-center gap-3 font-medium">
          <input
            id={completeId}
            type="checkbox"
            checked={complete}
            disabled={saving}
            onChange={(event) => void setComplete(event.target.checked)}
            className="size-5 accent-accent"
          />
          {text.complete}
        </label>
        <p className="text-sm text-muted">{text.completeHint}</p>
        {failed && (
          <p role="alert" className="text-danger">
            {text.completeFailed}
          </p>
        )}
      </div>
    </div>
  )
}
