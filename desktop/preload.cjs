const { contextBridge, ipcRenderer } = require('electron')

/**
 * Diagnostics only: production Next.js/React strips error messages from the
 * console. Called from the MAIN WORLD (see main.cjs) so it can forward the
 * real message/stack before React/Next can obscure it.
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
  getTillId: () => ipcRenderer.invoke('till:getId'),
  setTillId: (id) => ipcRenderer.invoke('till:setId', id),
  listSerialPorts: () => ipcRenderer.invoke('hw:listPorts'),
  listPrintDevices: () => ipcRenderer.invoke('hw:listPrintDevices'),
  writeCustomerDisplay: (payload) =>
    ipcRenderer.invoke('hw:writeDisplay', payload),
  openCashDrawer: (payload) => ipcRenderer.invoke('hw:openDrawer', payload),
  printRaw: (payload) => ipcRenderer.invoke('hw:printRaw', payload),
  printUsb: (payload) => ipcRenderer.invoke('hw:printUsb', payload),
  printWin: (payload) => ipcRenderer.invoke('hw:printWin', payload),
  getAppConfig: () => ipcRenderer.invoke('app:getConfig'),
})
