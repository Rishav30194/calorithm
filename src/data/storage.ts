import { z } from 'zod/mini'

import type { PendingDeletes } from './sync/session'

const KEY = 'calorithm:pending-deletes'

const namesSchema = z.array(z.string())

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

// localStorage can throw (private mode, blocked site data); a lost entry only means a
// leftover database waits for the next sign-out, so failures read as empty.
export const pendingDeletesIn = (storage: KeyValueStorage): PendingDeletes => {
  const read = (): string[] => {
    try {
      const parsed = namesSchema.safeParse(JSON.parse(storage.getItem(KEY) ?? '[]'))
      return parsed.success ? parsed.data : []
    } catch {
      return []
    }
  }
  const write = (names: string[]) => {
    try {
      storage.setItem(KEY, JSON.stringify(names))
    } catch {
      // See above.
    }
  }
  return {
    list: read,
    add: (name) => {
      const names = read()
      if (!names.includes(name)) write([...names, name])
    },
    remove: (name) => write(read().filter((existing) => existing !== name)),
  }
}

const noStorage: KeyValueStorage = { getItem: () => null, setItem: () => {} }

export const browserPendingDeletes = (): PendingDeletes => {
  try {
    // Reading the property itself throws where site data is blocked.
    return pendingDeletesIn(window.localStorage)
  } catch {
    return pendingDeletesIn(noStorage)
  }
}

// Without this, the browser may clear IndexedDB under storage pressure, losing unsent
// changes. The browser can refuse; the app works either way.
export const requestPersistentStorage = async (): Promise<void> => {
  try {
    await navigator.storage?.persist?.()
  } catch {
    // Refused or unsupported.
  }
}
