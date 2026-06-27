# AnimeKiosk Desktop — Electron Kiosk Browser

A focused, ad-free desktop browser locked to the anime streaming whitelist.
Runs on **Windows, macOS, and Linux**.

## Whitelisted sites (default)

| Domain | Purpose |
|--------|---------|
| `animepahe.pw` | Main site (home page) |
| `kwik.si` | Video streaming CDN |
| `kwik.cx` | Video streaming CDN |
| `pahe.win` | Redirect shortlink |

Subdomains are automatically included (e.g. `www.kwik.si`).

---

## Requirements

| Tool | Version |
|------|---------|
| Node.js | 18 LTS or 20 LTS |
| npm / pnpm | bundled with Node.js |

Download Node.js from https://nodejs.org (LTS version).

---

## Quick start (run in development)

```bash
# 1 — Install dependencies
npm install

# 2 — Launch the app
npm start
```

The app opens a window with a dark toolbar at the top and the site loaded below.

---

## How blocking works

### Layer 1 — Network interception (strongest)
`session.defaultSession.webRequest.onBeforeRequest` intercepts **every** HTTP/S
request before it leaves the machine. Requests to non-whitelisted hosts — including
third-party ad/tracker domains — are cancelled at the OS network level.

Known ad/tracker patterns that are always blocked regardless of whitelist:
`doubleclick.net`, `googlesyndication.com`, `googletagmanager.com`,
`adnxs.com`, `prebid`, `taboola`, `outbrain`, etc.

### Layer 2 — Navigation events
`will-navigate` and `will-redirect` events on `webContents` block cross-origin
redirects before the renderer even starts loading them.

### Layer 3 — Window.open / popups
`setWindowOpenHandler` returns `{ action: 'deny' }` for every popup request.
Whitelisted popup URLs are redirected in-place instead of opening a new window.

### Layer 4 — JS guard (`assets/guard.js`)
Injected via `executeJavaScript` on every `dom-ready`. Overrides `window.open`,
`location.assign/replace`, `history.pushState/replaceState`, `document.createElement`
(for scripts/iframes), and uses a `MutationObserver` to remove injected ad iframes.

---

## Keyboard shortcuts

| Action | Windows/Linux | macOS |
|--------|--------------|-------|
| Home | Ctrl+H | Cmd+H |
| Back | Alt+← | Alt+← |
| Forward | Alt+→ | Alt+→ |
| Reload | Ctrl+R | Cmd+R |
| Settings | Ctrl+, | Cmd+, |
| Zoom In | Ctrl+= | Cmd+= |
| Zoom Out | Ctrl+- | Cmd+- |
| Reset Zoom | Ctrl+0 | Cmd+0 |
| Quit | Ctrl+Q | Cmd+Q |

---

## Settings

Click the ⚙ button (or Ctrl+,) to edit:
- **Home URL** — the page loaded on startup and when you press ⌂
- **Allowed domains** — one per line; changes take effect immediately after saving

Settings are saved to your OS user-data folder and persist across restarts.

---

## Build a distributable installer

Install the build tool first:

```bash
npm install --save-dev electron-builder
```

Then build for your platform:

```bash
# Windows (.exe installer)
npm run build:win

# macOS (.dmg)
npm run build:mac

# Linux (.AppImage)
npm run build:linux
```

Output lands in the `dist/` folder.

> **Note:** macOS `.dmg` builds must be created on a Mac.
> Windows builds can be cross-compiled from Linux/macOS.

---

## Customise the whitelist at build time

Edit the `DEFAULT_SETTINGS` object in `main.js`:

```js
const DEFAULT_SETTINGS = {
  whitelist: ['animepahe.pw', 'kwik.si', 'kwik.cx', 'pahe.win'],
  homeUrl:   'https://animepahe.pw'
};
```

Also update the `ALLOWED` array in `assets/guard.js` to match.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Blank window on launch | Run `npm start` from terminal and check the console for errors |
| Videos don't play | Most HTML5 video works natively; if a site uses DRM (Widevine) it may need the full Chrome |
| App crashes immediately | Ensure Node.js ≥ 18 is installed: `node -v` |
| Site blocks the Electron UA | Edit the `userAgent` in `main.js` `session` settings |
| Settings not saving | Check write permissions to the Electron user-data folder |
