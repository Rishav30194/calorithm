import { useEffect, useState } from 'react'

// Hash routes (#/weight): GitHub Pages serves one file, so a refresh on any screen still works.
export const tabs = ['log', 'weight', 'checkin', 'settings'] as const

export type Tab = (typeof tabs)[number]

const isTab = (value: string): value is Tab => (tabs as readonly string[]).includes(value)

export const hrefFor = (tab: Tab): string => `#/${tab}`

export const parseTab = (hash: string): Tab => {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? ''
  return isTab(name) ? name : 'log'
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
