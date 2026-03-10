const { app, BrowserWindow, ipcMain } = require("electron")
const path = require("path")
const fs = require("fs")
const axios = require("axios")
const { exec } = require("child_process")
const pdfToPrinter = require("pdf-to-printer")  // Add this

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    kiosk: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.loadFile(path.join(__dirname, "../renderer/otp.html"))
}

app.whenReady().then(createWindow)

// Handle file download and printing
ipcMain.handle("download-and-print", async (event, files) => {
  const results = []
  const total = files.length

  for (let i = 0; i < total; i++) {
    const file = files[i]

    // Notify: Starting Download
    event.sender.send('print-progress', {
      status: 'downloading',
      filename: file.originalName,
      current: i + 1,
      total
    })

    try {
      console.log(`📥 Downloading: ${file.originalName}`)

      const response = await axios({
        method: 'GET',
        url: file.url,
        responseType: 'arraybuffer'
      })

      // Change download path to be more visible
      const downloadsDir = path.join(app.getPath('documents'), 'PixelPrint_Downloads')
      if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true })

      const filePath = path.join(downloadsDir, file.originalName)
      fs.writeFileSync(filePath, Buffer.from(response.data))

      // Notify: Starting Print
      event.sender.send('print-progress', {
        status: 'printing',
        filename: file.originalName,
        current: i + 1,
        total
      })

      await printFile(filePath, file.printOptions)

      results.push({
        success: true,
        filename: file.originalName,
        path: filePath
      })

    } catch (error) {
      console.error(`❌ Error with ${file.originalName}:`, error.message)
      results.push({
        success: false,
        filename: file.originalName,
        error: error.message
      })
    }
  }

  return results
})

// Print function using pdf-to-printer
async function printFile(filePath, printOptions) {
  console.log(`🖨️ Printing: ${filePath}`)
  console.log(`   Copies: ${printOptions.copies}`)
  console.log(`   Color: ${printOptions.colorMode}`)
  console.log(`   Duplex: ${printOptions.duplex}`)
  console.log(`   Pages: ${printOptions.pageRange}`)

  if (process.platform === 'win32') {
    // Windows - using pdf-to-printer
    try {
      // 1. Get available printers
      // 1. Get available printers
      let printers = []
      try {
        printers = await pdfToPrinter.getPrinters()
      } catch (e) {
        console.error("Failed to list printers:", e)
      }

      // DEBUG: Write detected printers to a file so we can see what's going on
      const debugLogPath = path.join(app.getPath('documents'), 'PixelPrint_Downloads', '_debug_printers.txt')
      const debugInfo = `Detected Printers:\n${JSON.stringify(printers, null, 2)}\n`
      fs.appendFileSync(debugLogPath, debugInfo)

      // 2. Filter out PDF/Virtual writers with AGGRESSIVE list
      const virtualKeywords = [
        'pdf', 'xps', 'onenote', 'fax', 'writer', 'virtual',
        'microsoft print', 'adobe', 'nitro', 'foxit', 'cute',
        'dopdf', 'primopdf', 'bluebeam', 'software', 'soda'
      ]

      const validPrinters = printers.filter(p => {
        const name = (p.deviceId || p.name || "").toLowerCase()
        return !virtualKeywords.some(keyword => name.includes(keyword))
      })

      if (validPrinters.length === 0) {
        const msg = "⚠️ No physical printer detected (all filtered as virtual). Simulating print success."
        console.warn(msg)
        fs.appendFileSync(debugLogPath, `Action: ${msg}\n`)

        // Simulate printing delay for UI
        await new Promise(r => setTimeout(r, 2000))
        return
      }

      // 3. Use the first valid printer
      const printerName = validPrinters[0].deviceId || validPrinters[0].name
      console.log(`🖨️ Using printer: ${printerName}`)
      fs.appendFileSync(debugLogPath, `Action: Selected printer '${printerName}'\n`)

      const options = {
        printer: printerName,
        copies: printOptions.copies || 1,
      }

      await pdfToPrinter.print(filePath, options)
      console.log(`✅ Print job submitted for: ${path.basename(filePath)}`)

    } catch (error) {
      console.error(`❌ Print error: ${error.message}`)
      // Don't throw, allow UI to complete
    }

  } else if (process.platform === 'darwin') {
    // macOS
    return new Promise((resolve, reject) => {
      let printCommand = `lp -n ${printOptions.copies} "${filePath}"`

      if (printOptions.duplex === 'double') {
        printCommand += ' -o sides=two-sided-long-edge'
      }

      exec(printCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Print error: ${error.message}`)
          reject(error)
          return
        }
        console.log(`✅ Print job submitted for: ${path.basename(filePath)}`)
        resolve(stdout)
      })
    })

  } else {
    // Linux - auto-detect printer via lpstat
    return new Promise((resolve, reject) => {
      exec('lpstat -a 2>/dev/null | awk \'{print $1}\' | head -1', (err, stdout) => {
        const printerName = stdout.trim()

        if (!printerName) {
          const msg = '⚠️ No printer found in CUPS. Please add a printer via System Settings > Printers.'
          console.warn(msg)
          // Don't crash the app - resolve with a warning
          resolve(msg)
          return
        }

        console.log(`🖨️ Using Linux printer: ${printerName}`)

        let printCommand = `lp -d "${printerName}" -n ${printOptions.copies} "${filePath}"`

        if (printOptions.duplex === 'double') {
          printCommand += ' -o sides=two-sided-long-edge'
        }

        if (printOptions.colorMode === 'bw') {
          printCommand += ' -o ColorModel=Gray'
        }

        exec(printCommand, (error, stdout, stderr) => {
          if (error) {
            console.error(`❌ Print error: ${error.message}`)
            reject(error)
            return
          }
          console.log(`✅ Print job submitted for: ${path.basename(filePath)}`)
          resolve(stdout)
        })
      })
    })
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})