import { formatGrams, formatKcal, formatProtein } from '@/domain/format'
import type { Nutrients } from '@/domain/nutrition'
import { strings } from '@/strings'

// kcal, protein, carbs, and fat as one line of text. A total over nothing at all has carbs
// and fat not set (decision 0025), so `empty` shows them as 0 g instead.
export const macroText = (nutrients: Nutrients, locale: string, empty = false): string => {
  const grams = (value: number | null) =>
    value === null ? (empty ? formatGrams(0, locale) : null) : formatGrams(value, locale)
  return strings.macros(
    formatKcal(nutrients.kcal, locale),
    formatProtein(nutrients.proteinG, locale),
    grams(nutrients.carbsG),
    grams(nutrients.fatG),
  )
}
