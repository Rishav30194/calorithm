import type { ReactNode } from 'react'

import type { SignOutControls } from '@/data/DataProvider'
import { strings } from '@/strings'

import { type FoodRoute, hrefFor, type Route, routeHref, type Tab, tabs, useRoute } from './routes'
import { SignOutDialog } from './SignOutDialog'

type Props = {
  email: string
  signOut: SignOutControls
  // Filled by the signed-in app with live sync state; empty in tests of the shell alone.
  badge?: ReactNode
  settings?: ReactNode
  // The food and recipe screens, loaded on demand by the signed-in app.
  foodScreens?: (route: FoodRoute) => ReactNode
}

const ComingSoon = ({ text }: { text: string }) => <p className="text-muted">{text}</p>

const Settings = ({ email, signOut, settings }: Props) => {
  const { state } = signOut
  const busy = state.step === 'syncing' || state.step === 'deleting'
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

const LogHome = () => (
  <div className="flex flex-col gap-4">
    <nav aria-label={strings.logLinks.label} className="flex gap-3">
      <a
        href={routeHref({ tab: 'log', screen: 'foods' })}
        className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 font-medium"
      >
        {strings.logLinks.foods}
      </a>
      <a
        href={routeHref({ tab: 'log', screen: 'recipes' })}
        className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 font-medium"
      >
        {strings.logLinks.recipes}
      </a>
    </nav>
    <ComingSoon text={strings.comingSoon.log} />
  </div>
)

const screen = (route: Route, props: Props) => {
  switch (route.screen) {
    case 'log':
      return <LogHome />
    case 'foods':
    case 'recipes':
    case 'food':
    case 'recipe':
      return props.foodScreens?.(route) ?? null
    case 'weight':
      return <ComingSoon text={strings.comingSoon.weight} />
    case 'checkin':
      return <ComingSoon text={strings.comingSoon.checkin} />
    case 'settings':
      return <Settings {...props} />
  }
}

export const Shell = (props: Props) => {
  const route = useRoute()
  const tab: Tab = route.tab
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
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
