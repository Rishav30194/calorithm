import { useRegisterSW } from 'virtual:pwa-register/react'
import { useCallback, useRef } from 'react'

const INSTALL_TIMEOUT_MS = 15_000
const ACTIVATE_TIMEOUT_MS = 5_000

// Resolves with the new worker once it has installed and is waiting, or null if none
// arrives in time. update() resolves when the script is fetched, before installation ends,
// so its result alone can't be trusted.
const waitForWaiting = (registration: ServiceWorkerRegistration): Promise<ServiceWorker | null> =>
  new Promise((resolve) => {
    if (registration.waiting) {
      resolve(registration.waiting)
      return
    }
    const timer = setTimeout(() => resolve(null), INSTALL_TIMEOUT_MS)
    const watch = (worker: ServiceWorker | null) => {
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') {
          clearTimeout(timer)
          resolve(registration.waiting ?? worker)
        }
        if (worker.state === 'redundant') {
          clearTimeout(timer)
          resolve(null)
        }
      })
    }
    watch(registration.installing)
    registration.addEventListener('updatefound', () => watch(registration.installing))
  })

// Registers the service worker and returns a function that moves the app to the newest
// build. Must be called once at the app root: importing this module stops vite-plugin-pwa
// from injecting its own registration, so without it the app loses offline support.
export const usePwaUpdate = (): (() => Promise<void>) => {
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined)
  useRegisterSW({
    onRegisteredSW: (_url, reg) => {
      registration.current = reg
    },
  })

  return useCallback(async () => {
    const reg = registration.current
    if (!reg) {
      window.location.reload()
      return
    }
    await reg.update()
    const waiting = await waitForWaiting(reg)
    if (!waiting) {
      // Nothing newer to install; a reload still picks up anything already activated.
      window.location.reload()
      return
    }
    // Reload once the new worker controls the page, so the new build loads; fall back to a
    // plain reload if activation stalls.
    const fallback = setTimeout(() => window.location.reload(), ACTIVATE_TIMEOUT_MS)
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        clearTimeout(fallback)
        window.location.reload()
      },
      { once: true },
    )
    // The generated worker listens for this message in prompt mode (workbox-build's
    // sw-template: self.skipWaiting() on { type: 'SKIP_WAITING' }).
    waiting.postMessage({ type: 'SKIP_WAITING' })
  }, [])
}
