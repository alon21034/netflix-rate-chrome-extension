const BACKEND_URL =
  (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_RATINGS_API_URL) ||
  "https://YOUR_PROJECT.supabase.co/functions/v1/ratings";

const CACHE_PREFIX = "nfr_cache_";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface CacheEntry {
  imdbRating: string | null;
  rtScore: string | null;
  type: string | null;
  expiresAt: number;
}

interface BackendResponse {
  imdbRating: string | null;
  rtScore: string | null;
  type: string | null;
}

function getCacheKey(id: string): string {
  return `${CACHE_PREFIX}${id}`;
}

function hasLocalStorage(): boolean {
  return typeof globalThis !== "undefined" && typeof globalThis.localStorage !== "undefined";
}

function readCache(id: string): CacheEntry | null {
  if (!hasLocalStorage()) {
    return null;
  }

  const key = getCacheKey(id);

  try {
    const raw = globalThis.localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed || typeof parsed.expiresAt !== "number") {
      globalThis.localStorage.removeItem(key);
      return null;
    }

    if (Date.now() > parsed.expiresAt) {
      globalThis.localStorage.removeItem(key);
      return null;
    }

    return parsed;
  } catch {
    globalThis.localStorage.removeItem(key);
    return null;
  }
}

function writeCache(id: string, entry: CacheEntry): void {
  if (!hasLocalStorage()) {
    return;
  }

  try {
    globalThis.localStorage.setItem(getCacheKey(id), JSON.stringify(entry));
  } catch {
    // Best effort cache write only.
  }
}

export function normalizeTitle(title: string): string {
  if (!title) {
    return "";
  }

  return title
    .replace(/\s*\(?\d{4}\)?\s*$/, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export async function fetchRatingsForTitle(
  title: string,
  netflixTitleId: string,
  fetchImpl: typeof fetch = fetch
): Promise<CacheEntry> {
  const cacheId = netflixTitleId || normalizeTitle(title);
  const cached = cacheId ? readCache(cacheId) : null;
  if (cached) {
    return cached;
  }

  const failureEntry: CacheEntry = {
    imdbRating: null,
    rtScore: null,
    type: null,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  if (!title) {
    return failureEntry;
  }

  const url = new URL(BACKEND_URL);
  url.searchParams.set("netflixTitleId", netflixTitleId);
  url.searchParams.set("title", title);
  url.searchParams.set(
    "locale",
    typeof navigator !== "undefined" ? navigator.language : "en-US"
  );

  try {
    const response = await fetchImpl(url.toString());
    if (!response.ok) {
      if (cacheId) writeCache(cacheId, failureEntry);
      return failureEntry;
    }

    const payload = (await response.json()) as BackendResponse;
    const entry: CacheEntry = {
      imdbRating: payload.imdbRating ?? null,
      rtScore: payload.rtScore ?? null,
      type: payload.type ?? null,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    if (cacheId) writeCache(cacheId, entry);
    return entry;
  } catch {
    if (cacheId) writeCache(cacheId, failureEntry);
    return failureEntry;
  }
}
