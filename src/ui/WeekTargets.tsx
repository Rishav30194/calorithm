import { Fragment } from 'react'

import { formatKcal } from '@/domain/format'

import { weekdayNames } from './dates'

type Props = { kcal: readonly number[]; locale: string }

// A week's kcal targets, Monday to Sunday, as the check-in summary lays out its targets.
export const WeekTargets = ({ kcal, locale }: Props) => {
  const names = weekdayNames(locale, 'short')
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {kcal.map((value, weekday) => (
        <Fragment key={names[weekday]}>
          <dt className="text-muted">{names[weekday]}</dt>
          <dd className="font-semibold">{formatKcal(value, locale)}</dd>
        </Fragment>
      ))}
    </dl>
  )
}
