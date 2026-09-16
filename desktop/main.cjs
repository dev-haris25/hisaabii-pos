const { app, BrowserWindow, ipcMain } = require('electron')
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const net = require('node:net')

function loadParentEnv() {
  try {
    const text = readFileSync(join(__dirname, '..', '.env'), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 1) continue
      const key = trimmed.slice(0, eq).trim()
      if (!key || process.env[key]) continue
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  } catch {
    /* optional local .env */
  }
}

loadParentEnv()

/** Shipped with the installer — used when no env override is set. */
const PACKAGED_DEFAULT_APP_URL = 'https://pos.hisaabii.com'

const TILL_STORE = () => join(app.getPath('userData'), 'till.json')

function readStore() {
  try {
    return JSON.parse(readFileSync(TILL_STORE(), 'utf8'))
  } catch {
    return {}
  }
}

function writeStore(data) {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(TILL_STORE(), JSON.stringify(data, null, 2), 'utf8')
}

function readPackagedAppUrl() {
  try {
    const cfg = JSON.parse(readFileSync(join(__dirname, 'app-config.json'), 'utf8'))
    const url = typeof cfg?.appUrl === 'string' ? cfg.appUrl.trim() : ''
    return url || null
  } catch {
    return null
  }
}

function appUrl() {
  return (
    process.env.HISABI_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    readPackagedAppUrl() ||
    PACKAGED_DEFAULT_APP_URL
  )
}

const BRAND_GREEN = '#004d40'
const LOAD_TIMEOUT_MS = 30_000

/** @type {Electron.BrowserWindow | null} */
let mainWindow = null

function dataHtmlUrl(html) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

function loadingPageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Hisabi POS</title>
  <style>
    html, body { height: 100%; margin: 0; }
    body {
      display: grid;
      place-items: center;
      background: #ffffff;
      font-family: system-ui, Segoe UI, sans-serif;
      color: ${BRAND_GREEN};
    }
    .wrap { text-align: center; }
    .spinner {
      width: 44px;
      height: 44px;
      margin: 0 auto 20px;
      border: 3px solid #d7ebe4;
      border-top-color: ${BRAND_GREEN};
      border-radius: 50%;
      animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { margin: 0; font-size: 15px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="spinner" aria-hidden="true"></div>
    <p>Loading Hisabi POS…</p>
  </div>
</body>
</html>`
}

/**
 * @param {'offline' | 'slow'} kind
 */
function offlinePageHtml(kind) {
  const title =
    kind === 'slow' ? 'Connection is too slow' : 'Internet not available'
  const body =
    kind === 'slow'
      ? 'Hisabi POS could not finish loading. Check your connection and try again.'
      : 'Hisabi POS needs an internet connection to open. Check the network and try again.'
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Hisabi POS</title>
  <style>
    html, body { height: 100%; margin: 0; }
    body {
      display: grid;
      place-items: center;
      background: #ffffff;
      font-family: system-ui, Segoe UI, sans-serif;
      color: #1a1a1a;
      padding: 24px;
      box-sizing: border-box;
    }
    .wrap { max-width: 26rem; text-align: center; }
    h1 { margin: 0 0 10px; font-size: 1.35rem; color: ${BRAND_GREEN}; }
    p { margin: 0 0 22px; font-size: 0.95rem; line-height: 1.45; color: #44554f; }
    button {
      appearance: none;
      border: 0;
      border-radius: 10px;
      background: ${BRAND_GREEN};
      color: #fff;
      font-size: 0.95rem;
      font-weight: 700;
      padding: 12px 22px;
      cursor: pointer;
    }
    button:hover { filter: brightness(1.08); }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${title}</h1>
    <p>${body}</p>
    <button type="button" id="retry">Try again</button>
  </div>
  <script>
    document.getElementById('retry').addEventListener('click', function () {
      if (window.hisabiDesktop && window.hisabiDesktop.retryLoadApp) {
        window.hisabiDesktop.retryLoadApp()
      }
    })
  </script>
</body>
</html>`
}

/**
 * @param {Electron.BrowserWindow} win
 * @param {'offline' | 'slow'} kind
 */
function showOfflinePage(win, kind) {
  if (win.isDestroyed()) return
  clearLoadTimeout(win)
  win.__shellPage = kind === 'slow' ? 'slow' : 'offline'
  void win.loadURL(dataHtmlUrl(offlinePageHtml(kind)))
}

/**
 * @param {Electron.BrowserWindow} win
 */
function showLoadingPage(win) {
  if (win.isDestroyed()) return
  clearLoadTimeout(win)
  win.__shellPage = 'loading'
  void win.loadURL(dataHtmlUrl(loadingPageHtml()))
}

/**
 * @param {Electron.BrowserWindow} win
 */
function clearLoadTimeout(win) {
  if (win.__loadTimer) {
    clearTimeout(win.__loadTimer)
    win.__loadTimer = null
  }
}

/**
 * @param {Electron.BrowserWindow} win
 */
function loadRemoteApp(win) {
  if (win.isDestroyed()) return
  clearLoadTimeout(win)
  win.__shellPage = 'app'
  void win.loadURL(appUrl())
  win.__loadTimer = setTimeout(() => {
    if (win.isDestroyed()) return
    if (win.__shellPage === 'app') showOfflinePage(win, 'slow')
  }, LOAD_TIMEOUT_MS)
}

/**
 * @param {Electron.BrowserWindow} win
 */
function startAppLoad(win) {
  showLoadingPage(win)
  win.webContents.once('did-finish-load', () => {
    if (win.isDestroyed()) return
    if (win.__shellPage === 'loading') loadRemoteApp(win)
  })
}

function createWindow() {
  const iconPath = join(__dirname, 'icon.png')
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#ffffff',
    icon: iconPath,
    title: 'Hisabi POS',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow = win

  win.webContents.on(
    'did-fail-load',
    (_event, errorCode, _errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return
      if (errorCode === -3) return
      if (!validatedURL || validatedURL.startsWith('data:')) return
      showOfflinePage(win, 'offline')
    },
  )

  win.webContents.on('did-finish-load', () => {
    const url = win.webContents.getURL()
    if (url.startsWith('http://') || url.startsWith('https://')) {
      win.__shellPage = 'ready'
      clearLoadTimeout(win)
    }
  })

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  startAppLoad(win)
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('sa.hisabi.pos')
  }
  createWindow()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('app:retryLoad', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow
  if (!win || win.isDestroyed()) return false
  startAppLoad(win)
  return true
})

