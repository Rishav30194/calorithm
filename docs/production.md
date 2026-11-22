# Production

How the live app is set up, and the checks that prove it works. You do every step here
yourself: Claude never touches the hosted project or the repository settings.

| Piece | Where |
|---|---|
| App | GitHub Pages at `https://rishav30194.github.io/calorithm/`, deployed by `.github/workflows/deploy.yml` after CI passes on `main` |
| Database and sign-in | A hosted Supabase project on the free plan |
| Keep-awake | `.github/workflows/keep-awake.yml`, Mondays and Thursdays, so one failed run still leaves a request inside the week |

Dashboard menu names in this guide were not checked against the live dashboards; if one has
moved, search the settings for it.

## One-time setup

### GitHub

1. Make the repository public: **Settings** > **General** > **Danger Zone** > **Change
   visibility**. GitHub Pages on the Free plan serves only public repositories. Commit
   author emails become public too.
2. In **Settings** > **Pages**, set **Source** to **GitHub Actions**.

### Supabase

1. Create a project on the free plan, in the region closest to you.
2. In **Authentication** > **Sign In / Providers**, turn off **Allow new users to sign up**.
3. In the same settings, turn on **Secure password change**. Account deletion relies on it
   (decision 0023).
4. In **Authentication** > **URL Configuration**, set **Site URL** to
   `https://rishav30194.github.io/calorithm/`.
5. In **Authentication** > **Users**, add your own user with a strong password, and a
   throwaway user for the deletion check.
6. From the project folder, apply the migrations:

   ```sh
   npx supabase link --project-ref PROJECT_REF
   npx supabase db push
   ```

   `PROJECT_REF` is the ID in the project's dashboard URL. Never pass `--include-seed`: the
   seed users have a published password.
7. Note the project URL, `https://PROJECT_REF.supabase.co` with no trailing slash, and the
   publishable key (`sb_publishable_…`) from **Project Settings** > **API Keys**. Never use
   the secret key.

### Connect them

1. Set the two repository secrets; each command prompts for the value:

   ```sh
   gh secret set VITE_SUPABASE_URL
   gh secret set VITE_SUPABASE_PUBLISHABLE_KEY
   ```

2. Run **Deploy** from the **Actions** tab on `main`, or merge to `main`. The deploy fails
   early with a clear message if either secret is missing or looks wrong.
3. Run **Keep awake** from the **Actions** tab once, and check it passes.

## Acceptance checks

These are phase 7's acceptance criteria in `docs/phases.md`.

1. On the phone, open the live URL, sign in, and install it: **Share** > **Add to Home
   Screen** on iPhone. Turn on airplane mode, open the installed app, and check it loads and
   shows your data.
2. Add a food entry on the phone and check it appears on a laptop, then the reverse.
3. With the installed app open, merge a change to the app's code or to `package.json`'s
   version, and check the **Update available** banner appears within an hour or on returning
   to the app. A docs-only change builds the same files, so it shows no banner.
4. Check **Keep awake** has a passing run.
5. In **Settings** > **Your data**, export, and check the file downloads and imports back
   without errors.
6. Sign in as the throwaway user, delete the account, and check in **Authentication** >
   **Users** that it's gone.

## Running it

- **Schema changes:** apply a hosted migration with `npx supabase db push` before merging the
  PR that needs it. See `docs/development.md`, "Releases".
- **Paused project:** if **Keep awake** fails, the project may have paused. Restore it in the
  Supabase dashboard; the app keeps working offline meanwhile and syncs once it's back.
- **Scheduled runs stop:** GitHub turns off scheduled workflows in a public repository after 60
  days with no activity, and emails you first. Turn **Keep awake** back on in the **Actions**
  tab.
