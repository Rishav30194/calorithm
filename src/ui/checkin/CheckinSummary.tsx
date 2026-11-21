import type { CheckinFields } from '@/domain/checkin'
import { formatKcal, formatProtein, formatWeight } from '@/domain/format'
import type { WeightUnit } from '@/domain/weight'
import { strings } from '@/strings'

type Props = { checkin: CheckinFields; unit: WeightUnit; locale: string }

const estimateChange = (checkin: CheckinFields, locale: string): string => {
  const text = strings.checkin
  const previous = checkin.previousMaintenanceKcal
  if (previous === null) return text.first
  const from = formatKcal(previous, locale)
  const change = checkin.maintenanceKcal - previous
  if (change === 0) return text.unchanged(from)
  const amount = formatKcal(Math.abs(change), locale)
  return change > 0 ? text.up(amount, from) : text.down(amount, from)
}

const trendChange = (kg: number, unit: WeightUnit, locale: string): string => {
  const text = strings.checkin
  const amount = formatWeight(Math.abs(kg), unit, locale)
  // Shown with one decimal, so a change that rounds to zero reads as unchanged.
  if (amount === formatWeight(0, unit, locale)) return text.trendFlat
  return kg < 0 ? text.trendDown(amount) : text.trendUp(amount)
}

const howEstimated = (checkin: CheckinFields, unit: WeightUnit, locale: string): string => {
  const { completeDaysInWindow, windowDays, trendChangeKg } = checkin
  if (completeDaysInWindow === null || windowDays === null || trendChangeKg === null) {
    return strings.checkin.formula
  }
  return strings.checkin.adaptive(
    completeDaysInWindow,
    windowDays,
    trendChange(trendChangeKg, unit, locale),
  )
}

// A check-in's estimate, how it changed and was made, its targets, and any limit applied; or,
// for a skipped week, why the targets stayed the same.
export const CheckinSummary = ({ checkin, unit, locale }: Props) => {
  const text = strings.checkin
  return (
    <div className="flex flex-col gap-4">
      {checkin.status === 'skipped' ? (
        <p className="rounded-lg bg-surface p-3">{text.skipped(checkin.completeDaysInWeek)}</p>
      ) : (
        <section aria-label={text.estimate} className="flex flex-col gap-1">
          <h3 className="font-semibold">{text.estimate}</h3>
          <p className="text-2xl font-semibold">
            {text.perDay(formatKcal(checkin.maintenanceKcal, locale))}
          </p>
          <p>{estimateChange(checkin, locale)}</p>
          <p className="text-sm text-muted">{howEstimated(checkin, unit, locale)}</p>
        </section>
      )}
      <section aria-label={text.targets} className="flex flex-col gap-2">
        <h3 className="font-semibold">{text.targets}</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted">{text.kcalTarget}</dt>
          <dd className="font-semibold">{formatKcal(checkin.kcalTarget, locale)}</dd>
          <dt className="text-muted">{text.proteinTarget}</dt>
          <dd className="font-semibold">{formatProtein(checkin.proteinTargetG, locale)}</dd>
        </dl>
        {checkin.floorApplied && (
          <p>{text.floorApplied(formatKcal(checkin.calorieFloorKcal, locale))}</p>
        )}
        {checkin.rateCapped && (
          <p>
            {text.rateCapped(
              formatWeight(Math.abs(checkin.goalRateAppliedKgPerWeek), unit, locale),
            )}
          </p>
        )}
      </section>
    </div>
  )
}
