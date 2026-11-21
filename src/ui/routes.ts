import { useEffect, useState } from 'react'
import { z } from 'zod/mini'

import { isDay } from '@/domain/dates'

// Hash routes (#/weight): GitHub Pages serves one file, so a refresh on any screen still works.
export const tabs = ['log', 'weight', 'checkin', 'settings'] as const

export type Tab = (typeof tabs)[number]

// Food and recipe screens sit under the log tab. An id of null is a new row.
export type FoodRoute =
  | { tab: 'log'; screen: 'foods' | 'recipes' }
  | { tab: 'log'; screen: 'food' | 'recipe'; id: string | null }

export type Route =
  // A date of null is today, read from the device when shown.
  | { tab: 'log'; screen: 'log'; date: string | null }
  | FoodRoute
  | { tab: 'weight'; screen: 'weight' }
  | { tab: 'checkin'; screen: 'checkin' }
  | { tab: 'settings'; screen: 'settings' }

const tabSchema = z.enum(tabs)
const idSchema = z.uuid()

const segmentsOf = (hash: string): string[] =>
  (hash.replace(/^#\/?/, '').split('?')[0] ?? '').split('/').filter((part) => part !== '')

const parseEditor = (screen: 'food' | 'recipe', id: string | undefined): Route | null => {
  if (id === undefined) return null
  if (id === 'new') return { tab: 'log', screen, id: null }
  return idSchema.safeParse(id).success ? { tab: 'log', screen, id } : null
}

const parseLog = ([list, id]: string[]): Route => {
  const fallback: Route = { tab: 'log', screen: 'log', date: null }
  switch (list) {
    case 'day':
      return id !== undefined && isDay(id) ? { tab: 'log', screen: 'log', date: id } : fallback
    case 'foods':
      return id === undefined
        ? { tab: 'log', screen: 'foods' }
        : (parseEditor('food', id) ?? fallback)
    case 'recipes':
      return id === undefined
        ? { tab: 'log', screen: 'recipes' }
        : (parseEditor('recipe', id) ?? fallback)
    default:
      return fallback
  }
}

export const parseRoute = (hash: string): Route => {
  const [first, ...rest] = segmentsOf(hash)
  const parsed = tabSchema.safeParse(first)
  const tab = parsed.success ? parsed.data : 'log'
  switch (tab) {
    case 'log':
      return parseLog(rest)
    case 'weight':
      return { tab, screen: 'weight' }
    case 'checkin':
      return { tab, screen: 'checkin' }
    case 'settings':
      return { tab, screen: 'settings' }
  }
}

export const routeHref = (route: Route): string => {
  switch (route.screen) {
    case 'foods':
      return '#/log/foods'
    case 'recipes':
      return '#/log/recipes'
    case 'food':
      return `#/log/foods/${route.id ?? 'new'}`
    case 'recipe':
      return `#/log/recipes/${route.id ?? 'new'}`
    case 'log':
      return route.date ? `#/log/day/${route.date}` : '#/log'
    default:
      return `#/${route.tab}`
  }
}

export const hrefFor = (tab: Tab): string => `#/${tab}`

export const parseTab = (hash: string): Tab => parseRoute(hash).tab

export const useRoute = (): Route => {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}

export const useTab = (): Tab => useRoute().tab
