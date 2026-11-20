// All interface text. Screens import from here so translation later is one new file.
export const strings = {
  appName: 'Calorithm',
  loading: 'Loading…',

  configError: {
    title: 'The app is not configured',
    body: 'These settings are missing or invalid:',
  },

  signIn: {
    title: 'Sign in',
    email: 'Email',
    password: 'Password',
    submit: 'Sign in',
    submitting: 'Signing in…',
    failures: {
      invalid_input: 'Enter a valid email address and your password.',
      invalid_credentials: 'That email and password don’t match. Check both and try again.',
      rate_limited: 'Too many attempts. Wait a minute, then try again.',
      network: 'Can’t reach the server. Check your connection and try again.',
      unknown: 'Something went wrong. Try again.',
    },
  },

  tabs: {
    log: 'Log',
    weight: 'Weight',
    checkin: 'Check-in',
    settings: 'Settings',
  },
  navigation: 'Main',

  comingSoon: {
    log: 'The food log arrives in phase 3.',
    weight: 'Weigh-ins and the trend chart arrive in phase 4.',
    checkin: 'Targets and the weekly check-in arrive in phase 5.',
  },

  units: {
    legend: 'Units',
    metric: 'Metric (kg)',
    imperial: 'Imperial (lb)',
  },

  sync: {
    title: 'Sync',
    syncing: 'Syncing…',
    neverSynced: 'Not synced yet',
    lastSynced: (ago: string) => `Last synced ${ago}`,
    waiting: (count: number) =>
      count === 1 ? '1 change waiting to sync' : `${count} changes waiting to sync`,
    allSynced: 'Everything is synced',
    offline: 'Offline. Changes are saved on this device and sync when you’re back online.',
    signedOut: 'Your session expired. Sign out and sign in again to resume syncing.',
    failedTitle: 'Changes the server refused',
    failedReason: (message: string) => `Reason: ${message}`,
    discard: 'Discard change',
    discarding: 'Discarding…',
    discardOffline: 'Can’t discard while offline. Try again when you’re connected.',
    badge: {
      syncing: 'Syncing',
      offline: (count: number) => (count > 0 ? `Offline · ${count} waiting` : 'Offline'),
      failed: (count: number) => (count === 1 ? '1 sync problem' : `${count} sync problems`),
      signedOut: 'Sync paused',
    },
  },

  update: {
    title: 'Update required',
    body: 'This version of Calorithm is too old to sync. Update to keep your data in step across devices.',
    button: 'Update now',
    updating: 'Updating…',
  },

  settings: {
    signedInAs: 'Signed in as',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
    signOutFailed: 'Couldn’t sign out. Check your connection and try again.',
  },
} as const
