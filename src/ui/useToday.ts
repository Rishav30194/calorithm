import { lightFormat } from 'date-fns'
import { useEffect, useState } from 'react'

const localDay = (): string => lightFormat(new Date(), 'yyyy-MM-dd')

// The device's local calendar day. It moves on at midnight and when the app comes back to the
// foreground, since a phone may sleep through midnight with the app open.
export const useToday = (): string => {
  const [today, setToday] = useState(localDay)

  useEffect(() => {
    const refresh = () => setToday(localDay())
    // The local midnight that ends the current day; the timer is set again for each new day.
    const [year = 0, month = 1, day = 1] = today.split('-').map(Number)
    const midnight = new Date(year, month - 1, day + 1)
    const timer = setTimeout(refresh, Math.max(0, midnight.getTime() - Date.now()) + 1_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [today])

  return today
}
