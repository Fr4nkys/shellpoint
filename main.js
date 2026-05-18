// ╔══════════════════════════════════════════════════════════════╗
// ║              ShellPoint — SSH Manager v1.0.9                 ║
// ║      Built for Check Point engineers, with ❤️               ║
// ║                                                              ║
// ║  Author : Alexandro Michel Davide                            ║
// ║  Web    : https://franksec.com                               ║
// ║  LinkedIn: /in/alexandro-davide-b37b9a191/                   ║
// ║                                                              ║
// ║  🎂  The cake is a lie.                                      ║
// ║  (But the firewall rules are very much real.)                ║
// ║                                                              ║
// ║  If you're reading this — hi! You're exactly the kind of     ║
// ║  person I built this for. Hope it saves you some time. 🚀   ║
// ╚══════════════════════════════════════════════════════════════╝

const { app, BrowserWindow, ipcMain } = require('electron');

const path = require('path');
const Store = require('electron-store');
const keytar = require('keytar');
const fs = require('fs');
const { Client } = require('ssh2');

const store = new Store();
const KEYTAR_SERVICE = 'ShellPoint';

let mainWindow;
let splashWindow;
let sshSessions = {};

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 320,
    height: 220,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    transparent: false,
    backgroundColor: '#121212',
    icon: path.join(__dirname, 'src/assets/logo.png'),
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    skipTaskbar: true,
  });
  splashWindow.loadFile('src/splash.html');
  splashWindow.center();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,                  // hidden until fully loaded
    backgroundColor: '#121212',   // prevents the white flash
    icon: path.join(__dirname, 'src/assets/logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: true,
      backgroundThrottling: false,
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1e1e1e',
      symbolColor: '#ffffff',
      height: 35
    }
  });

  mainWindow.loadFile('src/index.html');

  // Show main window and close splash once the page is ready
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
      mainWindow.show();
      mainWindow.focus();
    }, 300); // tiny delay so the splash bar animation completes gracefully
  });
}

app.whenReady().then(() => {
  createSplash();   // shows in ~100ms
  createWindow();   // loads in background

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

// IPC: Store
ipcMain.handle('store-get', (event, key) => store.get(key));
ipcMain.handle('store-set', (event, key, value) => store.set(key, value));
ipcMain.handle('store-delete', (event, key) => store.delete(key));

// IPC: Keytar (Credentials)
ipcMain.handle('keytar-set', async (event, account, password) => {
  await keytar.setPassword(KEYTAR_SERVICE, account, password);
});
ipcMain.handle('keytar-get', async (event, account) => {
  return await keytar.getPassword(KEYTAR_SERVICE, account);
});
ipcMain.handle('keytar-delete', async (event, account) => {
  await keytar.deletePassword(KEYTAR_SERVICE, account);
});

// IPC: SSH
// Pending MFA responses keyed by hostId
const pendingMfa = {};

ipcMain.handle('ssh-mfa-response', (event, hostId, code) => {
  if (pendingMfa[hostId]) {
    pendingMfa[hostId](code);
    delete pendingMfa[hostId];
  }
});

ipcMain.handle('ssh-connect', async (event, hostId, config) => {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const authType = config.authType || 'password'; // 'password' | 'push-2fa' | 'otp-2fa'
    const needs2FA = (authType === 'push-2fa' || authType === 'otp-2fa');

    conn.on('ready', () => {
      conn.shell((err, stream) => {
        if (err) { reject(err.message); return; }
        sshSessions[hostId] = { conn, stream };
        stream.on('close', () => {
          conn.end();
          delete sshSessions[hostId];
          mainWindow.webContents.send('ssh-closed', hostId);
        }).on('data', (data) => {
          mainWindow.webContents.send('ssh-data', hostId, data.toString('utf-8'));
        });
        resolve(true);
      });
    }).on('error', (err) => {
      reject(err.message);
    });

    // Keyboard-interactive listener must be attached to conn BEFORE connect() is called.
    // conn.connect() returns void — it cannot be chained.
    if (needs2FA) {
      conn.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
        if (authType === 'push-2fa') {
          // Push-based 2FA (Duo, Okta, RADIUS push)
          // Tell the renderer to show a message in the terminal
          const msg = instructions || name || 'Push notification sent — approve on your device';
          mainWindow.webContents.send('ssh-mfa-push', hostId, msg);
          // Auto-respond with empty strings; the server waits for the push approval
          finish(prompts.map(() => ''));

        } else if (authType === 'otp-2fa') {
          // OTP / token — ask the renderer to show the input modal
          const prompt = (prompts[0] && prompts[0].prompt) || instructions || 'Enter MFA / OTP code:';
          mainWindow.webContents.send('ssh-mfa-prompt', hostId, prompt);

          // Wait for renderer to call 'ssh-mfa-response' with the typed code
          pendingMfa[hostId] = (code) => {
            finish(prompts.map((_, i) => (i === 0 ? code : '')));
          };
          // Safety timeout: cancel after 60s so the promise doesn't hang forever
          setTimeout(() => {
            if (pendingMfa[hostId]) {
              delete pendingMfa[hostId];
              finish(prompts.map(() => ''));
            }
          }, 60000);
        }
      });
    }

    try {
      conn.connect({
        host:              config.host,
        port:              config.port || 22,
        username:          config.username,
        password:          config.password,
        privateKey:        config.privateKey,
        readyTimeout:      20000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 30,
        tryKeyboard:       needs2FA,   // enables keyboard-interactive auth method
      });
    } catch (e) {
      reject(e.message);
    }
  });
});


