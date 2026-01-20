const { app, BrowserWindow, ipcMain } = require("electron")
const path = require("path")
const fs = require("fs")
const axios = require("axios")

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    kiosk: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js")
    }
  })

  // ✅ CORRECT PATH
  mainWindow.loadFile(path.join(__dirname, "../renderer/auth.html"))
}

app.whenReady().then(createWindow)
    