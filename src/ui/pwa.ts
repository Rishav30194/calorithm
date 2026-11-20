import { useRegisterSW } from 'virtual:pwa-register/react'
import { useCallback, useRef } from 'react'

// Registers the service worker and returns a function that moves the app to the newest
// build. Must be called once at the app root: importing this module stops vite-plugin-pwa
// from injecting its own registration, so without it the app loses offline support.
export const usePwaUpdate = (): (() => Promise<void>) => {
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined)
  const { updateServiceWorker } = useRegisterSW({
    onRegisteredSW: (_url, reg) => {
      registration.current = reg
    },
  })
  return useCallback(async () => {
    // Fetch the newest service worker, then activate it if one is waiting.
    await registration.current?.update()
    await updateServiceWorker(true)
    // With no new worker waiting, updateServiceWorker does nothing; a reload still picks up
    // whatever the worker has already installed.
    window.location.reload()
  }, [updateServiceWorker])
}
