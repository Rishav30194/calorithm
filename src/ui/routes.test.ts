import { describe, expect, it } from 'vitest'

import { hrefFor, parseRoute, parseTab, type Route, routeHref, tabs } from './routes'

describe('parseTab', () => {
  it('reads each tab from its hash', () => {
    for (const tab of tabs) {
      expect(parseTab(hrefFor(tab))).toBe(tab)
    }
  })

  it('falls back to the log for an empty or unknown hash', () => {
    expect(parseTab('')).toBe('log')
    expect(parseTab('#/')).toBe('log')
    expect(parseTab('#/nowhere')).toBe('log')
  })

  it('ignores a trailing slash and a query', () => {
    expect(parseTab('#/weight/')).toBe('weight')
    expect(parseTab('#/settings?x=1')).toBe('settings')
  })
})

describe('parseRoute', () => {
  const id = 'f0000000-0000-4000-8000-000000000001'

  it('reads the food and recipe screens under the log tab', () => {
    expect(parseRoute('#/log')).toEqual({ tab: 'log', screen: 'log' })
    expect(parseRoute('#/log/foods')).toEqual({ tab: 'log', screen: 'foods' })
    expect(parseRoute('#/log/foods/new')).toEqual({ tab: 'log', screen: 'food', id: null })
    expect(parseRoute(`#/log/foods/${id}`)).toEqual({ tab: 'log', screen: 'food', id })
    expect(parseRoute('#/log/recipes')).toEqual({ tab: 'log', screen: 'recipes' })
    expect(parseRoute('#/log/recipes/new')).toEqual({ tab: 'log', screen: 'recipe', id: null })
    expect(parseRoute(`#/log/recipes/${id}`)).toEqual({ tab: 'log', screen: 'recipe', id })
  })

  it('round-trips every route through its href', () => {
    const routes: Route[] = [
      { tab: 'log', screen: 'log' },
      { tab: 'log', screen: 'foods' },
      { tab: 'log', screen: 'food', id: null },
      { tab: 'log', screen: 'food', id },
      { tab: 'log', screen: 'recipes' },
      { tab: 'log', screen: 'recipe', id: null },
      { tab: 'log', screen: 'recipe', id },
      { tab: 'weight', screen: 'weight' },
      { tab: 'checkin', screen: 'checkin' },
      { tab: 'settings', screen: 'settings' },
    ]
    for (const route of routes) expect(parseRoute(routeHref(route))).toEqual(route)
  })

  it('treats an id that isn’t a UUID as an unknown screen', () => {
    expect(parseRoute('#/log/foods/<script>')).toEqual({ tab: 'log', screen: 'log' })
    expect(parseRoute('#/log/elsewhere')).toEqual({ tab: 'log', screen: 'log' })
  })
})
