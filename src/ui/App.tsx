import { useAuth } from '@/data/auth'
import { type Env, parseEnv } from '@/data/env'
import { strings } from '@/strings'

import { Shell } from './Shell'
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

const Configured = ({ env }: { env: Env }) => {
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
      return <Shell email={session.email} onSignOut={signOut} />
  }
}

export const App = () =>
  env.ok ? <Configured env={env.env} /> : <ConfigError invalid={env.invalid} />
