require('dotenv').config();

//console.log(process.env.OPENAI_API_KEY);

const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron')
let mainWindow, inputWindow;

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width:800,
        height:600
      })

      mainWindow.loadFile('index.html')
}
app.whenReady().then(() => {
  
  inputWindow = new BrowserWindow({
    width:800,
    height:100
  })

  
  inputWindow.loadFile('spotGPT.html')

  // Register global shortcut
  const ret = globalShortcut.register('CommandOrControl+X', () => {
    // Show the inputWindow when the shortcut is pressed
    inputWindow.show()
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

// Listen for 'query' events from the inputWindow
ipcMain.on('query', (event, query) => {
  // Send the query to the mainWindow
  mainWindow.webContents.send('query', query)
})




//Renderer process for spotGPT.html:
const { ipcRenderer } = require('electron')

// When 'Enter' is pressed in the text field, send the query to the main process
document.getElementById('user-input').addEventListener('keydown', (e) => {
  if (e.code === 'Enter') {
    ipcRenderer.send('query', e.target.value)
    e.target.value = ''
  }
})

//Renderer process for index.html:
const { ipcRenderer } = require('electron')

// When a 'query' event is received, handle the query and update the UI
ipcRenderer.on('query', (event, query) => {
  // Handle the query...
})


const axios = require('axios'); // make sure you've installed axios: `npm install axios`

document.getElementById('api-form').addEventListener('submit', function(event) {
  event.preventDefault();

  let userInput = document.getElementById('user-input').value;

  axios.get('https://api.openai.com/v1/chat/completions', { // replace with your API endpoint
    params: {
      query: userInput // replace 'query' with your actual parameter name
    }
  })
  .then(function (response) {
    document.getElementById('api-response').innerText = JSON.stringify(response.data);
  })
  .catch(function (error) {
    console.log(error);
    document.getElementById('api-response').innerText = 'An error occurred while calling the API.';
  });
});
