import { describe, expect, it } from 'vitest'

import { hrefFor, parseTab, tabs } from './routes'

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
