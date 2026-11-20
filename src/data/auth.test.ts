import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { toSignInFailure } from './auth'

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
