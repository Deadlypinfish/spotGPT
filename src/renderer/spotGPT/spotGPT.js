//Renderer process for spotGPT.html:
const { ipcRenderer } = require('electron')

// When 'Enter' is pressed in the text field, send the query to the main process
document.getElementById('user-input').addEventListener('keydown', (e) => {
  if (e.code === 'Enter') {
    ipcRenderer.send('query', e.target.value)
    e.target.value = ''
  }
})