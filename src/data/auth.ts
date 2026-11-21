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

// not_recent: the server found no password sign-in in the last 5 minutes, which shouldn't
// happen right after signing in again, unless the device clock and the server disagree.
export type DeleteAccountFailure = SignInFailure | 'not_recent'

export type DeleteAccountResult = { ok: true } | { ok: false; failure: DeleteAccountFailure }

type DeleteAccountDeps = {
  signIn: (email: string, password: string) => Promise<SignInResult>
  callDelete: () => PromiseLike<{ status: number; error: { code: string; message: string } | null }>
}

// Signs in again with the password, which proves it and gives the token the fresh password
// sign-in that public.delete_account() requires, then deletes the account on the server.
// Deleting this device's data and session is left to the caller.
export const deleteAccountWith =
  ({ signIn: signInWith, callDelete }: DeleteAccountDeps) =>
  async (email: string, password: string): Promise<DeleteAccountResult> => {
    const signedIn = await signInWith(email, password)
    if (!signedIn.ok) return signedIn
    try {
      const { status, error } = await callDelete()
      if (!error) return { ok: true }
      if (error.code === '28000') return { ok: false, failure: 'not_recent' }
      // postgrest-js reports a failed fetch as status 0; see decision 0014.
      if (status === 0 || status === 408 || status === 429 || status >= 500) {
        return { ok: false, failure: 'network' }
      }
      return { ok: false, failure: 'unknown' }
    } catch {
      return { ok: false, failure: 'network' }
    }
  }

export const deleteAccount = (
  client: Client,
  email: string,
  password: string,
): Promise<DeleteAccountResult> =>
  deleteAccountWith({
    signIn: (address, secret) => signIn(client, address, secret),
    callDelete: () => client.rpc('delete_account'),
  })(email, password)

type RefreshClient = {
  auth: {
    refreshSession: () => Promise<{ data: { session: unknown }; error: unknown }>
  }
}

// Whether syncing may continue. A refresh that failed only because the network is down
// counts as fine: the sync then fails as offline and retries, instead of reporting the user
// signed out when they aren't.
export const refreshSession = async (client: RefreshClient): Promise<boolean> => {
  try {
    const { data, error } = await client.auth.refreshSession()
    if (isAuthRetryableFetchError(error)) return true
    return error === null && data.session !== null
  } catch {
    return false
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
}

// The interface's only way in: screens get session state and actions, never the client.
// Sign-out comes from DataProvider's useSignOut, since it deletes the local database first.
export const useAuth = (env: Env): Auth => {
  const client = getClient(env)
  const session = useSession(client)
  const actions = useMemo(
    () => ({
      signIn: (email: string, password: string) => signIn(client, email, password),
    }),
    [client],
  )
  return { session, ...actions }
}
