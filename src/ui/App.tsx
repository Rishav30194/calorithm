import { useAuth } from '@/data/auth'
import { DataProvider } from '@/data/DataProvider'
import { type Env, parseEnv } from '@/data/env'
import { strings } from '@/strings'

import { usePwaUpdate } from './pwa'
import { SignedIn } from './SignedIn'
import { SignIn } from './SignIn'

const env = parseEnv(import.meta.env)

const ConfigError = ({ invalid }: { invalid: string[] }) => (
  <main className="mx-auto max-w-sm px-4 py-8">
    <h1 className="mb-2 text-xl font-semibold">{strings.configError.title}</h1>
    <p className="mb-2">{strings.configError.body}</p>
    <ul className="list-disc pl-6">
      {invalid.map((name) => (
        <li key={name}>
          <code>{name}</code>
        </li>
      ))}
    </ul>
  </main>
)

const Configured = ({ env, onUpdate }: { env: Env; onUpdate: () => Promise<void> }) => {
  const { session, signIn, signOut } = useAuth(env)
  switch (session.status) {
    case 'loading':
      return (
        <main className="flex min-h-dvh items-center justify-center text-muted">
          {strings.loading}
        </main>
      )
    case 'signed_out':
      return <SignIn onSignIn={signIn} />
    case 'signed_in':
      // Keyed by user, so a different user always gets a fresh database and engine.
      return (
        <DataProvider key={session.userId} env={env} userId={session.userId}>
          <SignedIn email={session.email} onSignOut={signOut} onUpdate={onUpdate} />
        </DataProvider>
      )
  }
}

export const App = () => {
  // Registers the service worker on every screen, signed in or not.
  const update = usePwaUpdate()
  return env.ok ? (
    <Configured env={env.env} onUpdate={update} />
  ) : (
    <ConfigError invalid={env.invalid} />
  )
}
