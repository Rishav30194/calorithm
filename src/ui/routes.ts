import { useEffect, useState } from 'react'
import { z } from 'zod/mini'

// Hash routes (#/weight): GitHub Pages serves one file, so a refresh on any screen still works.
export const tabs = ['log', 'weight', 'checkin', 'settings'] as const

export type Tab = (typeof tabs)[number]

const tabSchema = z.enum(tabs)

export const hrefFor = (tab: Tab): string => `#/${tab}`

export const parseTab = (hash: string): Tab => {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  const parsed = tabSchema.safeParse(name)
  return parsed.success ? parsed.data : 'log'
}

export const useTab = (): Tab => {
  const [tab, setTab] = useState<Tab>(() => parseTab(window.location.hash))

  useEffect(() => {
    const onChange = () => setTab(parseTab(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return tab
}
