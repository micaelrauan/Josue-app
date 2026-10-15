const { app, BrowserWindow, Menu, dialog, session } = require('electron');
const { existsSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const PORT = 4174;
const APP_ID = 'com.micaelrauan.josueapp';
const instanceLock = app.requestSingleInstanceLock();
let window;
let server;

if (!instanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });

  app.setAppUserModelId(APP_ID);
  app.setName('Josué App');
  const userData = join(process.env.LOCALAPPDATA || app.getPath('appData'), 'JosueApp');
  mkdirSync(userData, { recursive: true });
  app.setPath('userData', userData);
  app.setPath('sessionData', userData);

  app.whenReady().then(async () => {
    try {
      const appRoot = app.getAppPath();
      const engineRoot = join(userData, 'engine');
      const { createAppServer } = await import('../server.js');
      server = createAppServer({
        root: join(appRoot, 'public'),
        dataRoot: join(userData, 'data'),
        venvRoot: join(engineRoot, '.venv'),
        modelsRoot: join(engineRoot, '.models'),
      });
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(PORT, '127.0.0.1', resolve);
      });

      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      Menu.setApplicationMenu(null);
      window = new BrowserWindow({
        title: 'Josué App',
        width: 1280,
        height: 820,
        minWidth: 900,
        minHeight: 600,
        show: false,
        backgroundColor: '#101113',
        icon: join(appRoot, 'desktop', 'icon.ico'),
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, url) => {
        if (url !== `http://127.0.0.1:${PORT}/`) event.preventDefault();
      });
      window.once('ready-to-show', () => window.show());
      window.on('closed', () => { window = null; });
      await window.loadURL(`http://127.0.0.1:${PORT}/`);
    } catch (error) {
      dialog.showErrorBox('Josué App não iniciou', error.code === 'EADDRINUSE'
        ? `A porta ${PORT} já está ocupada. Feche o servidor ou aplicativo que a está usando e tente novamente.`
        : String(error.message || error));
      app.quit();
    }
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => server?.close());
}
