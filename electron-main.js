const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 420,
    minHeight: 650,
    title: 'TaskFlow Pro+',
    icon: path.join(__dirname, 'icon-512.png'),
    backgroundColor: '#070b14',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    },
    frame: true,
    autoHideMenuBar: true,
    show: false
  });

  // Load the standalone local app
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Show window smoothly when ready to prevent white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open external links in user's default browser instead of the app window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
