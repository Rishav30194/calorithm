# Built-in foods

The built-in food list: 199 common Indian groceries, dishes, spices, and gym foods, with
kcal, protein, carbs, and fat per serving. Type in the log picker's, the recipe ingredient
picker's, or the **Foods** screen's search and matches show under **Built-in foods**; picking
one copies it into your foods (with its `catalog_id`) and then logs it, adds it to the
recipe, or opens it for checking. A copied item shows as your own food after that. Decision 0027 explains
the source.

## Source

USDA FoodData Central, public domain (CC0 1.0): SR Legacy (2018-04) for groceries, and FNDDS
2021-2023 (2024-10-31) for prepared dishes. Credit: U.S. Department of Agriculture,
Agricultural Research Service. FoodData Central. fdc.nal.usda.gov.

Items USDA lacks (decision 0032): garam masala and curry leaves from McCance and Widdowson's
Composition of Foods Integrated Dataset (CoFID) 2021, which contains public sector
information licensed under the Open Government Licence v3.0; black salt with USDA table
salt's values; and four estimates worked out from USDA values, named "(estimate)": amchur,
ajwain, kalonji, and chaat masala. `scripts/catalog/other.json` records each basis.

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
| Spices | 26, including haldi, jeera, dhania, lal mirch, elaichi, garam masala, curry leaves, black salt, and salt, and four estimates |
| Dishes | 22: dal, roti, paratha, naan, puri, idli, dosa, masala dosa, sambar, upma, samosa, pakora, palak paneer, chicken and fish curry, biryani, and ladoo |
| Other | 7: sugar, brown sugar, honey, tea with milk, dark chocolate, cocoa, and ketchup |

No beef or pork. Search works by English and common Hindi names: "aloo", "dahi", "jeera".
It matches the start of a word, so "rice" finds "Puffed rice" but "hing" doesn't find
"jhinga".

## Known gaps and approximations

- **Not in USDA:** jaggery, poha, khichdi, dhokla, chole and rajma as cooked dishes, aloo
  paratha, mango pickle, vermicelli (sevai), rohu, and pomfret. Add them as your own foods.
- **Hing (asafoetida)** isn't in the list: no openly licensed source gives its energy and
  carbs.
- **Estimates:** ajwain uses caraway seed, kalonji cumin seed, and amchur raw mango dried to
  8% water; chaat masala is a usual mix of USDA spices.
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
   `usdaDescription`, and a `portion` label prefix or null for 100 g. When USDA lists one
   label at several weights, `portionGrams` picks one; the script refuses an ambiguous match.
3. Run `node scripts/build-catalog.mjs SR_LEGACY_DIR FNDDS_DIR`. It refuses to write if a
   description no longer matches.
4. To change only the items USDA lacks, edit `scripts/catalog/other.json` (per-100 g values,
   a serving unit of `g` or ending "(N g)", and a source) and run
   `node scripts/build-catalog.mjs --keep-usda` instead of step 3.
5. Run `npx biome format --write scripts/catalog src/data/catalog`.
6. Run `npx vitest run src/data/catalog`.
