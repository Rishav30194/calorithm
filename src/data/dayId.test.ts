import { describe, expect, it } from 'vitest'

import { dayId, uuidV5, weightId } from './dayId'

// Expected values come from Postgres's extensions.uuid_generate_v5, which the days and weights
// tables' CHECK constraints use, so the app and the database agree on every id.
describe('uuidV5', () => {
  it('matches Postgres for a known namespace and name', async () => {
    expect(await uuidV5('6ba7b811-9dad-11d1-80b4-00c04fd430c8', 'python.org')).toBe(
      '7af94e2b-4dd9-50f0-9c9a-8a48519bdef0',
    )
  })
})

describe('dayId', () => {
  const alice = 'a0000000-0000-4000-8000-000000000001'
  const bob = 'b0000000-0000-4000-8000-000000000002'

  it('matches the id the database requires', async () => {
    expect(await dayId(alice, '2026-11-20')).toBe('a7299a3c-0c31-50d1-b33c-727ad2d15782')
    expect(await dayId(bob, '2026-11-20')).toBe('12de9922-5eb9-5831-a48b-ed52fabb6e22')
    expect(await dayId(alice, '2026-11-21')).toBe('da801a1e-e5fe-5cb2-b36f-6347ac238af7')
  })

  it('gives every device the same id for the same user and day', async () => {
    expect(await dayId(alice, '2026-11-20')).toBe(await dayId(alice, '2026-11-20'))
  })
})

describe('weightId', () => {
  const alice = 'a0000000-0000-4000-8000-000000000001'
  const bob = 'b0000000-0000-4000-8000-000000000002'

  it('matches the id the database requires', async () => {
    expect(await weightId(alice, '2026-11-20')).toBe('798ab06f-16c7-5671-9a7c-c0241face483')
    expect(await weightId(bob, '2026-11-20')).toBe('37b61985-9d9d-5b31-81f6-955febbafbc6')
    expect(await weightId(alice, '2026-11-21')).toBe('4e6ef8b2-2549-5ac9-9182-88f5eb23ec9e')
  })

  it('differs from the day id for the same user and date', async () => {
    expect(await weightId(alice, '2026-11-20')).not.toBe(await dayId(alice, '2026-11-20'))
  })
})
