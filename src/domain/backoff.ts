export const BACKOFF_MIN_MS = 1_000
export const BACKOFF_MAX_MS = 300_000
const BASE_MS = 2_000

// Exponential backoff with full jitter: the ceiling doubles each attempt up to the cap, and the
// delay is a random point below it. Jitter keeps many devices from retrying in lockstep after
// an outage. `random` is a value in [0, 1], passed in so the result is deterministic in tests.
export const backoffMs = (attempt: number, random: number): number => {
  const exponent = Math.max(1, Math.floor(attempt)) - 1
  // Past 2^20 the ceiling is long above the cap; stopping there avoids Infinity.
  const ceiling = Math.min(BACKOFF_MAX_MS, BASE_MS * 2 ** Math.min(exponent, 20))
  const delay = Math.round(ceiling * Math.min(1, Math.max(0, random)))
  return Math.max(BACKOFF_MIN_MS, delay)
}
