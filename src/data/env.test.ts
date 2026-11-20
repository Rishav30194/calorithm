import { describe, expect, it } from 'vitest'

import { parseEnv } from './env'

describe('parseEnv', () => {
  it('accepts a URL and a key', () => {
    expect(
      parseEnv({
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'key',
      }),
    ).toEqual({
      ok: true,
      env: { supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'key' },
    })
  })

  it('names every missing or invalid variable', () => {
    expect(parseEnv({ VITE_SUPABASE_URL: 'not a url', VITE_SUPABASE_PUBLISHABLE_KEY: '' })).toEqual(
      {
        ok: false,
        invalid: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
      },
    )
  })

  it('treats absent variables as invalid', () => {
    expect(parseEnv({})).toEqual({
      ok: false,
      invalid: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
    })
  })
})
