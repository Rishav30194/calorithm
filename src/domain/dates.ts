// Calendar days as YYYY-MM-DD strings, the device's local day. The arithmetic runs in UTC,
// where every day is 24 hours, so daylight-saving changes never skip or repeat a day.
const DAY_MS = 86_400_000

// The earliest date the database accepts for a day, log entry, or weigh-in.
export const EARLIEST_DAY = '2000-01-01'

const toUtc = (day: string): number => {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number)
  return Date.UTC(year, month - 1, date)
}

const fromUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

export const addDays = (day: string, days: number): string => fromUtc(toUtc(day) + days * DAY_MS)

// Calendar days from `from` to `to`: negative when `to` is earlier.
export const daysBetween = (from: string, to: string): number =>
  Math.round((toUtc(to) - toUtc(from)) / DAY_MS)

// A real calendar day in YYYY-MM-DD form; 2027-02-29 is not one.
export const isDay = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && fromUtc(toUtc(value)) === value

// The day of the week, from Monday as 0 to Sunday as 6.
export const weekdayOf = (day: string): number => (new Date(toUtc(day)).getUTCDay() + 6) % 7
