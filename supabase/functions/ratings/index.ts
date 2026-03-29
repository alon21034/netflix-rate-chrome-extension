import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── TTLs ────────────────────────────────────────────────────────────────────

const TITLE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30 days
const RATINGS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;  //  7 days
const NEGATIVE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;     // 12 hours

// ─── Confidence ───────────────────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 0.7;

function scoreConfidence(
  hintType: string | null,
  hintYear: string | null,
  omdbType: string | null,
  omdbYear: string | null,
): number {
  let score = 0.5; // base: found an IMDb ID via Google

  if (hintType && omdbType) {
    if (hintType.toLowerCase() === omdbType.toLowerCase()) score += 0.3;
    else score -= 0.2;
  }

  if (hintYear && omdbYear) {
    if (Math.abs(parseInt(hintYear) - parseInt(omdbYear)) <= 1) score += 0.2;
    else score -= 0.1;
  }

  return Math.min(1.0, Math.max(0.0, score));
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface RatingsResult {
  imdbRating: string | null;
  rtScore: string | null;
  type: string | null;
  imdbId: string | null;
  source: "cache" | "google+omdb" | "not-found";
}

// ─── In-flight dedup (per function instance) ─────────────────────────────────

const inFlight = new Map<string, Promise<RatingsResult>>();

// ─── Supabase client ─────────────────────────────────────────────────────────

function db(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ─── CORS ────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ─── Quota ───────────────────────────────────────────────────────────────────

async function isUnderQuota(
  provider: "google" | "omdb",
  client: SupabaseClient,
): Promise<boolean> {
  const limit =
    provider === "google"
      ? parseInt(Deno.env.get("GOOGLE_DAILY_LIMIT") ?? "90")
      : parseInt(Deno.env.get("OMDB_DAILY_LIMIT") ?? "900");

  const today = new Date().toISOString().slice(0, 10);
  const { data } = await client
    .from("api_quota")
    .select("calls")
    .eq("provider", provider)
    .eq("date", today)
    .single();

  return (data?.calls ?? 0) < limit;
}

async function incrementQuota(
  provider: "google" | "omdb",
  client: SupabaseClient,
): Promise<void> {
  await client.rpc("increment_quota", { p_provider: provider });
}

// ─── Google IMDb ID resolver ──────────────────────────────────────────────────

const IMDB_ID_RE = /imdb\.com\/title\/(tt\d+)/;

async function resolveImdbId(title: string): Promise<string | null> {
  const key = Deno.env.get("GOOGLE_KEY");
  const cx = Deno.env.get("GOOGLE_CX");
  if (!key || !cx) return null;

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", key);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", `site:imdb.com/title ${title}`);
  url.searchParams.set("num", "5");

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = await res.json();
  const items: Array<{ link?: string }> = data?.items ?? [];

  for (const item of items) {
    const match = item.link?.match(IMDB_ID_RE);
    if (match) return match[1];
  }
  return null;
}

// ─── OMDb fetch ───────────────────────────────────────────────────────────────

interface OmdbResult {
  imdbRating: string | null;
  rtScore: string | null;
  type: string | null;
  year: string | null;
}

async function fetchOmdb(imdbId: string): Promise<OmdbResult | null> {
  const key = Deno.env.get("OMDB_KEY");
  if (!key) return null;

  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("i", imdbId);
  url.searchParams.set("apikey", key);

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = await res.json();
  if (data?.Response === "False") return null;

  const rtEntry = (data?.Ratings as Array<{ Source: string; Value: string }> | undefined)
    ?.find((r) => r.Source === "Rotten Tomatoes");

  return {
    imdbRating: data?.imdbRating && data.imdbRating !== "N/A" ? data.imdbRating : null,
    rtScore: rtEntry?.Value ?? null,
    type: data?.Type ?? null,
    year: data?.Year && data.Year !== "N/A" ? data.Year.slice(0, 4) : null,
  };
}

// ─── Core resolution logic ───────────────────────────────────────────────────

async function resolve(
  netflixTitleId: string,
  title: string,
  hintType: string | null,
  hintYear: string | null,
): Promise<RatingsResult> {
  const client = db();
  const now = new Date();

  // 0. Check manual_overrides — takes precedence over all automated resolution.
  const { data: overrideRow } = await client
    .from("manual_overrides")
    .select("imdb_id")
    .eq("netflix_title_id", netflixTitleId)
    .maybeSingle();

  if (overrideRow?.imdb_id) {
    // Check ratings_cache first before hitting OMDb.
    const { data: cachedRatings } = await client
      .from("ratings_cache")
      .select("imdb_rating, rt_score, payload")
      .eq("imdb_id", overrideRow.imdb_id)
      .gt("expires_at", now.toISOString())
      .maybeSingle();

    if (cachedRatings) {
      return {
        imdbRating: cachedRatings.imdb_rating != null ? String(cachedRatings.imdb_rating) : null,
        rtScore: cachedRatings.rt_score ?? null,
        type: (cachedRatings.payload as Record<string, unknown>)?.type as string ?? null,
        imdbId: overrideRow.imdb_id,
        source: "cache",
      };
    }

    // Fetch fresh ratings for the override.
    if (await isUnderQuota("omdb", client)) {
      const omdb = await fetchOmdb(overrideRow.imdb_id);
      await incrementQuota("omdb", client);

      if (omdb) {
        const ratingsExpiry = new Date(now.getTime() + RATINGS_CACHE_TTL_MS).toISOString();
        await client.from("ratings_cache").upsert({
          imdb_id: overrideRow.imdb_id,
          imdb_rating: omdb.imdbRating != null ? parseFloat(omdb.imdbRating) : null,
          rt_score: omdb.rtScore ?? null,
          payload: omdb,
          fetched_at: now.toISOString(),
          expires_at: ratingsExpiry,
        });

        return {
          imdbRating: omdb.imdbRating,
          rtScore: omdb.rtScore,
          type: omdb.type,
          imdbId: overrideRow.imdb_id,
          source: "google+omdb",
        };
      }
    }

    return { imdbRating: null, rtScore: null, type: null, imdbId: overrideRow.imdb_id, source: "not-found" };
  }

  // 1. Check title_resolution_cache.
  const { data: titleRow } = await client
    .from("title_resolution_cache")
    .select("imdb_id, content_type, release_year")
    .eq("netflix_title_id", netflixTitleId)
    .gt("expires_at", now.toISOString())
    .maybeSingle();

  if (titleRow !== null) {
    // Negative cache hit.
    if (!titleRow.imdb_id) {
      return { imdbRating: null, rtScore: null, type: null, imdbId: null, source: "not-found" };
    }

    // Check ratings_cache.
    const { data: ratingsRow } = await client
      .from("ratings_cache")
      .select("imdb_rating, rt_score, payload")
      .eq("imdb_id", titleRow.imdb_id)
      .gt("expires_at", now.toISOString())
      .maybeSingle();

    if (ratingsRow) {
      return {
        imdbRating: ratingsRow.imdb_rating != null ? String(ratingsRow.imdb_rating) : null,
        rtScore: ratingsRow.rt_score ?? null,
        type: (ratingsRow.payload as Record<string, unknown>)?.type as string ?? null,
        imdbId: titleRow.imdb_id,
        source: "cache",
      };
    }
    // Title cached but ratings stale — fall through to re-fetch OMDb only.
  }

  const imdbIdFromCache = titleRow?.imdb_id ?? null;

  // 2. Resolve IMDb ID via Google (skip if we already have one from cache).
  let imdbId = imdbIdFromCache;

  if (!imdbId) {
    if (!(await isUnderQuota("google", client))) {
      return { imdbRating: null, rtScore: null, type: null, imdbId: null, source: "not-found" };
    }

    imdbId = await resolveImdbId(title);
    await incrementQuota("google", client);

    if (!imdbId) {
      // Negative cache: Google found nothing.
      await client.from("title_resolution_cache").upsert({
        netflix_title_id: netflixTitleId,
        input_title: title,
        imdb_id: null,
        source: "google-primary",
        confidence: 0.0,
        last_verified_at: now.toISOString(),
        expires_at: new Date(now.getTime() + NEGATIVE_CACHE_TTL_MS).toISOString(),
      });
      return { imdbRating: null, rtScore: null, type: null, imdbId: null, source: "not-found" };
    }
  }

  // 3. Fetch OMDb by IMDb ID.
  if (!(await isUnderQuota("omdb", client))) {
    return { imdbRating: null, rtScore: null, type: null, imdbId, source: "not-found" };
  }

  const omdb = await fetchOmdb(imdbId);
  await incrementQuota("omdb", client);

  // 4. Score confidence using OMDb metadata vs. hints from caller.
  //    Only scored when we just did a fresh Google lookup (no prior cache entry).
  if (!imdbIdFromCache) {
    const confidence = scoreConfidence(hintType, hintYear, omdb?.type ?? null, omdb?.year ?? null);

    if (confidence < CONFIDENCE_THRESHOLD) {
      // Low-confidence match — write a short-lived negative cache entry.
      await client.from("title_resolution_cache").upsert({
        netflix_title_id: netflixTitleId,
        input_title: title,
        imdb_id: null,
        source: "google-primary",
        confidence,
        last_verified_at: now.toISOString(),
        expires_at: new Date(now.getTime() + NEGATIVE_CACHE_TTL_MS).toISOString(),
      });
      return { imdbRating: null, rtScore: null, type: null, imdbId: null, source: "not-found" };
    }

    // Confident match — write title_resolution_cache with full metadata.
    await client.from("title_resolution_cache").upsert({
      netflix_title_id: netflixTitleId,
      input_title: title,
      imdb_id: imdbId,
      content_type: omdb?.type ?? null,
      release_year: omdb?.year != null ? parseInt(omdb.year) : null,
      source: "google-primary",
      confidence,
      last_verified_at: now.toISOString(),
      expires_at: new Date(now.getTime() + TITLE_CACHE_TTL_MS).toISOString(),
    });
  }

  const ratingsExpiry = new Date(now.getTime() + RATINGS_CACHE_TTL_MS).toISOString();

  await client.from("ratings_cache").upsert({
    imdb_id: imdbId,
    imdb_rating: omdb?.imdbRating != null ? parseFloat(omdb.imdbRating) : null,
    rt_score: omdb?.rtScore ?? null,
    payload: omdb ?? {},
    fetched_at: now.toISOString(),
    expires_at: ratingsExpiry,
  });

  if (!omdb) {
    return { imdbRating: null, rtScore: null, type: null, imdbId, source: "not-found" };
  }

  return {
    imdbRating: omdb.imdbRating,
    rtScore: omdb.rtScore,
    type: omdb.type,
    imdbId,
    source: "google+omdb",
  };
}

// ─── Request handler ─────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const netflixTitleId = url.searchParams.get("netflixTitleId");
  const title = url.searchParams.get("title");

  if (!netflixTitleId || !title) {
    return new Response(
      JSON.stringify({ error: "netflixTitleId and title are required" }),
      { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  const hintType = url.searchParams.get("type");
  const hintYear = url.searchParams.get("year");

  // In-flight dedup: concurrent requests for the same title share one DB round-trip.
  let promise = inFlight.get(netflixTitleId);
  if (!promise) {
    promise = resolve(netflixTitleId, title, hintType, hintYear).finally(() => {
      inFlight.delete(netflixTitleId);
    });
    inFlight.set(netflixTitleId, promise);
  }

  const result = await promise;
  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
});
