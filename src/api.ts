const OMDB_API_URL = "https://www.omdbapi.com/";
const CACHE_PREFIX = "nfr_cache_";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const OMDB_KEY_STORAGE_KEY = "omdbKey";

export interface CacheEntry {
  imdbRating: string | null;
  rtScore: string | null;
  type: string | null;
  expiresAt: number;
}

interface OmdbRating {
  Source?: string;
  Value?: string;
}

interface OmdbResponse {
  Response?: string;
  Error?: string;
  Type?: string;
  imdbRating?: string;
  Ratings?: OmdbRating[];
}

function getCacheKey(normalizedTitle: string): string {
  return `${CACHE_PREFIX}${normalizedTitle}`;
}

function hasLocalStorage(): boolean {
  return typeof globalThis !== "undefined" && typeof globalThis.localStorage !== "undefined";
}

function readCache(normalizedTitle: string): CacheEntry | null {
  if (!hasLocalStorage()) {
    return null;
  }

  const key = getCacheKey(normalizedTitle);

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

function writeCache(normalizedTitle: string, entry: CacheEntry): void {
  if (!hasLocalStorage()) {
    return;
  }

  try {
    globalThis.localStorage.setItem(getCacheKey(normalizedTitle), JSON.stringify(entry));
  } catch {
    // Best effort cache write only.
  }
}

function normalizeOmdbValue(value?: string): string | null {
  if (!value || value === "N/A") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractRottenTomatoesScore(ratings?: OmdbRating[]): string | null {
  if (!Array.isArray(ratings)) {
    return null;
  }

  const rt = ratings.find((item) => item.Source === "Rotten Tomatoes");
  return normalizeOmdbValue(rt?.Value);
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

export async function fetchOmdbRatings(
  title: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<CacheEntry> {
  const normalizedTitle = normalizeTitle(title);
  const cached = normalizedTitle ? readCache(normalizedTitle) : null;
  if (cached) {
    return cached;
  }

  const failureEntry: CacheEntry = {
    imdbRating: null,
    rtScore: null,
    type: null,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  if (!normalizedTitle || !apiKey || apiKey.trim().length === 0) {
    if (normalizedTitle) {
      writeCache(normalizedTitle, failureEntry);
    }
    return failureEntry;
  }

  const url = new URL(OMDB_API_URL);
  url.searchParams.set("t", normalizedTitle);
  url.searchParams.set("apikey", apiKey.trim());

  try {
    const response = await fetchImpl(url.toString());
    if (!response.ok) {
      writeCache(normalizedTitle, failureEntry);
      return failureEntry;
    }

    const payload = (await response.json()) as OmdbResponse;
    if (!payload || payload.Response === "False") {
      writeCache(normalizedTitle, failureEntry);
      return failureEntry;
    }

    const entry: CacheEntry = {
      imdbRating: normalizeOmdbValue(payload.imdbRating),
      rtScore: extractRottenTomatoesScore(payload.Ratings),
      type: normalizeOmdbValue(payload.Type),
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    if (!entry.imdbRating && !entry.rtScore) {
      writeCache(normalizedTitle, failureEntry);
      return failureEntry;
    }

    writeCache(normalizedTitle, entry);
    return entry;
  } catch {
    writeCache(normalizedTitle, failureEntry);
    return failureEntry;
  }
}

export function getStoredOmdbKey(): Promise<string> {
  return new Promise((resolve) => {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      resolve("");
      return;
    }

    chrome.storage.local.get(OMDB_KEY_STORAGE_KEY, (items: Record<string, unknown>) => {
      const saved = items[OMDB_KEY_STORAGE_KEY];
      resolve(typeof saved === "string" ? saved.trim() : "");
    });
  });
}

export async function fetchRatingsForTitle(title: string): Promise<CacheEntry> {
  const apiKey = await getStoredOmdbKey();
  return fetchOmdbRatings(title, apiKey);
}
