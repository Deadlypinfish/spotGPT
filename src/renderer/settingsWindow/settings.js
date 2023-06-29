const { ipcRenderer } = require('electron')

window.onload = async () => {
    console.log('Settings window loaded');
    const savedAPIKey = await ipcRenderer.invoke('get-api-key');
    console.log(savedAPIKey);

    if (savedAPIKey) {
        document.getElementById('openaiAPIKey').value = savedAPIKey;
    }

    // using a hard coded model list as a few models
    // aren't allowed even though they show up on the list?
    const modelList = {
        data:
        [
            { id: 'gpt-3.5-turbo-0613' },
            { id: 'gpt-3.5-turbo' },
            { id: 'gpt-3.5-turbo-0301' },
            { id: 'gpt-3.5-turbo-16k-0613' },
            { id: 'gpt-3.5-turbo-16k' },
            // { id: 'babbage' },
            // { id: 'davinci' },
            // { id: 'babbage-code-search-code' },
            // { id: 'text-similarity-babbage-001' },
            // { id: 'text-davinci-001' },
            // { id: 'ada' },
            // { id: 'babbage-code-search-text' },
            // { id: 'babbage-similarity' },
            // { id: 'code-search-babbage-text-001' },
            // { id: 'text-curie-001' },
            // { id: 'code-search-babbage-code-001' },
            // { id: 'text-ada-001' },
            // { id: 'text-similarity-ada-001' },
            // { id: 'curie-instruct-beta' },
            // { id: 'ada-code-search-code' },
            // { id: 'ada-similarity' },
            // { id: 'code-search-ada-text-001' },
            // { id: 'text-search-ada-query-001' },
            // { id: 'davinci-search-document' },
            // { id: 'ada-code-search-text' },
            // { id: 'text-search-ada-doc-001' },
            // { id: 'davinci-instruct-beta' },
            // { id: 'text-similarity-curie-001' },
            // { id: 'code-search-ada-code-001' },
            // { id: 'ada-search-query' },
            // { id: 'text-search-davinci-query-001' },
            // { id: 'curie-search-query' },
            // { id: 'davinci-search-query' },
            // { id: 'babbage-search-document' },
            // { id: 'ada-search-document' },
            // { id: 'text-search-curie-query-001' },
            // { id: 'text-search-babbage-doc-001' },
            // { id: 'curie-search-document' },
            // { id: 'text-search-curie-doc-001' },
            // { id: 'babbage-search-query' },
            // { id: 'text-babbage-001' },
            // { id: 'text-search-davinci-doc-001' },
            // { id: 'text-search-babbage-query-001' },
            // { id: 'curie-similarity' },
            // { id: 'curie' },
            // { id: 'text-embedding-ada-002' },
            // { id: 'text-similarity-davinci-001' },
            // { id: 'text-davinci-002' },
            // { id: 'text-davinci-003' },
            // { id: 'davinci-similarity' },
        ]
    }
    // Get the list of models from the OpenAI API
    //const modelList = await ipcRenderer.invoke('get-model-engines-api');
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

// When retrieving the list of models can be made
// dynamically use this to update the list when api key changes
// document.getElementById('openaiAPIKey').addEventListener('input', async (e) => {
//     e.preventDefault();

//     const apiKey = document.getElementById('openaiAPIKey').value;
//     await ipcRenderer.invoke('set-api-key', apiKey);

//     // Get the list of models from the OpenAI API
//     const modelList = await ipcRenderer.invoke('get-model-engines-api');
//     populateModelEnginesDropdown(modelList.data);  // Function to populate your dropdown

//     // Get the saved model from the store and preselect it in the dropdown
//     const savedModelEngine = await ipcRenderer.invoke('get-model-engine');
//     if (savedModelEngine) {
//         document.getElementById('modelEngineDropdown').value = savedModelEngine;
//     }
// });
