const { app, BrowserWindow, ipcMain, session } = require('electron')
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const net = require('node:net')

/**
 * Prevent two processes from sharing the same userData/cache directory.
 */
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

/**
 * DIAGNOSTIC (temporary): disable GPU to avoid Chromium GPU-cache
 * "Access is denied" crash loops on some Windows machines.
 */
app.disableHardwareAcceleration()

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

function appVersionMarkerPath() {
  return join(app.getPath('userData'), 'app-version.txt')
}

/**
 * Clears disposable Chromium caches on upgrade — never `till.json`.
 */
async function clearStaleCacheIfUpgraded() {
  const markerPath = appVersionMarkerPath()
  let previousVersion = ''
  try {
    previousVersion = readFileSync(markerPath, 'utf8').trim()
  } catch {
    /* first launch */
  }
  const currentVersion = app.getVersion()
  if (previousVersion === currentVersion) return

  try {
    await session.defaultSession.clearCache()
    console.info(
      '[hisabi-desktop] cleared stale Chromium cache',
      `previousVersion=${previousVersion || '(none)'}`,
      `currentVersion=${currentVersion}`,
    )
  } catch (err) {
    console.warn('[hisabi-desktop] cache clear on upgrade failed', err)
  }

  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(markerPath, currentVersion, 'utf8')
  } catch (err) {
    console.warn('[hisabi-desktop] could not write app-version marker', err)
  }
}

let didSelfHealCacheThisSession = false
async function clearCacheOnceForSelfHeal() {
  if (didSelfHealCacheThisSession) return
  didSelfHealCacheThisSession = true
  try {
    await session.defaultSession.clearCache()
  } catch {
    /* best-effort */
  }
}

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

/**
 * Shell URL comes only from desktop/app-config.json (`appUrl`).
 */
