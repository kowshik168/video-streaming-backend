# Loading the schema into Supabase

This folder contains the DB schema your app expects. Use one of these ways to load it.

## Option 1: Supabase Dashboard (simplest)

1. Open your project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Go to **SQL Editor**.
3. Copy the contents of `migrations/20250206120000_initial_schema.sql`.
4. Paste and click **Run**.

Tables `Users`, `topics`, `videos`, and `comments` will be created in the `public` schema.

## Option 2: Supabase CLI (for local dev or CI)

If you use the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
# From project root
npx supabase link --project-ref YOUR_PROJECT_REF   # if using remote
npx supabase db push
```

For a **local** Supabase instance:

```bash
npx supabase start
npx supabase db reset   # applies migrations
```

## After loading

- Ensure **Authentication** is enabled (your app uses `supabase.auth.signUp` / `signInWithPassword`).
- Set `SUPABASE_URL` and `SUPABASE_KEY` (service role or anon key) in your `.env`.
