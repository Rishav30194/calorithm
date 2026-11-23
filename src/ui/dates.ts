// A YYYY-MM-DD day as a long local date, such as "21 November 2026". Built from the parts so
// the device's time zone never moves it to another day.
export const longDate = (date: string, locale: string): string => {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(
    new Date(year, month - 1, day),
  )
}

// A moment, such as an export time, as the long local date it fell on.
export const longMoment = (iso: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(iso))

// The days of the week, Monday first, in the locale's words. 2024-01-01 was a Monday; built
// from local parts, like longDate, so no time zone moves a day.
export const weekdayNames = (locale: string, width: 'long' | 'short' = 'long'): string[] =>
  [0, 1, 2, 3, 4, 5, 6].map((offset) =>
    new Intl.DateTimeFormat(locale, { weekday: width }).format(new Date(2024, 0, 1 + offset)),
  )
