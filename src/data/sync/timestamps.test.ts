import { describe, expect, it } from 'vitest'

import { isCursor, isUuid, normalizeTimestamp, overlapStart } from './timestamps'

describe('normalizeTimestamp', () => {
  it('rewrites Postgres timestamps into the format every engine must parse', () => {
    expect(normalizeTimestamp('2026-11-20T10:00:00.123456+00:00')).toBe(
      '2026-11-20T10:00:00.123+00:00',
    )
    expect(normalizeTimestamp('2026-11-20 10:00:00.5+00')).toBe('2026-11-20T10:00:00.500+00:00')
    expect(normalizeTimestamp('2026-11-20T10:00:00+0530')).toBe('2026-11-20T10:00:00.000+05:30')
    expect(normalizeTimestamp('2026-11-20T10:00:00Z')).toBe('2026-11-20T10:00:00.000Z')
  })

  it('rejects anything else, including filter syntax', () => {
    expect(normalizeTimestamp('not a time')).toBeNull()
    expect(normalizeTimestamp('2026-11-20T10:00:00Z,id.neq.x')).toBeNull()
    expect(normalizeTimestamp('2026-13-40T99:00:00Z')).toBe('2026-13-40T99:00:00.000Z')
  })
})

describe('overlapStart', () => {
  it('starts a minute early from a Postgres timestamp with microseconds', () => {
    expect(overlapStart('2026-11-20T10:00:00.123456+00:00')).toBe('2026-11-20T09:59:00.123Z')
  })

  it('reads the format variants Postgres can return', () => {
    expect(overlapStart('2026-11-20 10:00:00.5+00')).toBe('2026-11-20T09:59:00.500Z')
    expect(overlapStart('2026-11-20T10:00:00+0530')).toBe('2026-11-20T04:29:00.000Z')
    expect(overlapStart('2026-11-20T10:00:00Z')).toBe('2026-11-20T09:59:00.000Z')
  })

  it('returns null for text that isn’t a real time', () => {
    expect(overlapStart('not a time')).toBeNull()
    expect(overlapStart('2026-13-40T99:00:00Z')).toBeNull()
  })
})

describe('isUuid', () => {
  it('accepts a UUID and nothing else', () => {
    expect(isUuid('a0000000-0000-4000-8000-000000000001')).toBe(true)
    expect(isUuid('A0000000-0000-4000-8000-000000000001')).toBe(true)
    expect(isUuid('x')).toBe(false)
    expect(isUuid('a0000000-0000-4000-8000-000000000001,user_id.neq.x')).toBe(false)
  })
})

describe('isCursor', () => {
  it('requires a readable timestamp and a UUID', () => {
    const id = 'a0000000-0000-4000-8000-000000000001'
    expect(isCursor({ updatedAt: '2026-11-20T10:00:00.123456+00:00', id })).toBe(true)
    expect(isCursor({ updatedAt: '2026-11-20T10:00:00.123456+00:00', id: 'x' })).toBe(false)
    expect(isCursor({ updatedAt: 'yesterday', id })).toBe(false)
  })
})
