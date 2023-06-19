const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron')
const axios = require('axios'); // make sure you've installed axios: `npm install axios`

require('dotenv').config();
//console.log(process.env.OPENAI_API_KEY);

let mainWindow, spotWindow;

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width:800,
        height:600,

        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          devTools: true
        }
      })

      mainWindow.loadFile('src/renderer/mainWindow/index.html')
}
app.whenReady().then(() => {
  
  spotWindow = new BrowserWindow({
    width:800,
    height:100,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: true
    }
  })

  
  spotWindow.loadFile('src/renderer/spotGPT/spotGPT.html')

  // Register global shortcut
  const ret = globalShortcut.register('CommandOrControl+X', () => {
    // Show the spotWindow when the shortcut is pressed
    spotWindow.show()
  })

  if (!ret) console.log('registration failed')

  console.log(globalShortcut.isRegistered('CommandOrControl+X'))

    // Create windows
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    shutdown();
})

const shutdown = () => {

    if (process.platform !== 'darwin') app.quit()
}

const unregister = () => {

    globalShortcut.unregister('CommandOrControl+X')
    globalShortcut.unregisterAll()
}
app.on('will-quit', () => {
  // Unregister the shortcut and all shortcuts
  unregister()
})

// Listen for 'query' events from the spotWindow
ipcMain.on('query', (event, query) => {
  // Send the query to the mainWindow
  mainWindow.webContents.send('query', query)
})


