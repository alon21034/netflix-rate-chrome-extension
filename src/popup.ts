import './popup.css';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Popup root element not found');
}

root.innerHTML = `
  <main class="popup">
    <h1>Netflix Ratings Overlay</h1>
    <p class="status">Extension is active. Ratings are loaded automatically when you hover over titles on Netflix.</p>
  </main>
`;
