const pattern = /^(\d+)\.(\d+)\.(\d+)$/

const parse = (version: string): [number, number, number] | null => {
  const match = pattern.exec(version)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

// Compares MAJOR.MINOR.PATCH versions numerically: -1, 0, or 1. Null if either is malformed.
export const compareVersions = (a: string, b: string): -1 | 0 | 1 | null => {
  const left = parse(a)
  const right = parse(b)
  if (!left || !right) return null
  for (let i = 0; i < 3; i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0)
    if (difference !== 0) return difference < 0 ? -1 : 1
  }
  return 0
}

// A malformed minimum never locks the app; the database constraint keeps it well formed.
export const isBelowMinimum = (appVersion: string, minimum: string): boolean =>
  compareVersions(appVersion, minimum) === -1
