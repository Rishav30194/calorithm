import { useRegisterSW } from 'virtual:pwa-register/react'
import { useCallback, useEffect, useRef, useState } from 'react'

const INSTALL_TIMEOUT_MS = 15_000
const ACTIVATE_TIMEOUT_MS = 5_000
// How often an open app asks the server for a new deployment; it also asks when it comes back
// to the foreground.
const CHECK_INTERVAL_MS = 60 * 60 * 1000

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

export type PwaUpdate = {
  // A new deployment is waiting, and the banner hasn't been put off.
  available: boolean
  // Moves the app to the newest build, reloading it.
  update: () => Promise<void>
  // Hides the banner until the app next starts.
  dismiss: () => void
}

// Registers the service worker and reports new deployments. Must be called once at the app
// root: importing this module stops vite-plugin-pwa from injecting its own registration, so
// without it the app loses offline support.
export const usePwaUpdate = (): PwaUpdate => {
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined)
  // Set when another tab's update already put the new worker in control of this page.
  const [controlledByNew, setControlledByNew] = useState(false)
  // The plugin reports only an update this tab found itself while running, so the waiting
  // worker is also read directly: at start, and after each check, as when another tab found it.
  const [waitingFound, setWaitingFound] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const {
    needRefresh: [needRefresh],
  } = useRegisterSW({
    onRegisteredSW: (_url, reg) => {
      registration.current = reg
      if (reg?.waiting) setWaitingFound(true)
    },
    // Without this the plugin reloads the page as soon as the new worker takes control, as it
    // does when another tab updates; an entry being typed would be lost. The banner stays up
    // instead, and Update reloads.
    onNeedReload: () => setControlledByNew(true),
  })

  useEffect(() => {
    const check = () => {
      if (!navigator.onLine) return
      const reg = registration.current
      if (!reg) return
      // Offline or a server error rejects; the next check tries again.
      reg
        .update()
        .then(() => {
          if (reg.waiting) setWaitingFound(true)
        })
        .catch(() => {})
    }
    const visible = () => {
      if (document.visibilityState === 'visible') check()
    }
    const timer = setInterval(check, CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', visible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [])

  const update = useCallback(async () => {
    const reg = registration.current
    if (!reg || controlledByNew) {
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
  }, [controlledByNew])

  const dismiss = useCallback(() => setDismissed(true), [])

  return {
    available: (needRefresh || waitingFound || controlledByNew) && !dismissed,
    update,
    dismiss,
  }
}
