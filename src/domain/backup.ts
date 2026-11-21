import { daysBetween } from './dates'

// PLAN.md, "Features": the check-in screen reminds you once the last export is older than this.
export const EXPORT_REMINDER_DAYS = 30

export type ExportReminder = { kind: 'never' } | { kind: 'stale'; lastExportDay: string }

type Input = {
  lastExportDay: string | null
  // The oldest day with data on this device; null when there's none.
  firstDataDay: string | null
  today: string
}

// Null when no reminder is due. A device that never exported counts from its oldest data,
// so a new user isn't asked to back up an empty log.
export const exportReminder = ({
  lastExportDay,
  firstDataDay,
  today,
}: Input): ExportReminder | null => {
  const since = lastExportDay ?? firstDataDay
  if (since === null || daysBetween(since, today) <= EXPORT_REMINDER_DAYS) return null
  return lastExportDay === null ? { kind: 'never' } : { kind: 'stale', lastExportDay }
}
