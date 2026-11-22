import { ODBL_URL, OPEN_FOOD_FACTS_URL } from '@/data/openFoodFacts/lookup'
import { strings } from '@/strings'

// The ODbL credit, wherever Open Food Facts data shows (decision 0029).
export const OpenFoodFactsCredit = () => (
  <p className="text-sm text-muted">
    <a
      href={OPEN_FOOD_FACTS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent underline"
    >
      {strings.openFoodFacts.credit}
    </a>
    {', '}
    <a href={ODBL_URL} target="_blank" rel="noopener noreferrer" className="text-accent underline">
      {strings.openFoodFacts.license}
    </a>
  </p>
)
