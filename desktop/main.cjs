const { app, BrowserWindow, ipcMain, session } = require('electron')
const { execFile } = require('node:child_process')
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { promisify } = require('node:util')
const net = require('node:net')

const {
  openLocalDb,
  getLocalDb,
  getLocalStatus,
  closeLocalDb,
} = require('./db/open-db.cjs')
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

/**
 * Prevent two processes (e.g. old + new install, or a double-launch) from
 * sharing the same userData/cache directory at once — the main cause of
 * Windows "Access is denied" cache corruption seen when Chromium's disk
 * cache is mid-write from another instance.
 */
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

/**
 * DIAGNOSTIC (temporary): this machine's Chromium GPU disk cache repeatedly
 * fails to initialize ("Access is denied" / "Gpu Cache Creation failed"),
 * which can cascade into GPU-process crash loops. Disabling hardware
 * acceleration removes Chromium's GPU process entirely so we can tell
 * whether that failure class is what's causing the app to exit / fail to
 * render, independent of any Next.js/React bug.
 */
app.disableHardwareAcceleration()

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

function appVersionMarkerPath() {
  return join(app.getPath('userData'), 'app-version.txt')
}

/**
 * Clears only the disposable Chromium caches (HTTP, code, GPU shader cache)
 * — never `local-db/`, `secure/`, or `till.json` — so a fresh install or an
 * upgrade never inherits a stale/corrupted cache from a previous version.
 * Safe to call every launch: it is a no-op once the version marker matches.
 */
