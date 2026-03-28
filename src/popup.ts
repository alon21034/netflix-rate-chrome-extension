import './popup.css';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Popup root element not found');
}

root.innerHTML = `
  <main class="popup">
    <h1>Netflix Ratings Overlay</h1>
    <p>Extension scaffold ready.</p>
  </main>
`;
