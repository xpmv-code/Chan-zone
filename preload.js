const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  timerTick:      (data) => ipcRenderer.send('timer-tick', data),
  notifyEnd:      (payload) => ipcRenderer.send('timer-ended', payload),
  addToCalendar:  (data) => ipcRenderer.invoke('add-to-calendar', data),
  toggleCompact:  ()     => ipcRenderer.send('window-compact-toggle'),
  onCompactChanged: (callback) => ipcRenderer.on('window-compact-changed', (_, compact) => callback(compact)),
  togglePin:      ()     => ipcRenderer.send('window-pin-toggle'),
  onPinChanged:   (callback) => ipcRenderer.on('window-pin-changed', (_, pinned) => callback(pinned)),
  closeWindow:    ()     => ipcRenderer.send('window-close'),
  minimizeWindow: ()     => ipcRenderer.send('window-minimize'),
  setTheme:       (dark) => ipcRenderer.send('set-theme', dark),
  openFullscreen:  (dark) => ipcRenderer.send('fs-open', dark),
  closeFullscreen: ()    => ipcRenderer.send('fs-close'),
  sendFsState:     (data) => ipcRenderer.send('fs-state', data),
  onFsTick:        (cb)  => ipcRenderer.on('fs-tick', (_, data) => cb(data)),
  onFsOpened:      (cb)  => ipcRenderer.on('fs-opened', () => cb()),
  onFsClosed:      (cb)  => ipcRenderer.on('fs-closed', () => cb()),
  fetchHitokoto:   ()    => ipcRenderer.invoke('fetch-hitokoto'),
});
