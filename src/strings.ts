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

  logLinks: {
    label: 'Foods and recipes',
    foods: 'Foods',
    recipes: 'Recipes',
  },

  screenError: {
    title: 'Something went wrong',
    body: 'This screen couldn’t load its data.',
    retry: 'Try again',
  },

  foods: {
    title: 'Foods',
    back: 'Back to log',
    add: 'Add food',
    search: 'Search foods',
    showArchived: 'Show archived',
    archived: 'Archived',
    empty: 'No foods yet. Add the foods you eat often, then log them in two taps.',
    noMatch: 'No foods match your search.',
    serving: (size: string, unit: string) => `${size} ${unit}`,
    nutrients: (kcal: string, protein: string) => `${kcal} · ${protein} protein`,
    editor: {
      newTitle: 'New food',
      editTitle: 'Edit food',
      back: 'Back to foods',
      name: 'Name',
      servingSize: 'Serving size',
      servingUnit: 'Serving unit',
      servingUnitHint: 'For example g, ml, or slice',
      kcal: 'kcal per serving',
      proteinG: 'Protein per serving (g)',
      save: 'Save',
      saving: 'Saving…',
      archive: 'Archive',
      restore: 'Restore',
      archivedNote: 'Archived. It stays on past days and in recipes, but not in pickers.',
      notFound: 'This food isn’t on this device. It may have been removed on another device.',
      saveFailed: 'Couldn’t save. Try again.',
    },
    errors: {
      name: 'Enter a name of up to 100 characters.',
      servingSize: 'Enter a serving size from 0.01 to 10,000.',
      servingUnit: 'Enter a unit of up to 20 characters, such as g.',
      kcal: 'Enter whole kcal from 0 to 10,000.',
      proteinG: 'Enter protein from 0 to 1,000 g.',
    },
  },

  recipes: {
    title: 'Recipes',
    back: 'Back to log',
    add: 'Add recipe',
    search: 'Search recipes',
    showArchived: 'Show archived',
    archived: 'Archived',
    empty: 'No recipes yet. Build one from your foods to log it in one tap.',
    noMatch: 'No recipes match your search.',
    makes: (servings: string) => `Makes ${servings}`,
    perServing: (kcal: string, protein: string) => `${kcal} · ${protein} protein a serving`,
    editor: {
      newTitle: 'New recipe',
      editTitle: 'Edit recipe',
      back: 'Back to recipes',
      name: 'Name',
      servings: 'Servings it makes',
      ingredients: 'Ingredients',
      noIngredients: 'No ingredients yet.',
      addIngredient: 'Add ingredient',
      ingredientServings: (name: string) => `Servings of ${name}`,
      remove: (name: string) => `Remove ${name}`,
      removeLabel: 'Remove',
      totals: 'Whole recipe',
      perServing: 'Per serving',
      save: 'Save',
      saving: 'Saving…',
      archive: 'Archive',
      restore: 'Restore',
      archivedNote: 'Archived. It stays on past days, but not in pickers.',
      notFound: 'This recipe isn’t on this device. It may have been removed on another device.',
      saveFailed: 'Couldn’t save. Try again.',
    },
    picker: {
      title: 'Add an ingredient',
      search: 'Search foods',
      empty: 'No foods to add. Add foods first.',
      noMatch: 'No foods match your search.',
      close: 'Close',
    },
    errors: {
      name: 'Enter a name of up to 100 characters.',
      servings: 'Enter servings from 0.01 to 1,000.',
      items: 'Add at least one ingredient.',
      itemServings: 'Enter servings from 0.01 to 1,000.',
    },
  },

  comingSoon: {
    log: 'The daily log arrives soon. Set up your foods and recipes first.',
    weight: 'Weigh-ins and the trend chart arrive in phase 4.',
    checkin: 'Targets and the weekly check-in arrive in phase 5.',
  },

  units: {
    legend: 'Units',
    metric: 'Metric (kg)',
    imperial: 'Imperial (lb)',
    offline: 'Can’t change units until this device has synced once. Connect and try again.',
    failed: 'Couldn’t save that change. Try again.',
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

  signOutWarning: {
    title: 'Sign out and lose unsent changes?',
    body: (count: number) =>
      count === 1
        ? '1 change hasn’t reached the server. Signing out deletes it from this device. Export it first to keep a copy.'
        : `${count} changes haven’t reached the server. Signing out deletes them from this device. Export them first to keep a copy.`,
    export: 'Export changes',
    confirm: 'Sign out anyway',
    cancel: 'Cancel',
  },
} as const
