const { app, BrowserWindow, Menu, dialog, session } = require('electron');
const { mkdirSync, watch } = require('node:fs');
const { join } = require('node:path');
const { spawn } = require('node:child_process');
const { findUpdate, downloadUpdate } = require('./updates.cjs');

const development = process.env.JOSUE_DEV === '1';
const PORT = development ? 4175 : 4174;
const APP_ID = development ? 'com.micaelrauan.josueapp.dev' : 'com.micaelrauan.josueapp';
const installedData = process.platform === 'win32'
  ? join(process.env.LOCALAPPDATA || app.getPath('appData'), 'JosueApp')
  : join(app.getPath('appData'), 'JosueApp');
const userData = development ? join(__dirname, '..', '.desktop-cache', 'dev-profile') : installedData;
mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);
app.setPath('sessionData', userData);
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

  app.whenReady().then(async () => {
    try {
      const appRoot = app.getAppPath();
      const engineRoot = join(installedData, 'engine');
      const { createAppServer } = await import('../server.js');
      server = createAppServer({
        root: join(appRoot, 'public'),
        dataRoot: development ? join(appRoot, '.data', 'dev') : join(userData, 'data'),
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
        icon: join(appRoot, 'desktop', process.platform === 'darwin' ? 'icon.png' : 'icon.ico'),
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, url) => {
        if (url !== `http://127.0.0.1:${PORT}/`) event.preventDefault();
      });
      window.once('ready-to-show', () => window.show());
      window.on('closed', () => { window = null; });
      await window.loadURL(`http://127.0.0.1:${PORT}/`);
      if (development) {
        let reloadTimer;
        const watcher = watch(join(appRoot, 'public'), { recursive: true }, (_event, filename) => {
          if (!filename || !/\.(html|css|js|svg)$/.test(String(filename))) return;
          clearTimeout(reloadTimer);
          reloadTimer = setTimeout(() => window?.webContents.reloadIgnoringCache(), 180);
        });
        app.on('before-quit', () => { clearTimeout(reloadTimer); watcher.close(); });
      } else if (process.platform === 'win32') {
        let checkingForUpdates = false;
        const checkUpdates = async () => {
          if (!window || !app.isReady() || checkingForUpdates) return;
          checkingForUpdates = true;
          let requested = false;
          try {
            const update = await findUpdate(app.getVersion());
            if (!update || !window) return;
            const choice = await dialog.showMessageBox(window, { type: 'info', title: 'Atualização disponível',
              message: `Josué App ${update.version} está disponível.`,
              detail: 'O aplicativo pode baixar e instalar a atualização agora. Seus projetos serão preservados.',
              buttons: ['Atualizar agora', 'Depois'], defaultId: 0, cancelId: 1 });
            if (choice.response !== 0 || !window) return;
            requested = true;
            window.setTitle('Josué App — baixando atualização...');
            const installer = await downloadUpdate(update, join(userData, 'updates'));
            window.setTitle('Josué App');
            const installerProcess = await new Promise((resolve, reject) => {
              const child = spawn(installer, ['--update', `--wait-pid=${process.pid}`], {
                detached: true, stdio: 'ignore', windowsHide: false,
              });
              child.once('spawn', () => resolve(child));
              child.once('error', reject);
            });
            installerProcess.unref();
            app.quit();
          } catch (error) {
            if (window) window.setTitle('Josué App');
            console.warn('Verificação de atualização:', error.message);
            if (requested && window) dialog.showMessageBox(window, { type: 'error', title: 'Atualização não concluída',
              message: 'Não foi possível instalar a atualização.', detail: error.message, buttons: ['OK'] });
          } finally { checkingForUpdates = false; }
        };
        setTimeout(checkUpdates, 20000);
        const interval = setInterval(checkUpdates, 6 * 60 * 60 * 1000);
        app.on('before-quit', () => clearInterval(interval));
      }
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
