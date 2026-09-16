const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('hisabiDesktop', {
  isDesktop: true,
  retryLoadApp: () => ipcRenderer.invoke('app:retryLoad'),
  getTillId: () => ipcRenderer.invoke('till:getId'),
  setTillId: (id) => ipcRenderer.invoke('till:setId', id),
  listSerialPorts: () => ipcRenderer.invoke('hw:listPorts'),
  writeCustomerDisplay: (payload) =>
    ipcRenderer.invoke('hw:writeDisplay', payload),
  openCashDrawer: (payload) => ipcRenderer.invoke('hw:openDrawer', payload),
  printRaw: (payload) => ipcRenderer.invoke('hw:printRaw', payload),
})
