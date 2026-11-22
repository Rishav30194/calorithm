# Built-in foods

The built-in food list: 192 common Indian groceries, dishes, spices, and gym foods, with
kcal, protein, carbs, and fat per serving. Picking one copies it into your foods. Decision
0027 explains the source.

## Source

USDA FoodData Central, public domain (CC0 1.0): SR Legacy (2018-04) for groceries, and FNDDS
2021-2023 (2024-10-31) for prepared dishes. Credit: U.S. Department of Agriculture,
Agricultural Research Service. FoodData Central. fdc.nal.usda.gov.

## What's in it

| Group | Foods |
|---|---|
| Vegetables | 35, including onion, potato, tomato, green chili, okra, brinjal, bitter, bottle, and ridge gourd, drumstick, and coriander leaves |
| Fruits | 22, including banana, mango, papaya, guava, chikoo, litchi, and custard apple |
| Grains and flours | 16: rice, atta, maida, sooji, besan, oats, ragi, jowar, and breads |
| Pulses | 17: chole, rajma, masoor, moong, urad, toor, lobia, soya, tofu, and sprouts, boiled and dry |
| Dairy | 16, including milk, curd, Greek yogurt, paneer, ghee, butter, buttermilk, and whey protein |
| Eggs, chicken, mutton, fish | 17 |
| Nuts, seeds, and oils | 21, including makhana, mustard oil, and groundnut oil |
| Spices | 19, including haldi, jeera, dhania, lal mirch, elaichi, and salt |
| Dishes | 22: dal, roti, paratha, naan, puri, idli, dosa, masala dosa, sambar, upma, samosa, pakora, palak paneer, chicken and fish curry, biryani, and ladoo |
| Other | 7: sugar, brown sugar, honey, tea with milk, dark chocolate, cocoa, and ketchup |

No beef or pork. Search works by English and common Hindi names: "aloo", "dahi", "jeera".

## Known gaps and approximations

- **Not in USDA:** jaggery, poha, khichdi, dhokla, chole and rajma as cooked dishes, aloo
  paratha, mango pickle, vermicelli (sevai), rohu, and pomfret. Add them as your own foods.
- **Paneer** is USDA's generic paneer, with 22.5 g carbs per 100 g; Indian labels show about
  2 g. Check your package and edit the copied food.
- **Soya chunks** use USDA's defatted soy flour, which they're made from.
- **Rice pudding** is USDA's arroz con leche, the closest match to kheer.
- Servings use USDA's portion weights where it has one ("1 medium roti, 40 g"), else 100 g.

## Rebuilding it

1. Download the SR Legacy and FNDDS CSV files from
   [FoodData Central's download page](https://fdc.nal.usda.gov/download-datasets), and unzip
   both.
2. Edit `scripts/catalog/items.json`. Each item pins a USDA food by `fdcId` and its exact
   `usdaDescription`.
3. Run `node scripts/build-catalog.mjs SR_LEGACY_DIR FNDDS_DIR`. It refuses to write if a
   description no longer matches.
4. Run `npx biome format --write scripts/catalog src/data/catalog`.
5. Run `npx vitest run src/data/catalog`.
