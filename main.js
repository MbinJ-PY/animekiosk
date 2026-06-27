const { app, BrowserWindow, BrowserView, ipcMain, session, Menu, shell } = require('electron');
const path = require('path');
const fs   = require('fs');

// Match the Chromium version bundled with Electron 33 (Cloudflare checks this).
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.118 Safari/537.36';
const CHROME_SEC_CH_UA = '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"';
const SITE_PARTITION = 'persist:animekiosk';

app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
// Keep third-party cookies/storage working for Cloudflare Turnstile iframes.
app.commandLine.appendSwitch(
  'disable-features',
  'ThirdPartyCookieDeprecation,ThirdPartyStoragePartitioning,FirstPartySets'
);
// ─── Persist settings via a simple JSON file ──────────────────────────────
const userDataPath  = app.getPath('userData');
const settingsPath  = path.join(userDataPath, 'settings.json');

const DEFAULT_SETTINGS = {
  whitelist: [    'animepahe.pw',
    'kwik.si',
    'kwik.cx',
    'pahe.win',
    'cloudflare.com',
    'cloudflare.net',
    'stun.cloudflare.com',
    'google.com'
  ],
  homeUrl: 'https://animepahe.pw/',
  allowEmbedding: false,
  cfClearance: ''
};


// Normalize whitelist entries to hostnames only
function normalizeWhitelist(list) {
  return (list || []).map(entry => {
    try {
      const s = String(entry).trim();
      if (s.includes('://')) {
        return new URL(s).hostname.toLowerCase().replace(/^www\./, '');
      }
      return s.toLowerCase().replace(/^www\./, '').split('/')[0];
    } catch {
      return String(entry).toLowerCase().replace(/^www\./, '').split('/')[0];
    }
  }).filter(Boolean);
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    const merged = Object.assign({}, DEFAULT_SETTINGS, parsed);
    const savedList = normalizeWhitelist(parsed.whitelist);
    merged.whitelist = [...new Set([...normalizeWhitelist(DEFAULT_SETTINGS.whitelist), ...savedList])];
    // Validate homeUrl
    try {
      const u = new URL(merged.homeUrl);
      if (!/^https?:$/.test(u.protocol)) merged.homeUrl = DEFAULT_SETTINGS.homeUrl;
    } catch {
      merged.homeUrl = DEFAULT_SETTINGS.homeUrl;
    }
    return merged;
  } catch {
    const copy = Object.assign({}, DEFAULT_SETTINGS);
    copy.whitelist = normalizeWhitelist(copy.whitelist);
    return copy;
  }
}

function saveSettings(s) {
  fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2), 'utf8');
}

let settings = loadSettings();

// ─── Guard JS (loaded once) ────────────────────────────────────────────────
const GUARD_JS = fs.readFileSync(path.join(__dirname, 'assets', 'guard.js'), 'utf8');

// ─── Cloudflare / captcha pages must not get guard.js injected ─────────────
function isCloudflareChallenge(urlStr) {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();
    if (host === 'challenges.cloudflare.com') return true;
    if (host.endsWith('.cloudflare.com') && path.includes('challenge')) return true;
    if (path.includes('/cdn-cgi/challenge-platform')) return true;
    if (path.includes('/cdn-cgi/challenge')) return true;
    if (u.search.includes('__cf_chl')) return true;
  } catch {
    return false;
  }
  return false;
}

function shouldInjectGuard(urlStr) {
  if (!urlStr || urlStr.startsWith('file:')) return false;
  if (isCloudflareChallenge(urlStr)) return false;
  return true;
}

// ─── URL whitelist check ───────────────────────────────────────────────────
function isAllowed(urlStr) {
  try {
    const host = new URL(urlStr).hostname.toLowerCase().replace(/^www\./, '');
    return settings.whitelist.some(entry =>
      host === entry || host.endsWith('.' + entry)
    );
  } catch {
    return false;
  }
}

function getSiteSession() {
  return session.fromPartition(SITE_PARTITION);
}

