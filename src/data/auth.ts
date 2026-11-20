import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js'
import { useEffect, useMemo, useState } from 'react'

import type { Env } from './env'
import { type Client, getClient } from './supabase'

export type SignInFailure = 'invalid_credentials' | 'rate_limited' | 'network' | 'unknown'

export type SignInResult = { ok: true } | { ok: false; failure: SignInFailure }

export type SessionState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; userId: string; email: string }

export const toSignInFailure = (error: unknown): SignInFailure => {
  if (isAuthRetryableFetchError(error)) return 'network'
  if (isAuthApiError(error)) {
    if (error.code === 'invalid_credentials') return 'invalid_credentials'
    if (error.status === 429) return 'rate_limited'
  }
  return 'unknown'
}

export const signIn = async (
  client: Client,
  email: string,
  password: string,
): Promise<SignInResult> => {
  try {
    const { error } = await client.auth.signInWithPassword({ email, password })
    return error ? { ok: false, failure: toSignInFailure(error) } : { ok: true }
  } catch (error) {
    return { ok: false, failure: toSignInFailure(error) }
  }
}

export type SignOutResult = { ok: boolean }

// Takes only what it uses, so tests pass a small fake instead of a whole client.
type SignOutClient = { auth: Pick<Client['auth'], 'signOut'> }

export const signOut = async (client: SignOutClient): Promise<SignOutResult> => {
  try {
    // scope 'local' signs out this device only; other devices keep their sessions.
    const { error } = await client.auth.signOut({ scope: 'local' })
    return { ok: error === null }
  } catch {
    return { ok: false }
  }
}

export const useSession = (client: Client): SessionState => {
  const [state, setState] = useState<SessionState>({ status: 'loading' })

  useEffect(() => {
    // Fires right away with the stored session (INITIAL_SESSION), then on every sign-in,
    // sign-out, and token refresh.
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setState(
        session
          ? { status: 'signed_in', userId: session.user.id, email: session.user.email ?? '' }
          : { status: 'signed_out' },
      )
    })
    return () => data.subscription.unsubscribe()
  }, [client])

  return state
}

export type Auth = {
  session: SessionState
  signIn: (email: string, password: string) => Promise<SignInResult>
  signOut: () => Promise<SignOutResult>
}

// The interface's only way in: screens get session state and actions, never the client.
export const useAuth = (env: Env): Auth => {
  const client = getClient(env)
  const session = useSession(client)
  const actions = useMemo(
    () => ({
      signIn: (email: string, password: string) => signIn(client, email, password),
      signOut: () => signOut(client),
    }),
    [client],
  )
  return { session, ...actions }
}
