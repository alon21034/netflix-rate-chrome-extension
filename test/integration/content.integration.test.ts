import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface MockBackendPayload {
  type: "movie" | "series";
  imdbRating: string;
  rtScore?: string;
}

function createMockFetch(payloadByTitle: Record<string, MockBackendPayload>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const rawUrl =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const requestUrl = new URL(rawUrl);
    const title = requestUrl.searchParams.get("title") ?? "";
    const payload = payloadByTitle[title.toLowerCase()];

    if (!payload) {
      return {
        ok: true,
        async json() {
          return { imdbRating: null, rtScore: null, type: null, imdbId: null, source: "not-found" };
        },
      } as Response;
    }

    return {
      ok: true,
      async json() {
        return {
          imdbRating: payload.imdbRating,
          rtScore: payload.rtScore ?? null,
          type: payload.type,
          imdbId: "tt0000001",
          source: "google+omdb",
        };
      },
    } as Response;
  });
}

function forceHovered(card: HTMLElement): void {
  const originalMatches = card.matches.bind(card);
  card.matches = ((selector: string) =>
    selector === ":hover" ? true : originalMatches(selector)) as typeof card.matches;
}

async function waitFor(assertion: () => void, attempts = 40): Promise<void> {
  let lastError: unknown;

  for (let index = 0; index < attempts; index += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  }

  throw lastError;
}

async function bootContentScript(): Promise<void> {
  vi.resetModules();
  await import("../../src/content.ts");
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

function getBadgeText(card: HTMLElement): string {
  const host = card.querySelector("div[data-nfr-overlay-host]") as HTMLDivElement | null;
  return host?.shadowRoot?.textContent ?? "";
}

describe("Content script integration", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders correct badges for 5+ movies and 5+ TV shows", async () => {
    const movieEntries = [
      ["Inception", { type: "movie", imdbRating: "8.8", rtScore: "87%" }],
      ["Interstellar", { type: "movie", imdbRating: "8.7", rtScore: "73%" }],
      ["Arrival", { type: "movie", imdbRating: "7.9", rtScore: "94%" }],
      ["Parasite", { type: "movie", imdbRating: "8.5", rtScore: "99%" }],
      ["Whiplash", { type: "movie", imdbRating: "8.5", rtScore: "94%" }],
    ] as const;
    const seriesEntries = [
      ["Dark", { type: "series", imdbRating: "8.7" }],
      ["Severance", { type: "series", imdbRating: "8.7" }],
      ["Narcos", { type: "series", imdbRating: "8.8" }],
      ["Mindhunter", { type: "series", imdbRating: "8.6" }],
      ["Arcane", { type: "series", imdbRating: "9.0" }],
    ] as const;

    const payloadByTitle = Object.fromEntries(
      [...movieEntries, ...seriesEntries].map(([title, payload]) => [
        title.toLowerCase(),
        payload,
      ])
    );

    const fetchMock = createMockFetch(payloadByTitle);
    globalThis.fetch = fetchMock as typeof fetch;

    const moviesHtml = movieEntries
      .map(
        ([title], index) =>
          `<div class="title-card" data-kind="movie" data-title="${title}" data-id="8010017${index}"></div>`
      )
      .join("");
    const seriesHtml = seriesEntries
      .map(
        ([title], index) =>
          `<div class="title-card" data-kind="series" data-title="${title}" data-id="8020017${index}"></div>`
      )
      .join("");

    document.body.innerHTML = `
      <div class="lolomoRow">
        ${moviesHtml}
        ${seriesHtml}
      </div>
    `;

    await bootContentScript();

    const movieCards = document.querySelectorAll<HTMLElement>(".title-card[data-kind='movie']");
    const seriesCards = document.querySelectorAll<HTMLElement>(".title-card[data-kind='series']");
    [...movieCards, ...seriesCards].forEach((card) => {
      forceHovered(card);
      card.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    });

    await waitFor(() => {
      movieCards.forEach((card) => {
        const badgeText = getBadgeText(card);
        expect(badgeText).toContain("⭐");
        expect(badgeText).toContain("🍅");
      });

      seriesCards.forEach((card) => {
        const badgeText = getBadgeText(card);
        expect(badgeText).toContain("⭐");
        expect(badgeText).not.toContain("🍅");
      });
    });
  });

  it("reuses in-flight requests and cache for repeated titles", async () => {
    let resolveFetch: (() => void) | null = null;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = () => {
            resolve({
              ok: true,
              async json() {
                return {
                  imdbRating: "8.1",
                  rtScore: "91%",
                  type: "movie",
                  imdbId: "tt0816692",
                  source: "google+omdb",
                };
              },
            } as Response);
          };
        })
    );
    globalThis.fetch = fetchMock as typeof fetch;

    document.body.innerHTML = `
      <div class="lolomoRow">
        <div class="title-card" data-title="Interstellar" data-id="80057281"></div>
        <div class="title-card" data-title="Interstellar" data-id="80057281"></div>
      </div>
    `;

    await bootContentScript();

    const cards = document.querySelectorAll<HTMLElement>(".title-card");
    const first = cards[0];
    const second = cards[1];
    forceHovered(first);
    forceHovered(second);

    first.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    second.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    resolveFetch?.();

    await waitFor(() => {
      expect(getBadgeText(first)).toContain("⭐ 8.1");
      expect(getBadgeText(second)).toContain("⭐ 8.1");
    });

    first.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    expect(first.querySelector("div[data-nfr-overlay-host]")).toBeNull();

    first.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    await waitFor(() => {
      expect(getBadgeText(first)).toContain("⭐ 8.1");
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("supports row-container selector and title extraction from heading tags", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const fetchMock = createMockFetch({
      severance: { type: "series", imdbRating: "8.7" },
    });
    globalThis.fetch = fetchMock as typeof fetch;

    document.body.innerHTML = `
      <div data-uia="row-container">
        <div class="slider-refocus">
          <h3>Severance</h3>
        </div>
      </div>
    `;

    await bootContentScript();

    const card = document.querySelector<HTMLElement>(".slider-refocus");
    if (!card) {
      throw new Error("Expected slider-refocus card to exist");
    }
    forceHovered(card);

    card.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

    await waitFor(() => {
      expect(getBadgeText(card)).toContain("⭐ 8.7");
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
