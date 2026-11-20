import { type ReactNode, useState } from 'react'

import type { SignOutResult } from '@/data/auth'
import { strings } from '@/strings'

import { hrefFor, type Tab, tabs, useTab } from './routes'

type Props = {
  email: string
  onSignOut: () => Promise<SignOutResult>
  // Filled by the signed-in app with live sync state; empty in tests of the shell alone.
  badge?: ReactNode
  settings?: ReactNode
}

const ComingSoon = ({ text }: { text: string }) => <p className="text-muted">{text}</p>

const Settings = ({ email, onSignOut, settings }: Props) => {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const signOut = async () => {
    setPending(true)
    setFailed(false)
    // On success the session listener swaps this screen out, so only failure needs handling.
    const result = await onSignOut()
    setPending(false)
    setFailed(!result.ok)
  }
  return (
    <div className="flex flex-col gap-6">
      {settings}
      <p>
        <span className="text-muted">{strings.settings.signedInAs} </span>
        <span className="font-medium">{email}</span>
      </p>
      {failed && (
        <p role="alert" className="text-danger">
          {strings.settings.signOutFailed}
        </p>
      )}
      <button
        type="button"
        onClick={signOut}
        disabled={pending}
        className="min-h-11 self-start rounded-lg border border-border px-4 font-medium disabled:opacity-60"
      >
        {pending ? strings.settings.signingOut : strings.settings.signOut}
      </button>
    </div>
  )
}

const screen = (tab: Tab, props: Props) => {
  switch (tab) {
    case 'log':
      return <ComingSoon text={strings.comingSoon.log} />
    case 'weight':
      return <ComingSoon text={strings.comingSoon.weight} />
    case 'checkin':
      return <ComingSoon text={strings.comingSoon.checkin} />
    case 'settings':
      return <Settings {...props} />
  }
}

export const Shell = (props: Props) => {
  const tab = useTab()
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">{strings.tabs[tab]}</h1>
          {props.badge}
        </div>
      </header>
      <main className="flex-1 px-4 py-4 pb-24">{screen(tab, props)}</main>
      <nav
        aria-label={strings.navigation}
        className="fixed inset-x-0 bottom-0 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-4">
          {tabs.map((name) => (
            <li key={name}>
              <a
                href={hrefFor(name)}
                aria-current={name === tab ? 'page' : undefined}
                className="flex min-h-14 items-center justify-center text-sm text-muted aria-[current=page]:font-semibold aria-[current=page]:text-accent"
              >
                {strings.tabs[name]}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