function setupSiteSession() {
  const siteSession = getSiteSession();

  siteSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(true));
  siteSession.setPermissionCheckHandler(() => true);

  const AD_PATTERNS = [
    /doubleclick\.net/i,
    /googlesyndication\.com/i,
    /googletagmanager\.com/i,
    /adnxs\.com/i,
    /moatads\.com/i,
    /amazon-adsystem\.com/i,
    /pagead\//i,
    /\/ads?\//i,
    /prebid/i,
    /outbrain/i,
    /taboola/i
  ];

  siteSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, cb) => {
    const url = details.url;
    if (url.toLowerCase().startsWith('file:')) { cb({}); return; }
    if (/cloudflare\.com|hcaptcha\.com|turnstile\.cloudflare/i.test(url)) { cb({}); return; }
    if (AD_PATTERNS.some(p => p.test(url))) { cb({ cancel: true }); return; }
    cb({});
  });

  siteSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://*/*', 'http://*/*'] },
    (details, cb) => {
      const headers = details.requestHeaders;
      headers['User-Agent'] = CHROME_UA;
      headers['Sec-CH-UA'] = CHROME_SEC_CH_UA;
      headers['Sec-CH-UA-Mobile'] = '?0';
      headers['Sec-CH-UA-Platform'] = '"Windows"';
      headers['Sec-CH-UA-Full-Version-List'] =
        '"Chromium";v="130.0.6723.118", "Google Chrome";v="130.0.6723.118", "Not?A_Brand";v="99.0.0.0"';
      headers['Accept-Language'] = headers['Accept-Language'] || 'en-US,en;q=0.9';
      cb({ requestHeaders: headers });
    }
  );

  return siteSession;
}

async function applyCfClearanceCookie(value) {
  if (!value || !value.trim()) return;
  const siteSession = getSiteSession();
  let host = 'animepahe.pw';
  try { host = new URL(settings.homeUrl).hostname; } catch {}
  await siteSession.cookies.set({
    url: `https://${host}`,
    name: 'cf_clearance',
    value: value.trim(),
    domain: `.${host.replace(/^www\./, '')}`,
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'no_restriction'
  });
}

// ─── Windows ───────────────────────────────────────────────────────────────let mainWindow = null;
let browserView = null;
let appMenu = null;
let lastFailedUrl = '';
let isPageFailed = false;

const ICON_PATH = path.join(__dirname, 'assets', 'icon.png');

