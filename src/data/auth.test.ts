import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { deleteAccountWith, refreshSession, signOut, toSignInFailure } from './auth'

describe('signOut', () => {
  it('succeeds when the server accepts', async () => {
    const client = { auth: { signOut: async () => ({ error: null }) } }
    expect(await signOut(client)).toEqual({ ok: true })
  })

  it('reports an error the server returns', async () => {
    const client = {
      auth: { signOut: async () => ({ error: new AuthRetryableFetchError('Failed to fetch', 0) }) },
    }
    expect(await signOut(client)).toEqual({ ok: false })
  })

  it('reports a thrown error instead of rejecting', async () => {
    const client = {
      auth: {
        signOut: async (): Promise<{ error: null }> => {
          throw new Error('subscriber failed')
        },
      },
    }
    expect(await signOut(client)).toEqual({ ok: false })
  })
})

describe('toSignInFailure', () => {
  it('maps wrong credentials', () => {
    const error = new AuthApiError('Invalid login credentials', 400, 'invalid_credentials')
    expect(toSignInFailure(error)).toBe('invalid_credentials')
  })

  it('maps rate limiting', () => {
    const error = new AuthApiError('Too many requests', 429, 'over_request_rate_limit')
    expect(toSignInFailure(error)).toBe('rate_limited')
  })

  it('maps a failed request to a network failure', () => {
    expect(toSignInFailure(new AuthRetryableFetchError('Failed to fetch', 0))).toBe('network')
  })

  it('maps anything else to unknown', () => {
    expect(toSignInFailure(new Error('boom'))).toBe('unknown')
  })
})

describe('refreshSession', () => {
  const session = { access_token: 't' }

  it('is true when the session was refreshed', async () => {
    const client = { auth: { refreshSession: async () => ({ data: { session }, error: null }) } }
    expect(await refreshSession(client)).toBe(true)
  })

  it('is false when the session can’t be refreshed', async () => {
    const client = {
      auth: {
        refreshSession: async () => ({
          data: { session: null },
          error: new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found'),
        }),
      },
    }
    expect(await refreshSession(client)).toBe(false)
  })

  // Offline, the session may still be fine: let the sync retry and report offline instead.
  it('is true when only the network failed', async () => {
    const client = {
      auth: {
        refreshSession: async () => ({
          data: { session: null },
          error: new AuthRetryableFetchError('Failed to fetch', 0),
        }),
      },
    }
    expect(await refreshSession(client)).toBe(true)
  })
})

describe('deleteAccountWith', () => {
  const signedIn = async () => ({ ok: true as const })
  const deleted = async () => ({ status: 204, error: null })

  it('signs in again with the password, then deletes the account', async () => {
    const calls: string[] = []
    const result = await deleteAccountWith({
      signIn: async (email, password) => {
        calls.push(`sign in ${email} ${password}`)
        return { ok: true }
      },
      callDelete: async () => {
        calls.push('delete')
        return { status: 204, error: null }
      },
    })('someone@example.test', 'Synthetic-Pass-1')

    expect(result).toEqual({ ok: true })
    expect(calls).toEqual(['sign in someone@example.test Synthetic-Pass-1', 'delete'])
  })

  it.each(['invalid_credentials', 'rate_limited', 'network', 'unknown'] as const)(
    'deletes nothing when the sign-in fails as %s',
    async (failure) => {
      let called = false
      const result = await deleteAccountWith({
        signIn: async () => ({ ok: false, failure }),
        callDelete: async () => {
          called = true
          return { status: 204, error: null }
        },
      })('someone@example.test', 'wrong')

      expect(result).toEqual({ ok: false, failure })
      expect(called).toBe(false)
    },
  )

  it.each([
    [403, '28000', 'not_recent'],
    [0, '', 'network'],
    [503, 'PGRST000', 'network'],
    [400, 'P0001', 'unknown'],
  ] as const)('maps a %i %s from the server to %s', async (status, code, failure) => {
    const result = await deleteAccountWith({
      signIn: signedIn,
      callDelete: async () => ({ status, error: { code, message: 'failed' } }),
    })('someone@example.test', 'Synthetic-Pass-1')
    expect(result).toEqual({ ok: false, failure })
  })

  it('reports a thrown call as a network failure', async () => {
    const result = await deleteAccountWith({
      signIn: signedIn,
      callDelete: async () => {
        throw new TypeError('Failed to fetch')
      },
    })('someone@example.test', 'Synthetic-Pass-1')
    expect(result).toEqual({ ok: false, failure: 'network' })
  })

  it('succeeds with no error from the server', async () => {
    expect(
      await deleteAccountWith({ signIn: signedIn, callDelete: deleted })('a@example.test', 'x'),
    ).toEqual({ ok: true })
  })
})
