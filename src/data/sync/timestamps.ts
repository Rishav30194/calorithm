import type { Cursor } from '../db'

// updated_at is the transaction's start time, so a slow transaction can commit after a pull
// has passed it. Starting each pull a minute early catches it; rows read twice are harmless.
const OVERLAP_MS = 60_000

const timestampPattern =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)$/

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Rewrites a Postgres timestamp into the one format every JavaScript engine must parse
// (YYYY-MM-DDTHH:mm:ss.sss±HH:mm), since engines may reject microseconds or a short offset.
// Anything else is null, so text that isn't a timestamp can never reach a query filter.
export const normalizeTimestamp = (timestamp: string): string | null => {
  const match = timestampPattern.exec(timestamp)
  if (!match) return null
  const [, date, time, fraction = '', offset = 'Z'] = match
  const millis = fraction.padEnd(3, '0').slice(0, 3)
  const zone =
    offset === 'Z'
      ? 'Z'
      : `${offset.slice(0, 3)}:${offset.slice(3).replace(':', '').padEnd(2, '0')}`
  return `${date}T${time}.${millis}${zone}`
}

// The start of an incremental pull, one minute before the cursor. Dropping microseconds only
// moves it slightly earlier, which is safe; the cursor itself stays the exact Postgres text.
// Null when the timestamp isn't a real time, which makes the pull start from the beginning.
export const overlapStart = (updatedAt: string): string | null => {
  const iso = normalizeTimestamp(updatedAt)
  const millis = iso === null ? Number.NaN : Date.parse(iso)
  if (Number.isNaN(millis)) return null
  return new Date(millis - OVERLAP_MS).toISOString()
}

export const isUuid = (value: string): boolean => uuidPattern.test(value)

// A cursor is safe to save and to put in a query filter only when both parts are well formed.
export const isCursor = (cursor: Cursor): boolean =>
  isUuid(cursor.id) && overlapStart(cursor.updatedAt) !== null
