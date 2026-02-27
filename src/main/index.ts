import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, session, Notification } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

if (started) app.quit();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isAlwaysOnTop = false;

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 320,
    height: 540,
    minWidth: 280,
    minHeight: 480,
    frame: false,
    transparent: false,
    resizable: true,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Local keyboard shortcuts (only when window is focused)
  // Space and Escape are handled in the renderer via DOM keydown events.
  // Only Ctrl+Shift+H needs main process handling (window visibility toggle).
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return;

    // Ctrl+Shift+H → toggle window visibility
    if (input.control && input.shift && input.key.toLowerCase() === 'h') {
      _event.preventDefault();
      if (mainWindow?.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow?.show();
        mainWindow?.focus();
      }
    }
  });

  mainWindow.on('close', (e) => {
    if (tray) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const createTray = (): void => {
  // Minimal 16x16 PNG: cyan hourglass on transparent background
  // Generated as a valid PNG data URL
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA' +
    'XklEQVQ4y2P4TwRgGNUABwYGBob/DAx/GRj+MTD8Z2D4y8Dwh4HhNwPDLwaGnwwMPxgY' +
    'vjMwfGNg+MrA8IWB4TMDwycGho8MDB8YGN4zMLxjYHjLwPCGgeE1A8MrAIlEF4kkteYN' +
    'AAAAAElFTkSuQmCC'
  );

  // If the data URL doesn't work, create a simple 16x16 icon from raw bitmap
  const trayIcon = icon.isEmpty() ? createFallbackIcon() : icon;
  tray = new Tray(trayIcon);
  tray.setToolTip('Hourglass Timer');

  const updateTrayMenu = () => {
    const menu = Menu.buildFromTemplate([
      {
        label: 'Show',
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      {
        label: `Always on Top: ${isAlwaysOnTop ? 'ON' : 'OFF'}`,
        click: () => {
          isAlwaysOnTop = !isAlwaysOnTop;
          mainWindow?.setAlwaysOnTop(isAlwaysOnTop);
          updateTrayMenu();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          tray?.destroy();
          tray = null;
          app.quit();
        },
      },
    ]);
    tray?.setContextMenu(menu);
  };

  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
};

function createFallbackIcon(): Electron.NativeImage {
  // Create a 16x16 RGBA bitmap and convert to PNG via nativeImage
  const w = 16, h = 16;
  const buf = Buffer.alloc(w * h * 4, 0);

  const set = (x: number, y: number) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = (y * w + x) * 4;
    buf[i] = 0; buf[i + 1] = 229; buf[i + 2] = 255; buf[i + 3] = 255;
  };

  // Top/bottom bars
  for (let x = 3; x <= 12; x++) { set(x, 1); set(x, 14); }
  // Top triangle narrowing
  for (let y = 2; y <= 6; y++) {
    const half = Math.round(5 * (1 - (y - 2) / 5));
    for (let dx = -half; dx <= half; dx++) { set(8 + dx, y); }
  }
  // Neck
  set(7, 7); set(8, 7); set(7, 8); set(8, 8);
  // Bottom triangle widening
  for (let y = 9; y <= 13; y++) {
    const half = Math.round(5 * ((y - 9) / 4));
    for (let dx = -half; dx <= half; dx++) { set(8 + dx, y); }
  }

  return nativeImage.createFromBitmap(buf, { width: w, height: h });
}

// IPC handlers
ipcMain.on('timer:state-update', (_event, data: { remaining: string; status: string }) => {
  if (tray) {
    tray.setToolTip(`Hourglass Timer \u2014 ${data.remaining}`);
  }
});

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:close', () => mainWindow?.close());
ipcMain.on('window:toggle-pin', () => {
  isAlwaysOnTop = !isAlwaysOnTop;
  mainWindow?.setAlwaysOnTop(isAlwaysOnTop);
  mainWindow?.webContents.send('window:pin-state', isAlwaysOnTop);
});

ipcMain.on('timer:notify', (_event, data: { taskName: string; duration: string }) => {
  if (!Notification.isSupported()) return;

  const notif = new Notification({
    title: 'Timer Complete',
    body: data.taskName
      ? `"${data.taskName}" finished (${data.duration})`
      : `Timer finished (${data.duration})`,
    silent: true, // app already plays its own alarm sound
  });

  notif.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  notif.show();
});

app.on('ready', () => {
  // Set Content Security Policy — relaxed in dev for Vite HMR
  const isDev = !!MAIN_WINDOW_VITE_DEV_SERVER_URL;
  const csp = isDev
    ? "default-src 'self' 'unsafe-inline' 'unsafe-eval'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws:"
    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  createWindow();

  try {
    createTray();
  } catch (err) {
    console.error('Failed to create tray icon:', err);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
