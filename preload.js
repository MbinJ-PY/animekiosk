const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kiosk', {
  // Toolbar → main
  navigate:      (url)         => ipcRenderer.send('navigate', url),
  goBack:        ()            => ipcRenderer.send('go-back'),
  goForward:     ()            => ipcRenderer.send('go-forward'),
  reload:        ()            => ipcRenderer.send('reload'),
  goHome:        ()            => ipcRenderer.send('go-home'),
  openDownloads: ()            => ipcRenderer.send('open-downloads'),
  openSettings:  ()            => ipcRenderer.send('open-settings'),

  // Settings page
  getSettings:  ()            => ipcRenderer.invoke('get-settings'),
  saveSettings: (s)           => ipcRenderer.invoke('save-settings', s),

  // Downloads
  onDownloadProgress: (cb) => ipcRenderer.on('download-progress', (_, v) => cb(v)),
  onDownloadDone:     (cb) => ipcRenderer.on('download-done',     (_, v) => cb(v)),
  downloadPause:      (itemId) => ipcRenderer.send('download-pause', itemId),
  downloadResume:     (itemId) => ipcRenderer.send('download-resume', itemId),
  downloadCancel:     (itemId) => ipcRenderer.send('download-cancel', itemId),

  // Network Error Screen
  onLoadError:        (cb) => ipcRenderer.on('load-error',   (_, data) => cb(data)),
  onLoadSuccess:      (cb) => ipcRenderer.on('load-success', () => cb()),
  retryLoad:          () => ipcRenderer.send('retry-load'),

  // Main → toolbar events
  onUrlChanged:    (cb) => ipcRenderer.on('url-changed',    (_, v) => cb(v)),
  onBlocked:       (cb) => ipcRenderer.on('blocked',        (_, v) => cb(v)),
  onCanGoBack:     (cb) => ipcRenderer.on('can-go-back',    (_, v) => cb(v)),
  onCanGoForward:  (cb) => ipcRenderer.on('can-go-forward', (_, v) => cb(v)),
});

// In-page bridge for guard.js to call back into main
contextBridge.exposeInMainWorld('__kioskBridge', {
  onBlocked: (url, reason) => ipcRenderer.send('js-blocked', url, reason)
});
