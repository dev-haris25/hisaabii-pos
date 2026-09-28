const { contextBridge, ipcRenderer } = require('electron')

/**
 * Diagnostics only: production Next.js/React strips error messages from the
 * console (shows a bare "Uncaught Error"). `contextIsolation` gives preload
 * its own JS realm, so `window.addEventListener('error')` here would never
 * see exceptions thrown by the page's own scripts — this function is called
 * from the MAIN WORLD (see main.cjs, injected via executeJavaScript) so it
 * can forward the real message/stack before React/Next can obscure it.
 */
function reportRendererCrash(detail) {
  try {
    ipcRenderer.send('diagnostics:rendererCrash', { ...detail, url: location.href })
  } catch {
    /* ignore */
  }
}

contextBridge.exposeInMainWorld('hisabiDesktop', {
  __reportCrash: reportRendererCrash,
  isDesktop: true,
  retryLoadApp: () => ipcRenderer.invoke('app:retryLoad'),
  showOfflineShell: () => ipcRenderer.invoke('app:showOfflineShell'),
  getTillId: () => ipcRenderer.invoke('till:getId'),
  setTillId: (id) => ipcRenderer.invoke('till:setId', id),
  listTills: () => ipcRenderer.invoke('till:list'),
  listSerialPorts: () => ipcRenderer.invoke('hw:listPorts'),
  listPrintDevices: () => ipcRenderer.invoke('hw:listPrintDevices'),
  writeCustomerDisplay: (payload) =>
    ipcRenderer.invoke('hw:writeDisplay', payload),
  openCashDrawer: (payload) => ipcRenderer.invoke('hw:openDrawer', payload),
  printRaw: (payload) => ipcRenderer.invoke('hw:printRaw', payload),
  printUsb: (payload) => ipcRenderer.invoke('hw:printUsb', payload),
  printWin: (payload) => ipcRenderer.invoke('hw:printWin', payload),
  getLocalStatus: () => ipcRenderer.invoke('local:getStatus'),
  getLocalApiBaseUrl: () => ipcRenderer.invoke('local:getApiBaseUrl'),
  applyPullBatch: (batch) => ipcRenderer.invoke('local:applyPullBatch', batch),
  finalizeFullSync: (payload) =>
    ipcRenderer.invoke('local:finalizeFullSync', payload),
  finalizeIncrementalSync: (payload) =>
    ipcRenderer.invoke('local:finalizeIncrementalSync', payload),
  buildPushBatch: (opts) => ipcRenderer.invoke('local:buildPushBatch', opts),
  markOutboxSynced: (payload) =>
    ipcRenderer.invoke('local:markOutboxSynced', payload),
  markOutboxAttempt: (payload) =>
    ipcRenderer.invoke('local:markOutboxAttempt', payload),
  storeZatcaSecrets: (payload) =>
    ipcRenderer.invoke('local:storeZatcaSecrets', payload),
  hasZatcaSecrets: () => ipcRenderer.invoke('local:hasZatcaSecrets'),
  safeStorageSelfTest: () => ipcRenderer.invoke('local:safeStorageSelfTest'),
  offlineLogin: (body) => ipcRenderer.invoke('auth:offlineLogin', body),
  offlineMe: (token) => ipcRenderer.invoke('auth:offlineMe', token),
  offlineLogout: (token) => ipcRenderer.invoke('auth:offlineLogout', token),
  upsertLocalUser: (user) => ipcRenderer.invoke('auth:upsertLocalUser', user),
  mintOfflineSession: (body) =>
    ipcRenderer.invoke('auth:mintOfflineSession', body),
  getOfflineSessionToken: () =>
    ipcRenderer.invoke('auth:getOfflineSessionToken'),
  setOfflineSessionToken: (token) =>
    ipcRenderer.invoke('auth:setOfflineSessionToken', token),
  getOfflineCheckoutUnlock: () =>
    ipcRenderer.invoke('local:getOfflineCheckoutUnlock'),
  unlockOfflineCheckout: () =>
    ipcRenderer.invoke('local:unlockOfflineCheckout'),
  clearOfflineCheckoutUnlock: () =>
    ipcRenderer.invoke('local:clearOfflineCheckoutUnlock'),
  getAppConfig: () => ipcRenderer.invoke('app:getConfig'),
})