ipcMain.on('ssh-write', (event, hostId, data) => {
  const session = sshSessions[hostId];
  if (session && session.stream) {
    session.stream.write(data);
  }
});

ipcMain.on('ssh-resize', (event, hostId, cols, rows) => {
  const session = sshSessions[hostId];
  if (session && session.stream) {
    session.stream.setWindow(rows, cols, 0, 0);
  }
});

ipcMain.handle('ssh-disconnect', (event, hostId) => {
  const session = sshSessions[hostId];
  if (session && session.conn) {
    session.conn.end();
    delete sshSessions[hostId];
  }
  return true;
});

// IPC: SFTP
function getSftp(hostId) {
  return new Promise((resolve, reject) => {
    const session = sshSessions[hostId];
    if (!session || !session.conn) return reject("No active connection");
    if (session.sftp) return resolve(session.sftp);
    
    session.conn.sftp((err, sftp) => {
      if (err) return reject(err.message);
      session.sftp = sftp;
      resolve(sftp);
    });
  });
}

ipcMain.handle('sftp-list', async (event, hostId, remotePath) => {
  try {
    const sftp = await getSftp(hostId);
    return new Promise((resolve, reject) => {
      sftp.readdir(remotePath, (err, list) => {
        if (err) return reject(err.message);
        // Clean up list objects to make them cloneable
        resolve(list.map(item => ({
          filename: item.filename,
          longname: item.longname,
          attrs: {
            mode: item.attrs.mode,
            size: item.attrs.size,
            mtime: item.attrs.mtime,
            atime: item.attrs.atime,
            isDirectory: item.attrs.isDirectory(),
            isFile: item.attrs.isFile()
          }
        })));
      });
    });
  } catch (err) {
    throw new Error(err);
  }
});

ipcMain.handle('sftp-upload', async (event, hostId, localPath, remotePath) => {
  try {
    const sftp = await getSftp(hostId);
    const fileSize = fs.statSync(localPath).size;
    return new Promise((resolve, reject) => {
      sftp.fastPut(localPath, remotePath, {
        step: (transferred, chunk, total) => {
          mainWindow.webContents.send('sftp-progress', hostId, 'upload', transferred, total || fileSize);
        }
      }, (err) => {
        if (err) return reject(err.message);
        mainWindow.webContents.send('sftp-progress', hostId, 'upload', fileSize, fileSize);
        resolve(true);
      });
    });
  } catch (err) {
    throw new Error(err);
  }
});

ipcMain.handle('sftp-download', async (event, hostId, remotePath, localPath) => {
  try {
    const sftp = await getSftp(hostId);
    return new Promise((resolve, reject) => {
      sftp.fastGet(remotePath, localPath, {
        step: (transferred, chunk, total) => {
          mainWindow.webContents.send('sftp-progress', hostId, 'download', transferred, total);
        }
      }, (err) => {
        if (err) return reject(err.message);
        resolve(true);
      });
    });
  } catch (err) {
    throw new Error(err);
  }
});

// SFTP keepalive — sends a harmless stat() to prevent idle disconnect
ipcMain.handle('sftp-keepalive', async (event, hostId) => {
  try {
    const sftp = await getSftp(hostId);
    return new Promise((resolve) => {
      sftp.stat('/', (err) => resolve(!err));
    });
  } catch { return false; }
});
