# Supabase Setup

## 1. Create the project

1. Go to supabase.com, create a new project.
2. Note your project URL and service role key from Project Settings > API.

## 2. Run migrations

Using the Supabase CLI:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

Or paste each file in `supabase/migrations/` into the SQL editor in order:
- `20260329000001_initial_schema.sql`
- `20260329000002_manual_overrides.sql`
- `20260329000003_rls_policies.sql`

## 3. Configure Edge Function secrets

In the Supabase dashboard: Project Settings > Edge Functions > Secrets, add:

| Secret name        | Description                                      | Example         |
|--------------------|--------------------------------------------------|-----------------|
| `OMDB_KEY`         | Your OMDb API key                                | `abcd1234`      |
| `GOOGLE_KEY`       | Your Google Programmable Search API key          | `AIza...`       |
| `GOOGLE_CX`        | Your Google Custom Search Engine ID              | `017...`        |
| `OMDB_DAILY_LIMIT` | Max OMDb calls per day before hard-stop          | `900`           |
| `GOOGLE_DAILY_LIMIT` | Max Google calls per day before hard-stop      | `90`            |

Or via CLI:
```bash
supabase secrets set OMDB_KEY=your_key
supabase secrets set GOOGLE_KEY=your_key
supabase secrets set GOOGLE_CX=your_cx_id
supabase secrets set OMDB_DAILY_LIMIT=900
supabase secrets set GOOGLE_DAILY_LIMIT=90
```

## 4. Deploy the Edge Function

Once task 2 (Build /ratings Edge Function) is complete:
```bash
supabase functions deploy ratings
```

## 5. Update the extension

Set `VITE_API_BASE_URL` in your build environment to:
```
https://<your-project-ref>.supabase.co/functions/v1
```

## Schema overview

```
title_resolution_cache   netflix_title_id -> imdb_id (30-day TTL, 12h for negative)
ratings_cache            imdb_id -> ratings payload (7-day TTL)
manual_overrides         netflix_title_id -> imdb_id (permanent, admin-managed)
```

All tables have RLS enabled. Only the Edge Function (service role) can read/write them.
