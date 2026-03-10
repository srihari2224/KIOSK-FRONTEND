const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("api", {
  downloadAndPrint: (files) => ipcRenderer.invoke("download-and-print", files),
  onPrintProgress: (callback) => ipcRenderer.on("print-progress", (_event, data) => callback(data))
})