ipcMain.handle('till:getId', () => {
  const id = readStore().tillId
  return typeof id === 'string' ? id : null
})

ipcMain.handle('till:setId', (_e, id) => {
  const store = readStore()
  store.tillId = typeof id === 'string' && id.trim() ? id.trim() : null
  writeStore(store)
  return store.tillId
})

ipcMain.handle('hw:listPorts', async () => {
  try {
    const { SerialPort } = require('serialport')
    const ports = await SerialPort.list()
    return ports.map((p) => p.path).filter(Boolean)
  } catch {
    return []
  }
})

/**
 * @param {string} path
 * @param {number} baudRate
 * @param {Buffer} data
 */
function writeSerial(path, baudRate, data) {
  return new Promise((resolve, reject) => {
    let SerialPort
    try {
      SerialPort = require('serialport').SerialPort
    } catch (err) {
      reject(err)
      return
    }
    const port = new SerialPort({ path, baudRate, autoOpen: true }, (err) => {
      if (err) {
        reject(err)
        return
      }
      port.write(data, (writeErr) => {
        port.close(() => {
          if (writeErr) reject(writeErr)
          else resolve(true)
        })
      })
    })
  })
}

ipcMain.handle('hw:writeDisplay', async (_e, payload) => {
  const port = String(payload?.port ?? '').trim()
  const baud = Number(payload?.baud) || 9600
  const text = String(payload?.text ?? '0.00').slice(0, 20)
  if (!port) throw new Error('display port missing')
  const body = Buffer.concat([Buffer.from([0x0c]), Buffer.from(text, 'ascii')])
  await writeSerial(port, baud, body)
  return true
})

ipcMain.handle('hw:openDrawer', async (_e, payload) => {
  const port = String(payload?.port ?? '').trim()
  if (!port) throw new Error('drawer port missing')
  const pulse = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa])
  await writeSerial(port, Number(payload?.baud) || 9600, pulse)
  return true
})

ipcMain.handle('hw:printRaw', async (_e, payload) => {
  const host = String(payload?.host ?? '').trim()
  const port = Number(payload?.port) || 9100
  const raw = Buffer.from(String(payload?.base64 ?? ''), 'base64')
  if (!host || raw.length === 0) throw new Error('print payload missing')
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host, port }, () => {
      socket.write(raw, (err) => {
        socket.end()
        if (err) reject(err)
        else resolve(true)
      })
    })
    socket.setTimeout(8000)
    socket.on('timeout', () => {
      socket.destroy()
      reject(new Error('print timeout'))
    })
    socket.on('error', reject)
  })
  return true
})