function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'AnimeKiosk',
    icon: ICON_PATH,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the chrome toolbar
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // ── BrowserView for the actual site ──────────────────────────────────────
  browserView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'content-preload.js'),
      partition: SITE_PARTITION,
      webSecurity: true
    }
  });
  mainWindow.addBrowserView(browserView);
  fitBrowserView();

  // Resize BrowserView when window resizes
  mainWindow.on('resize', fitBrowserView);
  mainWindow.on('closed', () => {
    mainWindow = null;
    browserView = null;
  });

  browserView.webContents.setUserAgent(CHROME_UA);

  // ── Popups: load in same BrowserView (do not spawn new windows)
  browserView.webContents.setWindowOpenHandler(({ url }) => {
    safeLoadURL(url);
    return { action: 'deny' };
  });

  // ── Inject guard.js only on normal pages (never during CF captcha) ────────
  browserView.webContents.on('dom-ready', () => {
    const url = browserView.webContents.getURL();
    if (shouldInjectGuard(url)) {
      browserView.webContents.executeJavaScript(GUARD_JS).catch(() => {});
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('url-changed', url);
    }
  });

  browserView.webContents.on('did-navigate', (_, url) => {
    console.log(`[Main] did-navigate: ${url}`);
    isPageFailed = false;
    fitBrowserView();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('url-changed', url);
      mainWindow.webContents.send('can-go-back',    browserView.webContents.navigationHistory.canGoBack());
      mainWindow.webContents.send('can-go-forward', browserView.webContents.navigationHistory.canGoForward());
      mainWindow.webContents.send('load-success');
    }
  });

  browserView.webContents.on('did-navigate-in-page', (_, url) => {
    console.log(`[Main] did-navigate-in-page: ${url}`);
    isPageFailed = false;
    fitBrowserView();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('url-changed', url);
      mainWindow.webContents.send('can-go-back',    browserView.webContents.navigationHistory.canGoBack());
      mainWindow.webContents.send('can-go-forward', browserView.webContents.navigationHistory.canGoForward());
      mainWindow.webContents.send('load-success');
    }
  });

  browserView.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.log(`[Main] did-fail-load: errorCode=${errorCode}, desc=${errorDescription}, url=${validatedURL}, isMainFrame=${isMainFrame}`);
    if (isMainFrame && errorCode !== -3) { // Ignore -3 (aborted requests)
      lastFailedUrl = validatedURL;
      isPageFailed = true;
      if (browserView && !browserView.webContents.isDestroyed()) {
        browserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log(`[Main] Sending load-error to renderer for: ${validatedURL}`);
        mainWindow.webContents.send('load-error', { errorDescription, url: validatedURL });
      }
    }
  });

  // ── Enforce whitelist on all navigations (links, redirects, etc.) ────────
  browserView.webContents.on('will-navigate', (event, url) => {
    if (!isAllowed(url)) {
      event.preventDefault();
      notifyBlocked(url);
    }
  });

  // ── Load home page ────────────────────────────────────────────────────────
  mainWindow.webContents.once('did-finish-load', () => {
    console.log(`[Main] MainWindow finished loading index.html. Now loading homeUrl: ${settings.homeUrl}`);
    safeLoadURL(settings.homeUrl);
  });

  // ── Application menu ──────────────────────────────────────────────────────
  const menu = Menu.buildFromTemplate([
    {
      label: 'Navigate',
      submenu: [
        { label: 'Home',    accelerator: 'CmdOrCtrl+H', click: () => safeLoadURL(settings.homeUrl) },
        { label: 'Back',    accelerator: 'Alt+Left',  click: () => browserView.webContents.navigationHistory.canGoBack()    && browserView.webContents.navigationHistory.goBack()    },
        { label: 'Forward', accelerator: 'Alt+Right', click: () => browserView.webContents.navigationHistory.canGoForward() && browserView.webContents.navigationHistory.goForward() },
        { label: 'Reload',  accelerator: 'CmdOrCtrl+R', click: () => browserView.webContents.reload() },
        { label: 'Clear Site Data & Reload', click: async () => {
          await getSiteSession().clearStorageData();
          safeLoadURL(settings.homeUrl);
        }},
        { label: 'Open Home in System Browser', click: () => shell.openExternal(settings.homeUrl) },
        { type: 'separator' },
        { label: 'Downloads…', accelerator: 'CmdOrCtrl+Shift+D', click: createDownloadWindow },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: openSettings },
        { type: 'separator' },
        { label: 'Quit',    accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle DevTools (BrowserView)', click: () => browserView.webContents.toggleDevTools() },
        { label: 'Zoom In',  accelerator: 'CmdOrCtrl+=', click: () => { const z = browserView.webContents.getZoomFactor(); browserView.webContents.setZoomFactor(Math.min(z + 0.1, 3)); } },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => { const z = browserView.webContents.getZoomFactor(); browserView.webContents.setZoomFactor(Math.max(z - 0.1, 0.3)); } },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', click: () => browserView.webContents.setZoomFactor(1) }
      ]
    }
  ]);
  appMenu = menu;
  Menu.setApplicationMenu(menu);
}

function fitBrowserView() {
  if (!mainWindow || !browserView) return;
  if (isPageFailed) {
    browserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    return;
  }
  const [w, h] = mainWindow.getContentSize();
  const TOOLBAR_HEIGHT = 48;
  browserView.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width: w, height: h - TOOLBAR_HEIGHT });
}

function notifyBlocked(url) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('blocked', url);
  }
}

// Load a URL only if it's allowed; otherwise notify and do not attempt to load.
function safeLoadURL(url) {
  try {
    if (!browserView || browserView.webContents.isDestroyed()) return;
    if (!url) return;
    const s = String(url).trim();
    if (s.toLowerCase().startsWith('file:')) { browserView.webContents.loadURL(s); return; }
    if (isAllowed(s)) {
      browserView.webContents.loadURL(s);
    } else {
      notifyBlocked(s);
    }
  } catch (e) {
    // ignore errors
  }
}

// ─── Settings window ───────────────────────────────────────────────────────
let settingsWindow = null;

function openSettings() {
  if (settingsWindow) { settingsWindow.focus(); return; }

  settingsWindow = new BrowserWindow({
    width:  520,
    height: 520,
    resizable: false,
    parent: mainWindow,
    modal: true,
    title: 'Settings',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
    if (appMenu) Menu.setApplicationMenu(appMenu);
  });
}

