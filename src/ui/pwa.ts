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

// The waiting worker once any install in progress has finished, or null; a newer deployment
// replaces the worker already waiting only when its install completes.
const waitingAfterInstall = (registration: ServiceWorkerRegistration) =>
  new Promise<ServiceWorker | null>((resolve) => {
    const worker = registration.installing
    if (!worker) {
      resolve(registration.waiting)
      return
    }
    const timer = setTimeout(() => resolve(registration.waiting), INSTALL_TIMEOUT_MS)
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' || worker.state === 'redundant') {
        clearTimeout(timer)
        resolve(registration.waiting)
      }
    })
  })

export type PwaUpdate = {
  // A new deployment is waiting, and the banner hasn't been put off.
  available: boolean
  // Moves the app to the newest build, reloading it.
  update: () => Promise<void>
  // Hides the banner for the version now waiting; a later deployment shows it again.
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
  // The waiting worker the banner was put off for, so a newer deployment shows it again.
  const dismissedWorker = useRef<ServiceWorker | null>(null)
  // A waiting worker this tab found itself; a different one undoes Later.
  const found = useCallback((worker: ServiceWorker) => {
    setWaitingFound(true)
    if (worker !== dismissedWorker.current) setDismissed(false)
  }, [])
  const {
    needRefresh: [needRefresh],
  } = useRegisterSW({
    onRegisteredSW: (_url, reg) => {
      registration.current = reg
      if (reg?.waiting) found(reg.waiting)
    },
    // Without this the plugin reloads the page as soon as the new worker takes control, as it
    // does when another tab updates; an entry being typed would be lost. The banner stays up
    // instead, and Update reloads.
    onNeedReload: () => setControlledByNew(true),
  })

  // The plugin reports a takeover only for an update its own tab found; any other tab's
  // update reaches this page as a controller change.
  useEffect(() => {
    const takenOver = () => setControlledByNew(true)
    navigator.serviceWorker?.addEventListener('controllerchange', takenOver)
    return () => navigator.serviceWorker?.removeEventListener('controllerchange', takenOver)
  }, [])

  useEffect(() => {
    const check = () => {
      if (!navigator.onLine) return
      const reg = registration.current
      if (!reg) return
      reg
        .update()
        .then(() => waitingAfterInstall(reg))
        .then((waiting) => {
          if (waiting) found(waiting)
        })
        // The next check tries again; a broken deployment shows up here.
        .catch((error: unknown) => console.warn('checking for a new version failed', error))
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
  }, [found])

  const update = useCallback(async () => {
    const reg = registration.current
    if (!reg || controlledByNew) {
      window.location.reload()
      return
    }
    // A worker already waiting needs no network: updating works offline.
    let waiting = reg.waiting
    if (!waiting) {
      const checked = await reg.update().then(
        () => true,
        (error: unknown) => {
          console.warn('checking for a new version failed', error)
          return false
        },
      )
      waiting = checked || reg.installing ? await waitForWaiting(reg) : null
    }
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

  const dismiss = useCallback(() => {
    dismissedWorker.current = registration.current?.waiting ?? null
    setDismissed(true)
  }, [])

  return {
    available: (needRefresh || waitingFound || controlledByNew) && !dismissed,
    update,
    dismiss,
  }
}
