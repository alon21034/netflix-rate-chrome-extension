import { fetchRatingsForTitle, normalizeTitle } from "./api";
import { removeRatingsBadge, renderRatingsBadge } from "./overlay";

const ROW_SELECTOR = ".lolomoRow, [data-uia='row-container']";
const CARD_SELECTOR =
  "[data-uia='title-card'], .title-card-container, .slider-refocus, .title-card";
const TITLE_SELECTOR_PRIORITY = ["h2", "h3", ".title"];
const DEBOUNCE_DELAY_MS = 300;

const observedRows = new WeakSet<HTMLElement>();
const observedCards = new WeakSet<HTMLElement>();
const inFlightRatings = new Map<string, ReturnType<typeof fetchRatingsForTitle>>();

function debounce(callback: () => void, delayMs: number): () => void {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;

  return () => {
    if (timeoutId !== undefined) {
      globalThis.clearTimeout(timeoutId);
    }
    timeoutId = globalThis.setTimeout(callback, delayMs);
  };
}

function getCardTitle(card: HTMLElement): string | null {
  const fromDataTitle = card.getAttribute("data-title")?.trim();
  if (fromDataTitle) {
    return fromDataTitle;
  }

  for (const selector of TITLE_SELECTOR_PRIORITY) {
    const fromElement = card.querySelector<HTMLElement>(selector)?.textContent?.trim();
    if (fromElement) {
      return fromElement;
    }
  }

  return null;
}

function getNetflixTitleId(card: HTMLElement): string {
  if (card.dataset.id) {
    return card.dataset.id;
  }

  const link = card.closest<HTMLAnchorElement>("a[href*='/title/']");
  if (link) {
    const match = link.href.match(/\/title\/(\d+)/);
    if (match) {
      return match[1];
    }
  }

  return "";
}

function getTitleLookupKey(title: string, netflixTitleId: string): string {
  if (netflixTitleId) {
    return netflixTitleId;
  }

  const normalized = normalizeTitle(title);
  return normalized || title.trim().toLowerCase();
}

async function onCardMouseEnter(event: MouseEvent): Promise<void> {
  const card = event.currentTarget;
  if (!(card instanceof HTMLElement)) {
    return;
  }

  const title = getCardTitle(card);
  if (!title) {
    return;
  }

  const netflixTitleId = getNetflixTitleId(card);
  const lookupKey = getTitleLookupKey(title, netflixTitleId);
  if (!lookupKey) {
    return;
  }

  let pending = inFlightRatings.get(lookupKey);
  if (!pending) {
    pending = fetchRatingsForTitle(title, netflixTitleId).finally(() => {
      inFlightRatings.delete(lookupKey);
    });
    inFlightRatings.set(lookupKey, pending);
  }

  const ratings = await pending;
  if (!card.matches(":hover")) {
    return;
  }

  renderRatingsBadge(card, ratings);
}

function onCardMouseLeave(event: MouseEvent): void {
  const card = event.currentTarget;
  if (!(card instanceof HTMLElement)) {
    return;
  }

  removeRatingsBadge(card);
}

function attachCardListeners(card: HTMLElement): void {
  if (observedCards.has(card)) {
    return;
  }

  observedCards.add(card);
  card.addEventListener("mouseenter", onCardMouseEnter);
  card.addEventListener("mouseleave", onCardMouseLeave);
}

function bindCardsInRow(row: HTMLElement): void {
  const cards = row.querySelectorAll<HTMLElement>(CARD_SELECTOR);
  cards.forEach((card) => attachCardListeners(card));
}

function observeRow(row: HTMLElement): void {
  if (observedRows.has(row)) {
    return;
  }

  observedRows.add(row);
  bindCardsInRow(row);

  const debouncedBind = debounce(() => {
    bindCardsInRow(row);
  }, DEBOUNCE_DELAY_MS);

  const observer = new MutationObserver(() => {
    debouncedBind();
  });

  observer.observe(row, { childList: true, subtree: true });
}

function observeRows(): void {
  const rows = document.querySelectorAll<HTMLElement>(ROW_SELECTOR);
  rows.forEach((row) => observeRow(row));
}

function startContentScript(): void {
  observeRows();

  const debouncedObserveRows = debounce(observeRows, DEBOUNCE_DELAY_MS);
  const rootObserver = new MutationObserver(() => {
    debouncedObserveRows();
  });

  rootObserver.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startContentScript, { once: true });
} else if (document.body) {
  startContentScript();
}
