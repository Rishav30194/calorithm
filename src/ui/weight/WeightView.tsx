import { useMemo, useState } from 'react'

import type { SetWeighInResult } from '@/data/weights'
import { addDays } from '@/domain/dates'
import { formatWeight } from '@/domain/format'
import { trend, trendChange, type WeighIn } from '@/domain/trend'
import { fromKg, type WeightUnit } from '@/domain/weight'
import { strings } from '@/strings'

import { formatDay } from './days'
import { EditWeighIn } from './EditWeighIn'
import { WeighInForm } from './WeighInForm'
import { WeightChart } from './WeightChart'

// The chart and table show the 90 days ending today.
export const WINDOW_DAYS = 90

type Props = {
  today: string
  unit: WeightUnit
  locale: string
  // Oldest first.
  weighIns: readonly WeighIn[]
  onSave: (weighIn: WeighIn) => Promise<SetWeighInResult>
  onRemove: (date: string) => Promise<void>
}

const changeText = (kg: number, unit: WeightUnit, locale: string): string => {
  // Compared as shown, so a change that rounds to 0.0 reads as no change.
  const shown = Math.round(fromKg(Math.abs(kg), unit) * 10) / 10
  if (shown === 0) return strings.weight.steady
  const amount = formatWeight(Math.abs(kg), unit, locale)
  return kg < 0 ? strings.weight.down(amount) : strings.weight.up(amount)
}

export const WeightView = ({ today, unit, locale, weighIns, onSave, onRemove }: Props) => {
  const text = strings.weight
  const [editing, setEditing] = useState<WeighIn | null>(null)
  const from = addDays(today, -(WINDOW_DAYS - 1))
  const points = useMemo(() => trend(weighIns, from, today), [weighIns, from, today])
  const savedDays = useMemo(() => new Set(weighIns.map((weighIn) => weighIn.date)), [weighIns])
  const latest = points.at(-1)
  const change = trendChange(points, today, 7)
  const recent = points.filter((point) => point.weighInKg !== null).reverse()

  return (
    <div className="flex flex-col gap-6">
      {latest ? (
        <div className="rounded-lg bg-surface p-3">
          <p className="text-2xl font-semibold">
            {text.trend(formatWeight(latest.trendKg, unit, locale))}
          </p>
          {change !== null && <p className="text-muted">{changeText(change, unit, locale)}</p>}
        </div>
      ) : (
        <p className="text-muted">{weighIns.length === 0 ? text.empty : text.noneRecent}</p>
      )}

      <WeighInForm
        today={today}
        unit={unit}
        locale={locale}
        savedDays={savedDays}
        onSave={onSave}
      />

      <WeightChart points={points} from={from} to={today} unit={unit} locale={locale} />

      {recent.length > 0 && (
        <section className="flex flex-col gap-2">
          <table className="w-full text-left">
            <caption className="mb-2 text-left text-lg font-semibold">{text.history}</caption>
            <thead className="text-sm text-muted">
              <tr>
                <th scope="col" className="py-1 font-medium">
                  {text.date}
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  {text.weight(unit)}
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  {text.trendColumn}
                </th>
              </tr>
            </thead>
            <tbody>
              {recent.map((point) => {
                const day = formatDay(point.date, locale)
                const kg = point.weighInKg ?? 0
                return (
                  <tr key={point.date} className="border-t border-border">
                    <th scope="row" className="font-normal">
                      <button
                        type="button"
                        aria-label={text.edit(day)}
                        onClick={() => setEditing({ date: point.date, kg })}
                        className="min-h-11 w-full text-left underline underline-offset-4"
                      >
                        {day}
                      </button>
                    </th>
                    <td className="text-right tabular-nums">{formatWeight(kg, unit, locale)}</td>
                    <td className="text-right tabular-nums text-muted">
                      {formatWeight(point.trendKg, unit, locale)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      {editing && (
        <EditWeighIn
          weighIn={editing}
          today={today}
          unit={unit}
          locale={locale}
          onSave={onSave}
          onRemove={onRemove}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