async function clearStaleCacheIfUpgraded() {
  const markerPath = appVersionMarkerPath()
  let previousVersion = ''
  try {
    previousVersion = readFileSync(markerPath, 'utf8').trim()
  } catch {
    /* first launch on this machine, or marker missing */
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

/**
 * Self-heal: if the shell fails to load, clear Chromium's disk cache once
 * before showing the offline page, in case a locked/corrupted cache (e.g.
 * Windows "Access is denied" cache_util errors) is the actual cause rather
 * than a real network outage.
 */
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

/**
 * @param {string} [caption] Small branded caption under the spinner — kept
 * optional/short so this still reads as a native app transition, not a
 * separate "error-ish" screen.
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
    ${captionHtml}
  </div>
</body>
</html>`
}

/**
 * Actually navigate to the offline shell (or its missing-build fallback).
 * Split out from `showOfflinePage` so the branded loading buffer below can
 * sit in front of it without duplicating this logic.
 *
 * @param {Electron.BrowserWindow} win
 * @param {'offline' | 'slow'} kind
 */
function loadOfflineShell(win, kind) {
  if (win.isDestroyed()) return
  clearLoadTimeout(win)
  clearOfflineHandoffTimer(win)
  win.__shellPage = kind === 'slow' ? 'slow' : 'offline'
  const offlineAppIndex = join(__dirname, 'offline-app', 'dist', 'index.html')
  const offlineAppDev = join(__dirname, 'offline-app', 'index.html')
  const { existsSync } = require('node:fs')
  const target = existsSync(offlineAppIndex)
    ? offlineAppIndex
    : existsSync(offlineAppDev)
      ? offlineAppDev
      : null
  if (target) {
    void win.loadFile(target, {
      query: { reason: kind },
    })
    return
  }
  // Fallback if offline-app has not been built yet
  void win.loadURL(
    dataHtmlUrl(`<!doctype html><html><body style="font-family:system-ui;padding:2rem;text-align:center">
      <h1 style="color:${BRAND_GREEN}">Internet not available</h1>
      <p>Offline shell is missing. Build desktop/offline-app, then retry.</p>
      <button onclick="window.hisabiDesktop&&window.hisabiDesktop.retryLoadApp()">Try again</button>
    </body></html>`),
  )
}

/**
 * @param {Electron.BrowserWindow} win
 */
function clearOfflineHandoffTimer(win) {
  if (win.__offlineHandoffTimer) {
    clearTimeout(win.__offlineHandoffTimer)
    win.__offlineHandoffTimer = null
  }
}

/**
 * Attach `did-finish-load` *before* starting navigation so a fast data: load
 * cannot finish before the listener is registered (which left the
 * "Switching to offline mode…" buffer stuck forever).
 *
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
    clearOfflineHandoffTimer(win)
    onReady()
  }
  win.webContents.once('did-finish-load', finish)
  clearOfflineHandoffTimer(win)
  win.__offlineHandoffTimer = setTimeout(finish, fallbackMs)
}

/**
 * Switch to the offline shell. Always shows a branded loading buffer first
 * — going straight from a broken/blank remote page to the next `loadFile()`
 * navigation with nothing in between reads as a jarring flash; the offline
 * → online path (`startAppLoad`/`loadRemoteApp`) already had this buffer,
 * this brings the other direction up to the same standard.
 *
 * @param {Electron.BrowserWindow} win
 * @param {'offline' | 'slow'} kind
 */
function showOfflinePage(win, kind) {
  if (win.isDestroyed()) return
  clearLoadTimeout(win)
  const pendingKind = kind === 'slow' ? 'slow' : 'offline'
  win.__shellPage = 'loading-offline'
  afterNextLoad(win, 'loading-offline', () => {
    loadOfflineShell(win, pendingKind)
  })
  void win.loadURL(
    dataHtmlUrl(loadingPageHtml('Switching to offline mode…')),
  )
}

/**
 * @param {Electron.BrowserWindow} win
 * @param {string} [caption]
 */
function showLoadingPage(win, caption) {
  if (win.isDestroyed()) return
  clearLoadTimeout(win)
  clearOfflineHandoffTimer(win)
  win.__shellPage = 'loading'
  void win.loadURL(dataHtmlUrl(loadingPageHtml(caption)))
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
  clearOfflineHandoffTimer(win)
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
  // `undefined` caption on first-ever launch (nothing to "reconnect" to
  // yet); once we already have an offline shell page loaded, this is the
  // offline → online hand-off, so say so explicitly.
  if (win.isDestroyed()) return
  const caption = win.__shellPage ? 'Reconnecting…' : undefined
  clearLoadTimeout(win)
  win.__shellPage = 'loading'
  afterNextLoad(win, 'loading', () => {
    loadRemoteApp(win)
  })
  void win.loadURL(dataHtmlUrl(loadingPageHtml(caption)))
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
      // Do not recurse when the offline shell (file://) itself fails to load.
      if (
        validatedURL.startsWith('file:') &&
        validatedURL.includes('offline-app')
      ) {
        return
      }
      void clearCacheOnceForSelfHeal()
      showOfflinePage(win, 'offline')
    },
  )

  // Forward renderer console output (including the real Next.js/React error
  // that DevTools shows as an opaque "Uncaught Error") to this terminal, so
  // load-time crashes are diagnosable without manually opening DevTools.
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

  // Install the real crash listener in the PAGE's own JS world (not
  // preload's isolated world — `contextIsolation` means preload never sees
  // page-thrown exceptions). `window.hisabiDesktop` is reachable here
  // because contextBridge exposes it into this exact world.
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

  win.on('close', () => {
    console.error('[hisabi-desktop] window "close" event — stack:', new Error().stack)
  })

  win.on('closed', () => {
    console.error('[hisabi-desktop] window "closed" event fired')
    if (mainWindow === win) mainWindow = null
  })

  startAppLoad(win)
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

ipcMain.handle('local:getOfflineCheckoutUnlock', () => {
  try {
    const {
      getOfflineCheckoutUnlockStatus,
    } = require('./local-api/offline-unlock.cjs')
    return { ok: true, ...getOfflineCheckoutUnlockStatus() }
  } catch (err) {
    return {
      ok: false,
      unlocked: false,
      offlineReady: false,
      message: err instanceof Error ? err.message : String(err),
    }
  }
})

ipcMain.handle('local:unlockOfflineCheckout', () => {
  try {
    const { unlockOfflineCheckout } = require('./local-api/offline-unlock.cjs')
    return unlockOfflineCheckout()
  } catch (err) {
    return {
      ok: false,
      code: 'UNLOCK_FAILED',
      message: err instanceof Error ? err.message : String(err),
    }
  }
})

ipcMain.handle('local:clearOfflineCheckoutUnlock', () => {
  try {
    const {
      clearOfflineCheckoutUnlock,
    } = require('./local-api/offline-unlock.cjs')
    return clearOfflineCheckoutUnlock()
  } catch {
    return { ok: true, unlocked: false }
  }
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

/** Go straight to the offline shell (used after logout while already offline). */
ipcMain.handle('app:showOfflineShell', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow
  if (!win || win.isDestroyed()) return false
  showOfflinePage(win, 'offline')
  return true
})

ipcMain.handle('till:getId', () => {
  const store = readStore()
  const id =
    typeof store.tillId === 'string' && store.tillId.trim()
      ? store.tillId.trim()
      : null
  if (id) return id

  // This machine was never taken through Settings > Till while online to
  // bind it to a specific till row, so it has no tillId locally. Without
  // this, the till is permanently treated as non-primary while offline
  // (blocking sales) even on a single-till setup where there's no real
  // ambiguity. Auto-bind when local SQLite has exactly one synced till for
  // this business — but never guess when there's more than one, since
  // picking the wrong physical till would misattribute ZATCA invoices.
  try {
    const status = getLocalStatus()
    if (!status?.businessProfileId) return null
    const rows = getLocalDb()
      .prepare(
        `SELECT id FROM pos_tills WHERE business_profile_id = ?`,
      )
      .all(status.businessProfileId)
    if (rows.length === 1) {
      const autoId = rows[0].id
      store.tillId = autoId
      writeStore(store)
      return autoId
    }
  } catch {
    /* local db not ready / no synced tills yet — fall through to null */
  }
  return null
})

ipcMain.handle('till:setId', (_e, id) => {
  const store = readStore()
  store.tillId = typeof id === 'string' && id.trim() ? id.trim() : null
  writeStore(store)
  return store.tillId
})

/**
 * List locally synced tills for this business — used by the offline shell
 * to let staff bind this machine to a till when it has never been bound via
 * the (online-only) Settings > Till page and auto-bind can't resolve it
 * unambiguously (more than one till synced locally).
 */
ipcMain.handle('till:list', () => {
  try {
    const status = getLocalStatus()
    if (!status?.businessProfileId) return []
    const rows = getLocalDb()
      .prepare(
        `SELECT id, name, is_primary FROM pos_tills WHERE business_profile_id = ? ORDER BY is_primary DESC, name ASC`,
      )
      .all(status.businessProfileId)
    return rows.map((row) => ({
      id: row.id,
      name: row.name || row.id,
      isPrimary: Boolean(row.is_primary),
    }))
  } catch {
    return []
  }
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
