# Calorithm

A calorie and macro tracker (kcal, protein, carbs, and fat) that installs on your phone and
works offline. Every week it estimates your maintenance calories from what you ate and how
your weight trended, then sets your kcal and protein targets for the next week.

**Status:** live at [rishav30194.github.io/calorithm](https://rishav30194.github.io/calorithm/)
for invited accounts; sign-ups are off. Phases 1 to 11, 14, 15, and 19 are done, phase 13 (reading
label photos) is parked, and phase 12 (a review against MacroFactor) is on hold; see
[the phase plan](docs/phases.md).

## Features

- **Food log:** log foods and recipes with kcal, protein, carbs, and fat, by serving or by
  weight. Re-log recent and frequent foods with one tap, and copy meals from earlier days.
- **Meals at once:** put several foods on a plate, adjust each amount, and log them together;
  the picker offers what you usually eat for that meal.
- **Built-in foods:** common Indian home foods, gym staples, groceries, and spices, ready to
  pick without typing numbers. Values come from USDA FoodData Central and CoFID, and the
  few estimates are labelled.
- **Barcode scanning:** scan a packaged food to fill it in from Open Food Facts.
- **Nutrition labels:** paste a label's text, or read a photo of it on the device, to fill
  in the food form.
- **Weight trend:** daily weigh-ins with a smoothed trend line that ignores day-to-day water
  swings.
- **Adaptive targets:** a weekly check-in estimates maintenance from your own data and adjusts
  calorie and protein targets, within safety limits.
- **Higher-calorie days:** pick weekdays that get more kcal; the other days get less, so the
  week's total stays the same.
- **Offline first:** everything works without a connection and syncs between devices when one
  returns.
- **Your data:** export everything as JSON, import it back, or delete your account.

## Tech stack

| Layer | Choice |
|---|---|
| App | React, TypeScript (strict), Vite, Tailwind v4, `vite-plugin-pwa` |
| On the device | Dexie (IndexedDB) as the source of truth, Zod at every boundary |
| Scanning and reading | `barcode-detector` (ZXing WebAssembly), `tesseract.js` for label photos |
| Food data | Built-in list from USDA FoodData Central and CoFID; Open Food Facts for barcodes |
| Backend | Supabase: Postgres with row-level security, and Auth |
| Tests | Vitest, fast-check, pgTAP, Playwright with axe |
| Delivery | GitHub Actions, GitHub Pages |

## Getting started

You need Node.js 26 (see `.nvmrc`), Docker, and Git. Local work needs no `.env` file: the
scripts read the local Supabase URL and key from `supabase status`.

1. Install dependencies:

   ```sh
   npm ci
   ```

2. Start local Supabase. The first start downloads its Docker images:

   ```sh
   npm run db:start
   ```

3. Start the app:

   ```sh
   npm run dev
   ```

4. Open `http://localhost:5173/calorithm/` and sign in as the synthetic seed user:
   `seed.user@calorithm.test` with password `Local-Seed-Pass-2026`.

See [the development guide](docs/development.md) for every command, and the checks a change
must pass.

## Documentation

| Document | What it covers |
|---|---|
| [PLAN.md](PLAN.md) | Product scope, data model, and how the numbers work |
| [docs/architecture.md](docs/architecture.md) | How the app is built, and how sync works |
| [docs/phases.md](docs/phases.md) | Build phases, acceptance criteria, and status |
| [docs/decisions/](docs/decisions/) | Architecture decision records |
| [docs/catalog.md](docs/catalog.md) | How the built-in food list is built, and its sources |
| [docs/development.md](docs/development.md) | Commands, branches, commits, PRs, and releases |
| [docs/production.md](docs/production.md) | Hosted setup, deployment, and the live checks |
| [docs/testing.md](docs/testing.md) | Test strategy and the cases each layer covers |
| [docs/security.md](docs/security.md) | Threat model, privacy, and data handling |
| [docs/ai-workflow.md](docs/ai-workflow.md) | How AI-assisted development is run and checked |
| [CLAUDE.md](CLAUDE.md) | Rules for Claude Code in this repository |
| [HANDOVER.md](HANDOVER.md) | Next steps, open questions, and warnings for the next session |

## Health notice

Calorithm gives estimates, not medical advice. Talk to a doctor before large changes to your
diet, especially if you are pregnant, under 18, or have a medical condition or a history of
eating disorders.
