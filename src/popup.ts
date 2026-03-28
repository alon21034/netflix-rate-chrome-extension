import './popup.css';

const OMDB_KEY = 'omdbKey';
const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Popup root element not found');
}

root.innerHTML = `
  <main class="popup">
    <h1>OMDb API Key</h1>
    <label class="field" for="omdb-key">API key</label>
    <input id="omdb-key" class="input" type="text" autocomplete="off" spellcheck="false" />
    <button id="save-key" class="button" type="button">Save</button>
    <p id="status" class="status" aria-live="polite"></p>
  </main>
`;

const keyInput = root.querySelector<HTMLInputElement>('#omdb-key');
const saveButton = root.querySelector<HTMLButtonElement>('#save-key');
const statusText = root.querySelector<HTMLParagraphElement>('#status');

if (!keyInput || !saveButton || !statusText) {
  throw new Error('Popup elements missing');
}

const keyInputEl = keyInput;
const saveButtonEl = saveButton;
const statusTextEl = statusText;

function showStatus(message: string): void {
  statusTextEl.textContent = message;
}

function loadKey(): void {
  chrome.storage.local.get(OMDB_KEY, (items: Record<string, unknown>) => {
    const saved = items[OMDB_KEY];
    if (typeof saved === 'string') {
      keyInputEl.value = saved;
      showStatus('Loaded saved key.');
      return;
    }

    showStatus('No key saved.');
  });
}

saveButtonEl.addEventListener('click', () => {
  const key = keyInputEl.value.trim();
  chrome.storage.local.set({ [OMDB_KEY]: key }, () => {
    showStatus(key ? 'Key saved.' : 'Key cleared.');
  });
});

loadKey();