// ─── Download Manager ──────────────────────────────────────────────────────
let downloadWindow = null;
const downloads = {};  // Track { itemId: { filename, totalBytes, receivedBytes, startTime, item } }

function createDownloadWindow() {
  if (downloadWindow) { downloadWindow.focus(); return; }

  downloadWindow = new BrowserWindow({
    width: 500,
    height: 300,
    resizable: false,
    parent: mainWindow,
    modal: false,
    title: 'Downloads',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  downloadWindow.loadFile(path.join(__dirname, 'renderer', 'downloads.html'));
  downloadWindow.on('closed', () => { downloadWindow = null; });
}

function setupDownloads() {
  getSiteSession().on('will-download', (event, item, webContents) => {
    const itemId = item.getFilename() + '-' + Date.now();
    const filename = item.getFilename();

    createDownloadWindow();

    downloads[itemId] = {
      filename,
      totalBytes: item.getTotalBytes(),
      receivedBytes: 0,
      startTime: Date.now(),
      item
    };

    item.on('updated', (event) => {
      downloads[itemId].receivedBytes = item.getReceivedBytes();
      if (downloadWindow && !downloadWindow.isDestroyed()) {
        downloadWindow.webContents.send('download-progress', {
          itemId,
          filename,
          progress: item.getReceivedBytes() / item.getTotalBytes() * 100,
          receivedBytes: item.getReceivedBytes(),
          totalBytes: item.getTotalBytes(),
          state: item.getState()
        });
      }
    });

    item.on('done', (event, state) => {
      if (downloadWindow && !downloadWindow.isDestroyed()) {
        downloadWindow.webContents.send('download-done', { itemId, state });
      }
      delete downloads[itemId];
    });
  });
}

// ─── IPC ───────────────────────────────────────────────────────────────────
ipcMain.handle('get-settings', () => settings);

ipcMain.handle('save-settings', async (_, newSettings) => {
  const merged = Object.assign({}, DEFAULT_SETTINGS, newSettings);
  merged.whitelist = normalizeWhitelist(merged.whitelist);
  try {
    const u = new URL(merged.homeUrl);
    if (!/^https?:$/.test(u.protocol)) merged.homeUrl = DEFAULT_SETTINGS.homeUrl;
  } catch {
    merged.homeUrl = DEFAULT_SETTINGS.homeUrl;
  }
  settings = merged;
  saveSettings(settings);
  if (settings.cfClearance) await applyCfClearanceCookie(settings.cfClearance);
  if (browserView && !browserView.webContents.isDestroyed()) {
    browserView.webContents.loadURL(settings.homeUrl);
  }
  settingsWindow && settingsWindow.close();
  return { ok: true };
});
ipcMain.on('navigate', (_, url) => {
  safeLoadURL(url);
});

ipcMain.on('go-back',    () => browserView.webContents.navigationHistory.canGoBack()    && browserView.webContents.navigationHistory.goBack());
ipcMain.on('go-forward', () => browserView.webContents.navigationHistory.canGoForward() && browserView.webContents.navigationHistory.goForward());
ipcMain.on('reload',     () => browserView.webContents.reload());
ipcMain.on('go-home',    () => browserView.webContents.loadURL(settings.homeUrl));
ipcMain.on('open-downloads', () => createDownloadWindow());
ipcMain.on('open-settings', openSettings);
ipcMain.on('retry-load', () => {
  if (lastFailedUrl) {
    safeLoadURL(lastFailedUrl);
  } else {
    browserView.webContents.reload();
  }
});

// Download control IPC handlers
ipcMain.on('download-pause', (_, itemId) => {
  if (downloads[itemId]) downloads[itemId].item.pause();
});

ipcMain.on('download-resume', (_, itemId) => {
  if (downloads[itemId]) downloads[itemId].item.resume();
});

ipcMain.on('download-cancel', (_, itemId) => {
  if (downloads[itemId]) downloads[itemId].item.cancel();
});

// ─── App lifecycle ─────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    setupSiteSession();
    setupDownloads();
    if (settings.cfClearance) await applyCfClearanceCookie(settings.cfClearance);
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
