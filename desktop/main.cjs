const { app, BrowserWindow, ipcMain } = require('electron')
const { execFile } = require('node:child_process')
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { promisify } = require('node:util')
const net = require('node:net')

const { openLocalDb, getLocalStatus, closeLocalDb } = require('./db/open-db.cjs')
const { startLocalApi } = require('./local-api/server.cjs')
const {
  applyPullBatch,
  finalizeFullSync,
  finalizeIncrementalSync,
} = require('./sync/apply-pull.cjs')
const {
  storeZatcaSecrets,
  loadZatcaSecrets,
  testSafeStorageRoundTrip,
} = require('./sync/zatca-secrets-store.cjs')
const {
  buildPushEvents,
  markOutboxSynced,
  markOutboxAttempt,
  pendingOutboxCount,
  finalizePush,
} = require('./sync/push-outbox.cjs')
const {
  localLogin,
  localMe,
  localLogout,
  upsertLocalUserFromCloud,
  mintOfflineSessionForUser,
} = require('./auth/local-login.cjs')

const execFileAsync = promisify(execFile)

/** @type {{ server: import('node:http').Server, port: number, baseUrl: string } | null} */
let localApi = null

function offlineTokenPath() {
  return join(app.getPath('userData'), 'secure', 'offline-session-token.txt')
}

function readOfflineSessionToken() {
  try {
    const t = readFileSync(offlineTokenPath(), 'utf8').trim()
    return t || null
  } catch {
    return null
  }
}

