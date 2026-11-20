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

  settings: {
    signedInAs: 'Signed in as',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
  },
} as const
