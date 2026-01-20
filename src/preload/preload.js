const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("api", {
  downloadFiles: (files) => ipcRenderer.invoke("download-files", files)
})
