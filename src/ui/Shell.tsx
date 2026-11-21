import { type ReactNode, useState } from 'react'

import type { SignOutControls } from '@/data/DataProvider'
import { strings } from '@/strings'

import { DeleteAccountDialog } from './DeleteAccountDialog'
import { type FoodRoute, hrefFor, type Route, type Tab, tabs, useRoute } from './routes'
import { SignOutDialog } from './SignOutDialog'

type Props = {
  email: string
  signOut: SignOutControls
  // Filled by the signed-in app with live sync state; empty in tests of the shell alone.
  badge?: ReactNode
  settings?: ReactNode
  // The food and recipe screens, loaded on demand by the signed-in app.
  foodScreens?: (route: FoodRoute) => ReactNode
  // The day's log; a date of null is today.
  logScreen?: (date: string | null) => ReactNode
  weightScreen?: ReactNode
  checkinScreen?: ReactNode
}

const Settings = ({ email, signOut, settings }: Props) => {
  const { state } = signOut
  const busy = state.step === 'syncing' || state.step === 'deleting'
  const [deleting, setDeleting] = useState(false)
  return (
    <div className="flex flex-col gap-6">
      {settings}
      <p>
        <span className="text-muted">{strings.settings.signedInAs} </span>
        <span className="font-medium">{email}</span>
      </p>
      {state.step === 'failed' && (
        <p role="alert" className="text-danger">
          {strings.settings.signOutFailed}
        </p>
      )}
      <button
        type="button"
        onClick={() => void signOut.start()}
        disabled={busy}
        className="min-h-11 self-start rounded-lg border border-border px-4 font-medium disabled:opacity-60"
      >
        {busy ? strings.settings.signingOut : strings.settings.signOut}
      </button>
      <button
        type="button"
        onClick={() => setDeleting(true)}
        disabled={busy}
        className="min-h-11 self-start rounded-lg border border-border px-4 font-medium text-danger disabled:opacity-60"
      >
        {strings.deleteAccount.open}
      </button>
      {deleting && (
        <DeleteAccountDialog
          email={email}
          onDelete={signOut.deleteAccount}
          onClose={() => setDeleting(false)}
        />
      )}
      {state.step === 'confirm' && (
        <SignOutDialog
          count={state.count}
          onExport={signOut.unsentFile}
          onConfirm={signOut.confirm}
          onCancel={signOut.cancel}
        />
      )}
    </div>
  )
}

const screen = (route: Route, props: Props) => {
  switch (route.screen) {
    case 'log':
      return props.logScreen?.(route.date) ?? null
    case 'foods':
    case 'recipes':
    case 'food':
    case 'recipe':
      return props.foodScreens?.(route) ?? null
    case 'weight':
      return props.weightScreen ?? null
    case 'checkin':
      return props.checkinScreen ?? null
    case 'settings':
      return <Settings {...props} />
  }
}

export const Shell = (props: Props) => {
  const route = useRoute()
  const tab: Tab = route.tab
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 [.update-banner_&]:pt-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">{strings.tabs[tab]}</h1>
          {props.badge}
        </div>
      </header>
      <main className="flex-1 px-4 py-4 pb-24">{screen(route, props)}</main>
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
