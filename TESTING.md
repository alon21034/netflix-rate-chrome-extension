# TESTING

## Prerequisites
- Node.js 18+
- Google Chrome

## Build
```bash
npm install
npm run build
```

## Load In Chrome
1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the `dist/` folder.

## Get OMDb API Key
1. Sign up at https://www.omdbapi.com/apikey.aspx.
2. Use the free tier (1000 requests/day).

## Configure The Extension
1. Click the extension icon.
2. Paste your OMDb API key.
3. Click **Save**.

## Test On Netflix
1. Go to https://www.netflix.com.
2. Hover title cards.
3. Verify badges appear.

## What To Check
- Movies show IMDb + Rotten Tomatoes.
- TV shows show IMDb only.
- Cache deduplicates API calls.

## Run Tests
```bash
npm run test:integration
```
