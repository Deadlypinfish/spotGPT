const { ipcRenderer } = require('electron')

window.onload = async () => {
    console.log('Settings window loaded');
    const savedAPIKey = await ipcRenderer.invoke('get-api-key');
    console.log(savedAPIKey);

    if (savedAPIKey) {
        document.getElementById('openaiAPIKey').value = savedAPIKey;
    }
}

document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const apiKey = document.getElementById('openaiAPIKey').value;
    await ipcRenderer.invoke('set-api-key', apiKey);

    window.close();
})