function appUrl() {
  const cfgPath = join(__dirname, 'app-config.json')
  let cfg
  try {
    cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
  } catch (err) {
    throw new Error(
      `Could not read app-config.json at ${cfgPath}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  const url = typeof cfg?.appUrl === 'string' ? cfg.appUrl.trim() : ''
  if (!url) {
    throw new Error(
      'app-config.json must set a non-empty "appUrl" (no env or default fallback)',
    )
  }
  return url
}

const BRAND_GREEN = '#00342b'
const LOAD_TIMEOUT_MS = 30_000
const CONNECTIVITY_POLL_MS = 10_000
const CONNECTIVITY_PROBE_TIMEOUT_MS = 5_000
const CONNECTIVITY_FAILS_BEFORE_RETRY = 2

/** @type {Electron.BrowserWindow | null} */
let mainWindow = null

function dataHtmlUrl(html) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

/**
 * @param {string} [caption]
 */
function loadingPageHtml(caption) {
  const captionHtml = caption
    ? `<p class="caption">${caption.replace(/[<>&]/g, '')}</p>`
    : ''
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
      color: ${BRAND_GREEN};
      font-family: ui-sans-serif, system-ui, sans-serif;
    }
    .wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
    }
    .spinner {
      width: 2.75rem;
      height: 2.75rem;
      animation: spin 1s linear infinite;
    }
    .caption {
      margin: 0;
      font-size: 0.8125rem;
      font-weight: 600;
      opacity: 0.8;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="wrap" role="status" aria-live="polite" aria-label="Loading">
    <svg class="spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 12a9 9 0 1 1-6.219-8.56"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    ${captionHtml}
  </div>
</body>
</html>`
}

function retryPageHtml() {
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
      color: ${BRAND_GREEN};
      font-family: ui-sans-serif, system-ui, sans-serif;
      padding: 2rem;
      text-align: center;
    }
    h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
    p { margin: 0 0 1.25rem; opacity: 0.8; font-size: 0.9375rem; max-width: 22rem; }
    button {
      appearance: none;
      border: 0;
      border-radius: 0.5rem;
      background: ${BRAND_GREEN};
      color: #fff;
      font: inherit;
      font-weight: 600;
      font-size: 0.875rem;
      padding: 0.625rem 1.25rem;
      cursor: pointer;
    }
    button:hover { opacity: 0.92; }
  </style>
</head>
<body>
  <div>
    <h1>No internet connection</h1>
    <p>Hisabi POS needs an internet connection. Check your network, then try again.</p>
    <button type="button" onclick="window.hisabiDesktop&amp;&amp;window.hisabiDesktop.retryLoadApp()">Try again</button>
  </div>
</body>
</html>`
}

/**
 * @param {Electron.BrowserWindow} win
 */
function clearHandoffTimer(win) {
  if (win.__handoffTimer) {
    clearTimeout(win.__handoffTimer)
    win.__handoffTimer = null
  }
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
 * @param {string} expectedShellPage
 * @param {() => void} onReady
 * @param {number} [fallbackMs]
 */
function afterNextLoad(win, expectedShellPage, onReady, fallbackMs = 2500) {
  const gen = (win.__loadGen = (win.__loadGen || 0) + 1)
  let done = false
  const finish = () => {
    if (done || win.isDestroyed()) return
    if (win.__loadGen !== gen) return
    if (win.__shellPage !== expectedShellPage) return
    done = true
    clearHandoffTimer(win)
    onReady()
  }
  win.webContents.once('did-finish-load', finish)
  clearHandoffTimer(win)
  win.__handoffTimer = setTimeout(finish, fallbackMs)
}

/**
 * @param {Electron.BrowserWindow} win
 * @param {string} [caption]
 */
function showLoadingPage(win, caption) {
  if (win.isDestroyed()) return
  clearLoadTimeout(win)
  clearHandoffTimer(win)
  win.__shellPage = 'loading'
  void win.loadURL(dataHtmlUrl(loadingPageHtml(caption)))
}

/**
 * Online-only: cloud unreachable → Retry page (no offline POS).
 * @param {Electron.BrowserWindow} win
 */
function showRetryPage(win) {
  if (win.isDestroyed()) return
  clearLoadTimeout(win)
  clearHandoffTimer(win)
  win.__shellPage = 'retry'
  win.__offlineProbeFails = 0
  void win.loadURL(dataHtmlUrl(retryPageHtml()))
}

/**
 * @param {Electron.BrowserWindow} win
 */
function loadRemoteApp(win) {
  if (win.isDestroyed()) return
  clearLoadTimeout(win)
  clearHandoffTimer(win)
  win.__shellPage = 'app'
  win.__offlineProbeFails = 0
  void win.loadURL(appUrl())
  win.__loadTimer = setTimeout(() => {
    if (win.isDestroyed()) return
    if (win.__shellPage === 'app') showRetryPage(win)
  }, LOAD_TIMEOUT_MS)
}

/**
 * @param {Electron.BrowserWindow} win
 */
function startAppLoad(win) {
  if (win.isDestroyed()) return
  const caption = win.__shellPage ? 'Reconnecting…' : undefined
  clearLoadTimeout(win)
  win.__shellPage = 'loading'
  afterNextLoad(win, 'loading', () => {
    loadRemoteApp(win)
  })
  void win.loadURL(dataHtmlUrl(loadingPageHtml(caption)))
}

async function probeCloudReachableFromMain() {
  let url
  try {
    url = appUrl()
  } catch {
    return false
  }
  const base = url.replace(/\/+$/, '')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), CONNECTIVITY_PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(`${base}/api/auth/sync/ping`, {
      method: 'GET',
      cache: 'no-store',
      signal: ctrl.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Mid-session disconnect → Retry page (online-only desktop).
 * @param {Electron.BrowserWindow} win
 */
function startConnectivityWatchdog(win) {
  win.__offlineProbeFails = 0
  win.__connectivityWatchdogId = setInterval(async () => {
    if (win.isDestroyed()) {
      clearInterval(win.__connectivityWatchdogId)
      return
    }
    // Act only while the live cloud app is considered loaded/stable.
    if (win.__shellPage !== 'app' && win.__shellPage !== 'ready') {
      win.__offlineProbeFails = 0
      return
    }
    const ok = await probeCloudReachableFromMain()
    if (win.isDestroyed()) return
    if (win.__shellPage !== 'app' && win.__shellPage !== 'ready') return
    if (ok) {
      win.__offlineProbeFails = 0
      return
    }
    win.__offlineProbeFails += 1
    if (win.__offlineProbeFails >= CONNECTIVITY_FAILS_BEFORE_RETRY) {
      console.warn(
        '[hisabi-desktop] connectivity watchdog: disconnect — showing retry page',
      )
      showRetryPage(win)
    }
  }, CONNECTIVITY_POLL_MS)
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
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      console.error(
        '[hisabi-desktop] did-fail-load',
        `code=${errorCode}`,
        `desc=${errorDescription}`,
        `url=${validatedURL}`,
        `mainFrame=${isMainFrame}`,
      )
      if (!isMainFrame) return
      if (errorCode === -3) return
      if (!validatedURL || validatedURL.startsWith('data:')) return
      void clearCacheOnceForSelfHeal()
      showRetryPage(win)
    },
  )

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levelName = ['log', 'warn', 'error', 'debug'][level] || String(level)
    console.log(`[renderer:${levelName}]`, message, `(${sourceId}:${line})`)
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[hisabi-desktop] render-process-gone', JSON.stringify(details))
  })

  win.webContents.ipc.on('diagnostics:rendererCrash', (_event, payload) => {
    console.error(
      '[hisabi-desktop] RENDERER CRASH DETAIL',
      JSON.stringify(payload, null, 2),
    )
  })

  win.webContents.on('dom-ready', () => {
    void win.webContents.executeJavaScript(
      `(() => {
        if (window.__hisabiCrashHookInstalled) return
        window.__hisabiCrashHookInstalled = true
        window.addEventListener('error', (event) => {
          try {
            window.hisabiDesktop && window.hisabiDesktop.__reportCrash({
              kind: 'window-error',
              message: event.message,
              stack: event.error && event.error.stack,
              filename: event.filename,
              lineno: event.lineno,
              colno: event.colno,
            })
          } catch {}
        })
        window.addEventListener('unhandledrejection', (event) => {
          try {
            var reason = event.reason
            window.hisabiDesktop && window.hisabiDesktop.__reportCrash({
              kind: 'unhandled-rejection',
              message: reason && reason.message,
              stack: reason && reason.stack,
              value: typeof reason === 'string' ? reason : undefined,
            })
          } catch {}
        })
      })()`,
    ).catch((err) => {
      console.warn('[hisabi-desktop] could not install crash hook', err)
    })
  })

  win.webContents.on('unresponsive', () => {
    console.warn('[hisabi-desktop] renderer unresponsive')
  })

  win.webContents.on('did-finish-load', () => {
    const url = win.webContents.getURL()
    if (url.startsWith('http://') || url.startsWith('https://')) {
      win.__shellPage = 'ready'
      clearLoadTimeout(win)
    }
  })

  win.on('closed', () => {
    if (win.__connectivityWatchdogId) {
      clearInterval(win.__connectivityWatchdogId)
      win.__connectivityWatchdogId = null
    }
    if (mainWindow === win) mainWindow = null
  })

  startAppLoad(win)
  startConnectivityWatchdog(win)
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('sa.hisabi.pos')
  }

  await clearStaleCacheIfUpgraded()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('app:getConfig', () => {
  try {
    return { ok: true, appUrl: appUrl() }
  } catch (err) {
    return {
      ok: false,
      appUrl: null,
      message: err instanceof Error ? err.message : String(err),
    }
  }
})

ipcMain.handle('app:retryLoad', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow
  if (!win || win.isDestroyed()) return false
  startAppLoad(win)
  return true
})

ipcMain.handle('till:getId', () => {
  const store = readStore()
  const id =
    typeof store.tillId === 'string' && store.tillId.trim()
      ? store.tillId.trim()
      : null
  return id
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

ipcMain.handle('hw:listPrintDevices', async (event) => {
  /** @type {{ id: string, kind: 'serial' | 'winprinter', label: string }[]} */
  const devices = []
  try {
    const { SerialPort } = require('serialport')
    const ports = await SerialPort.list()
    for (const port of ports) {
      if (!port.path) continue
      devices.push({
        id: port.path,
        kind: 'serial',
        label: port.path,
      })
    }
  } catch {
    /* serialport optional at runtime */
  }
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed() && win.webContents.getPrintersAsync) {
    try {
      const printers = await win.webContents.getPrintersAsync()
      const skip = /pdf|fax|onenote|xps|microsoft print to pdf/i
      for (const printer of printers) {
        const name = String(printer?.name ?? '').trim()
        if (!name || skip.test(name)) continue
        devices.push({
          id: name,
          kind: 'winprinter',
          label: String(printer.displayName || name).trim() || name,
        })
      }
    } catch {
      /* ignore */
    }
  }
  return devices
})

ipcMain.handle('hw:printUsb', async (_e, payload) => {
  const id = String(payload?.id ?? '').trim()
  const raw = Buffer.from(String(payload?.base64 ?? ''), 'base64')
  if (!id || raw.length === 0) throw new Error('usb print payload missing')
  await writeSerial(id, 9600, raw)
  return true
})

ipcMain.handle('hw:printWin', async (_e, payload) => {
  const printerName = String(payload?.printerName ?? '').trim()
  const html = String(payload?.html ?? '')
  const heightMicrons = Number(payload?.heightMicrons) || 0
  if (!printerName || !html) throw new Error('win print payload missing')

  const printWin = new BrowserWindow({
    show: false,
    width: 302,
    height: 1600,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
    },
  })

  try {
    await printWin.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    )
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('print timeout'))
      }, 45000)
      /** @type {Electron.WebContentsPrintOptions} */
      const paperFormat =
        String(payload?.paperFormat ?? '') === 'thermal80' ? 'thermal80' : 'a4'
      const options = {
        silent: true,
        deviceName: printerName,
        printBackground: true,
        color: false,
        margins: { marginType: 'none' },
        preferCSSPageSize: true,
      }
      if (paperFormat === 'a4') {
        options.pageSize = 'A4'
      } else {
        const height = Math.max(Number(heightMicrons) || 0, 80000)
        options.pageSize = {
          width: 80000,
          height,
        }
      }
      printWin.webContents.print(options, (success, failureReason) => {
        clearTimeout(timer)
        if (success) resolve(true)
        else {
          reject(
            new Error(
              `Windows print failed (${printerName}): ${failureReason || 'unknown'}`,
            ),
          )
        }
      })
    })
  } finally {
    if (!printWin.isDestroyed()) printWin.close()
  }
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
