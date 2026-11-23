import { z } from 'zod/mini'

import { limits } from '@/domain/limits'

import { toNumber } from '../food/forms'

const servings = z.number().check(z.gte(0.01), z.lte(limits.servings))

// Servings typed in a log dialog, or null when they don't parse or are out of range.
export const parseServings = (text: string): number | null => {
  const parsed = servings.safeParse(toNumber(text))
  return parsed.success ? parsed.data : null
}
