// A YYYY-MM-DD day as a short local date, such as "Sat 21 Nov". Built from the parts so the
// device's time zone never moves it to another day.
export const formatDay = (date: string, locale: string): string => {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(year, month - 1, day))
}