function writeOfflineSessionToken(token) {
  mkdirSync(join(app.getPath('userData'), 'secure'), { recursive: true })
  if (token && String(token).trim()) {
    writeFileSync(offlineTokenPath(), String(token).trim(), 'utf8')
  } else {
    try {
      require('node:fs').unlinkSync(offlineTokenPath())
    } catch {
      /* ignore */
    }
  }
  return readOfflineSessionToken()
}

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
 * No env overrides and no hardcoded fallback.
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
      color: ${BRAND_GREEN};
    }
    .spinner {
      width: 2.75rem;
      height: 2.75rem;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div role="status" aria-live="polite" aria-label="Loading">
    <!-- Same shape as Lucide Loader2 used by HisabiSpinner on the web app -->
    <svg class="spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 12a9 9 0 1 1-6.219-8.56"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </div>
</body>
</html>`
}

/**
 * @param {'offline' | 'slow'} kind
 * @param {{ offlineReady?: boolean }} [opts]
 */
function offlinePageHtml(kind, opts = {}) {
  const offlineReady = opts.offlineReady === true
  const title =
    kind === 'slow' ? 'Connection is too slow' : 'Internet not available'
  const body = offlineReady
    ? 'You can sign in offline on this till with a synced account. Sales offline use the primary till.'
    : kind === 'slow'
      ? 'Hisabi POS could not finish loading. Check your connection and try again.'
      : 'Hisabi POS needs an internet connection to open. Check the network and try again.'
  const loginBlock = offlineReady
    ? `
    <form id="offline-login" class="login">
      <label>Email<input id="email" type="email" autocomplete="username" required placeholder="you@restaurant.com" /></label>
      <label>Password<input id="password" type="password" autocomplete="current-password" required placeholder="••••••••" /></label>
      <p id="err" class="err" hidden></p>
      <button type="submit" id="signin">Sign in offline</button>
    </form>
    <p id="ok" class="ok" hidden>Signed in offline. Retry loading when the network is back, or continue when offline POS is available.</p>
    `
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
      font-family: system-ui, Segoe UI, sans-serif;
      color: #1a1a1a;
      padding: 24px;
      box-sizing: border-box;
    }
    .wrap { max-width: 26rem; text-align: center; width: 100%; }
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
    .login { display: grid; gap: 12px; text-align: start; margin: 0 0 18px; }
    .login label { display: grid; gap: 6px; font-size: 0.85rem; color: #44554f; font-weight: 600; }
    .login input {
      border: 1px solid #c5d0cb; border-radius: 10px; padding: 10px 12px; font-size: 0.95rem;
    }
    .err { color: #b42318; margin: 0; }
    .ok { color: ${BRAND_GREEN}; font-weight: 600; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${title}</h1>
    <p>${body}</p>
    ${loginBlock}
    <div class="actions">
      <button type="button" id="retry">Try again</button>
    </div>
  </div>
  <script>
    document.getElementById('retry').addEventListener('click', function () {
      if (window.hisabiDesktop && window.hisabiDesktop.retryLoadApp) {
        window.hisabiDesktop.retryLoadApp()
      }
    })
    var form = document.getElementById('offline-login')
    if (form && window.hisabiDesktop && window.hisabiDesktop.offlineLogin) {
      form.addEventListener('submit', async function (e) {
        e.preventDefault()
        var err = document.getElementById('err')
        var ok = document.getElementById('ok')
        err.hidden = true
        ok.hidden = true
        try {
          var result = await window.hisabiDesktop.offlineLogin({
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
            remember: true,
          })
          if (!result || !result.ok) {
            err.textContent = 'Invalid email or password, or no access on this till.'
            err.hidden = false
            return
          }
          if (result.token && window.hisabiDesktop.setOfflineSessionToken) {
            await window.hisabiDesktop.setOfflineSessionToken(result.token)
          }
          ok.hidden = false
          form.hidden = true
        } catch (ex) {
          err.textContent = 'Could not sign in offline. Finish first sync while online, then try again.'
          err.hidden = false
        }
      })
    }
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
  let offlineReady = false
  try {
    offlineReady = getLocalStatus().offlineReady === true
  } catch {
    offlineReady = false
  }
  void win.loadURL(dataHtmlUrl(offlinePageHtml(kind, { offlineReady })))
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

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('sa.hisabi.pos')
  }

  try {
    const safe = testSafeStorageRoundTrip()
    console.info(
      '[hisabi-desktop] safeStorage',
      `available=${safe.encryptionAvailable}`,
      `roundTrip=${safe.roundTrip}`,
      safe.error ? `error=${safe.error}` : '',
    )
    if (!safe.ok) {
      console.warn(
        '[hisabi-desktop] CSID safeStorage self-test failed — offline ZATCA signing may be unavailable until encryption works on this machine',
      )
    }
  } catch (err) {
    console.warn('[hisabi-desktop] safeStorage self-test threw', err)
  }

  try {
    openLocalDb(app.getPath('userData'))
    localApi = await startLocalApi()
    console.info('[hisabi-desktop] local API', localApi.baseUrl)
  } catch (err) {
    console.error('[hisabi-desktop] local DB/API failed to start', err)
    // Remote cloud shell can still load; offline features need local API.
  }

  createWindow()
})

app.on('before-quit', () => {
  try {
    localApi?.server?.close()
  } catch {
    /* ignore */
  }
  localApi = null
  closeLocalDb()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('local:getStatus', () => {
  try {
    return {
      ok: true,
      localApiBaseUrl: localApi?.baseUrl ?? null,
      ...getLocalStatus(),
    }
  } catch {
    return {
      ok: false,
      localApiBaseUrl: localApi?.baseUrl ?? null,
      offlineReady: false,
      pendingOutboxCount: 0,
      schemaVersion: 0,
      latestSchemaVersion: 0,
      dbPath: null,
      businessProfileId: null,
    }
  }
})

ipcMain.handle('local:getApiBaseUrl', () => localApi?.baseUrl ?? null)

ipcMain.handle('local:applyPullBatch', (_e, batch) => {
  return applyPullBatch(batch || {})
})

ipcMain.handle('local:finalizeFullSync', (_e, payload) => {
  return finalizeFullSync(payload || {})
})

ipcMain.handle('local:finalizeIncrementalSync', (_e, payload) => {
  return finalizeIncrementalSync(payload || {})
})

ipcMain.handle('local:buildPushBatch', (_e, opts) => {
  const limit = Number(opts?.limit) || 40
  const raw = buildPushEvents(limit)
  const events = []
  const skipped = []
  for (const row of raw) {
    if (row._skip) {
      skipped.push({ outboxId: row._outboxId, reason: row._skip })
      continue
    }
    events.push({
      outboxId: row._outboxId,
      eventId: row.eventId,
      eventType: row.eventType,
      payload: row.payload,
      invoice: row.invoice,
      lines: row.lines,
      kitchenOrder: row.kitchenOrder,
      movement: row.movement,
      tip: row.tip,
    })
  }
  return {
    ok: true,
    events,
    skipped,
    pendingUploadCount: pendingOutboxCount(),
  }
})

ipcMain.handle('local:markOutboxSynced', (_e, payload) => {
  const ids = Array.isArray(payload?.outboxIds) ? payload.outboxIds : []
  markOutboxSynced(ids)
  finalizePush()
  return { ok: true, pendingUploadCount: pendingOutboxCount() }
})

ipcMain.handle('local:markOutboxAttempt', (_e, payload) => {
  const failures = Array.isArray(payload?.failures) ? payload.failures : []
  markOutboxAttempt(failures)
  return { ok: true, pendingUploadCount: pendingOutboxCount() }
})

ipcMain.handle('local:storeZatcaSecrets', (_e, payload) => {
  return storeZatcaSecrets(
    String(payload?.businessProfileId || ''),
    payload?.secrets ?? null,
  )
})

ipcMain.handle('local:hasZatcaSecrets', () => {
  const loaded = loadZatcaSecrets()
  return {
    ok: true,
    hasSecrets: Boolean(loaded?.secrets),
    businessProfileId: loaded?.businessProfileId ?? null,
  }
})

ipcMain.handle('local:safeStorageSelfTest', () => {
  return testSafeStorageRoundTrip()
})

ipcMain.handle('auth:offlineLogin', (_e, body) => localLogin(body || {}))
ipcMain.handle('auth:offlineMe', (_e, token) =>
  localMe(typeof token === 'string' ? token : readOfflineSessionToken()),
)
ipcMain.handle('auth:offlineLogout', (_e, token) => {
  const t = typeof token === 'string' ? token : readOfflineSessionToken()
  localLogout(t)
  writeOfflineSessionToken(null)
  return { ok: true }
})
ipcMain.handle('auth:upsertLocalUser', (_e, user) =>
  upsertLocalUserFromCloud(user || {}),
)
ipcMain.handle('auth:mintOfflineSession', (_e, body) =>
  mintOfflineSessionForUser(body?.userId, {
    remember: Boolean(body?.remember),
  }),
)
ipcMain.handle('auth:getOfflineSessionToken', () => readOfflineSessionToken())
ipcMain.handle('auth:setOfflineSessionToken', (_e, token) =>
  writeOfflineSessionToken(token),
)

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
        // Thermal / mono heads — avoid color dithering that washes out text.
        printBackground: true,
        color: false,
        margins: { marginType: 'none' },
        preferCSSPageSize: true,
      }
      if (paperFormat === 'a4') {
        // Office printers: real A4 so an 80mm CSS slip is true 80mm on paper.
        options.pageSize = 'A4'
      } else {
        // Do NOT set `dpi` — non-96 values shrink CSS layout on paper.
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
