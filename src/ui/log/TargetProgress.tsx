import { formatKcal, formatProtein } from '@/domain/format'
import type { Nutrients } from '@/domain/nutrition'
import { strings } from '@/strings'

import { routeHref } from '../routes'

type Props = { total: Nutrients; targets: Nutrients | null; locale: string }

// The bar repeats the text beside it, so it's hidden from screen readers.
const Bar = ({ label, text, share }: { label: string; text: string; share: number }) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-baseline justify-between gap-2">
      <span className="font-medium">{label}</span>
      <span>{text}</span>
    </div>
    <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-border">
      <div
        className="h-full rounded-full bg-accent"
        style={{ width: `${Math.min(100, Math.max(0, share * 100))}%` }}
      />
    </div>
  </div>
)

// The day's intake against the latest check-in's targets, or a pointer to the check-in.
export const TargetProgress = ({ total, targets, locale }: Props) => {
  const text = strings.targets
  if (targets === null) {
    return (
      <p className="text-muted">
        {text.none}{' '}
        <a
          href={routeHref({ tab: 'checkin', screen: 'checkin' })}
          className="font-medium text-text underline"
        >
          {text.goToCheckin}
        </a>
      </p>
    )
  }
  return (
    <section aria-label={text.title} className="flex flex-col gap-3 rounded-lg bg-surface p-3">
      <Bar
        label={strings.checkin.kcalTarget}
        text={text.progress(formatKcal(total.kcal, locale), formatKcal(targets.kcal, locale))}
        share={total.kcal / targets.kcal}
      />
      <Bar
        label={strings.checkin.proteinTarget}
        text={text.progress(
          formatProtein(total.proteinG, locale),
          formatProtein(targets.proteinG, locale),
        )}
        share={total.proteinG / targets.proteinG}
      />
    </section>
  )
}
