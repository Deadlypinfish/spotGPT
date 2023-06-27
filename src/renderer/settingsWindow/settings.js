const { ipcRenderer } = require('electron')

window.onload = async () => {
    console.log('Settings window loaded');
    const savedAPIKey = await ipcRenderer.invoke('get-api-key');
    console.log(savedAPIKey);

    if (savedAPIKey) {
        document.getElementById('openaiAPIKey').value = savedAPIKey;
    }

    // Get the list of models from the OpenAI API
    debugger;
    const modelList = await ipcRenderer.invoke('get-model-engines-api');
    populateModelEnginesDropdown(modelList.data);  // Function to populate your dropdown


    const savedModelEngine = await ipcRenderer.invoke('get-model-engine');
    if (savedModelEngine) {
        document.getElementById('modelEngineDropdown').value = savedModelEngine;
    }
}

document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const apiKey = document.getElementById('openaiAPIKey').value;
    await ipcRenderer.invoke('set-api-key', apiKey);

    //const response = await ipcRenderer.invoke('get-model-engines-api');
    //populateModelEnginesDropdown(response.data);

    // Set default model engine if it's not been set before
    // const savedModelEngine = await ipcRenderer.invoke('get-model-engine');
    // if (!savedModelEngine) {
    //     ipcRenderer.invoke('set-model-engine', response.data[0].id);
    // }

    // Get the selected model from the dropdown
    const selectedModel = document.getElementById('modelEngineDropdown').value;
    // Save the selected model in the store
    await ipcRenderer.invoke('set-model-engine', selectedModel);

    

    window.close();
})

function populateModelEnginesDropdown(models) {
    const dropdown = document.getElementById('modelEngineDropdown');
    dropdown.innerHTML = '';  // Clear existing options

    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.text = model.id;  // Replace with model name if available
        dropdown.add(option);
    });
}

document.getElementById('modelEngineDropdown').addEventListener('change', (e) => {
    console.log(e.target.value);
    //ipcRenderer.invoke('set-model-engine', e.target.value);
});

document.getElementById('cancelBtn').addEventListener('click', (e) => {
    e.preventDefault();
    window.close();
});

document.getElementById('openaiAPIKey').addEventListener('input', async (e) => {
    e.preventDefault();

    const apiKey = document.getElementById('openaiAPIKey').value;
    await ipcRenderer.invoke('set-api-key', apiKey);

    // Get the list of models from the OpenAI API
    const modelList = await ipcRenderer.invoke('get-model-engines-api');
    populateModelEnginesDropdown(modelList.data);  // Function to populate your dropdown

    // Get the saved model from the store and preselect it in the dropdown
    const savedModelEngine = await ipcRenderer.invoke('get-model-engine');
    if (savedModelEngine) {
        document.getElementById('modelEngineDropdown').value = savedModelEngine;
    }
});
