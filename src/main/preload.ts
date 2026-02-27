import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Timer state → main (for tray tooltip)
  updateTimerState: (data: { remaining: string; status: string }) => {
    ipcRenderer.send('timer:state-update', data);
  },

  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  togglePin: () => ipcRenderer.send('window:toggle-pin'),

  // Listen for pin state changes from main
  onPinStateChange: (callback: (pinned: boolean) => void) => {
    ipcRenderer.on('window:pin-state', (_event, pinned: boolean) => callback(pinned));
  },

  // Native OS notification on timer finish
  notify: (data: { taskName: string; duration: string }) => {
    ipcRenderer.send('timer:notify', data);
  },

  // Keyboard shortcut listeners (main → renderer)
  onToggle: (callback: () => void) => {
    ipcRenderer.on('timer:toggle', () => callback());
  },
  onReset: (callback: () => void) => {
    ipcRenderer.on('timer:reset', () => callback());
  },
});
