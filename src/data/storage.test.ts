import { afterEach, describe, expect, it, vi } from 'vitest'

import { pendingDeletesIn, requestPersistentStorage } from './storage'

const memoryStorage = () => {
  const items = new Map<string, string>()
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value)
    },
    items,
  }
}

describe('pendingDeletesIn', () => {
  it('remembers names across instances until removed', () => {
    const storage = memoryStorage()
    pendingDeletesIn(storage).add('calorithm-a')
    pendingDeletesIn(storage).add('calorithm-b')
    pendingDeletesIn(storage).add('calorithm-a')

    expect(pendingDeletesIn(storage).list()).toEqual(['calorithm-a', 'calorithm-b'])

    pendingDeletesIn(storage).remove('calorithm-a')
    expect(pendingDeletesIn(storage).list()).toEqual(['calorithm-b'])
  })

  it('ignores a stored value that isn’t a list of names', () => {
    const storage = memoryStorage()
    storage.items.set('calorithm:pending-deletes', '{"not":"a list"}')

    expect(pendingDeletesIn(storage).list()).toEqual([])
  })

  it('treats storage that throws as empty', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }

    expect(pendingDeletesIn(broken).list()).toEqual([])
    expect(() => pendingDeletesIn(broken).add('calorithm-a')).not.toThrow()
  })
})

describe('requestPersistentStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks the browser to keep local data', async () => {
    const persist = vi.fn(async () => true)
    vi.stubGlobal('navigator', { storage: { persist } })

    await requestPersistentStorage()

    expect(persist).toHaveBeenCalledOnce()
  })

  it('does nothing where the browser has no storage API', async () => {
    vi.stubGlobal('navigator', {})

    await expect(requestPersistentStorage()).resolves.toBeUndefined()
  })

  it('swallows a refusal', async () => {
    vi.stubGlobal('navigator', {
      storage: { persist: async () => Promise.reject(new Error('no')) },
    })

    await expect(requestPersistentStorage()).resolves.toBeUndefined()
  })
})
