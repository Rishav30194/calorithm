// Soft-deleted rows are removed from the server for good after this many days.
export const RETENTION_DAYS = 90

const DAY_MS = 86_400_000

// A device that hasn't pulled within the retention window may have missed deletes that the
// server has since erased, so it must clear its tables and pull everything again.
export const needsFullResync = (lastPullAt: number | null, now: number): boolean =>
  lastPullAt === null || now - lastPullAt > RETENTION_DAYS * DAY_MS
