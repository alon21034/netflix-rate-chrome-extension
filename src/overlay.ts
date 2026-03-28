export interface OverlayRatingData {
  imdbRating: string | null;
  rtScore: string | null;
  type: string | null;
}

const OVERLAY_HOST_ATTR = "data-nfr-overlay-host";

function ensureCardIsPositioned(card: HTMLElement): void {
  const currentPosition = window.getComputedStyle(card).position;
  if (!currentPosition || currentPosition === "static") {
    card.style.position = "relative";
  }
}

function getOrCreateHost(card: HTMLElement): HTMLDivElement {
  const existing = card.querySelector<HTMLDivElement>(
    `:scope > div[${OVERLAY_HOST_ATTR}]`
  );
  if (existing) {
    return existing;
  }

  const host = document.createElement("div");
  host.setAttribute(OVERLAY_HOST_ATTR, "1");
  host.style.pointerEvents = "none";
  card.appendChild(host);
  return host;
}

function toDisplayValue(value: string | null): string {
  if (!value) {
    return "N/A";
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "N/A";
}

function shouldShowRottenTomatoes(type: string | null): boolean {
  return type?.toLowerCase() === "movie";
}

export function renderRatingsBadge(
  card: HTMLElement,
  ratings: OverlayRatingData
): HTMLDivElement {
  ensureCardIsPositioned(card);
  const host = getOrCreateHost(card);
  const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });

  const imdbText = toDisplayValue(ratings.imdbRating);
  const rtText = toDisplayValue(ratings.rtScore);
  const showRt = shouldShowRottenTomatoes(ratings.type);

  shadowRoot.innerHTML = `
    <style>
      .nfr-badge {
        position: absolute;
        bottom: 8px;
        left: 8px;
        z-index: 9999;
        background: rgba(0, 0, 0, 0.75);
        color: #fff;
        border-radius: 4px;
        padding: 4px 6px;
        font-size: 12px;
        line-height: 1.2;
        display: inline-flex;
        gap: 6px;
        align-items: center;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        white-space: nowrap;
      }
    </style>
    <div class="nfr-badge">
      <span>⭐ ${imdbText}</span>
      ${showRt ? `<span>🍅 ${rtText}</span>` : ""}
    </div>
  `;

  return host;
}

