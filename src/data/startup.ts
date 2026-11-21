import { useEffect, useState } from 'react'

import { browserPendingDeletes, requestPersistentStorage } from './storage'
import { deletePendingDatabases } from './sync/session'

// False until a sign-out the app was closed during has finished deleting its database, so
// the same user signing in again never reopens the half-deleted one.
export const useLocalDataReady = (): boolean => {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true
    void requestPersistentStorage()
    void deletePendingDatabases(browserPendingDeletes())
      .catch((error: unknown) => console.error('couldn’t finish deleting a local database', error))
      .then(() => {
        if (live) setReady(true)
      })
    return () => {
      live = false
    }
  }, [])
  return ready
}
