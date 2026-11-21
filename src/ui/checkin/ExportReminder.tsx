import type { ExportReminder as Reminder } from '@/domain/backup'
import { strings } from '@/strings'

import { longDate } from '../dates'
import { routeHref } from '../routes'

type Props = { reminder: Reminder; locale: string }

export const ExportReminder = ({ reminder, locale }: Props) => {
  const text = strings.exportReminder
  return (
    <aside
      aria-label={strings.backup.title}
      className="flex flex-col gap-2 rounded-lg border border-border p-3"
    >
      <p>
        {reminder.kind === 'never'
          ? text.never
          : text.stale(longDate(reminder.lastExportDay, locale))}
      </p>
      <a
        href={routeHref({ tab: 'settings', screen: 'settings' })}
        className="inline-flex min-h-11 items-center self-start rounded-lg border border-border px-4 font-medium"
      >
        {text.link}
      </a>
    </aside>
  )
}
