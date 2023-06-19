//Renderer process for index.html:
const { ipcRenderer } = require('electron')

// When a 'query' event is received, handle the query and update the UI
ipcRenderer.on('query', (event, query) => {
  // Handle the query...
})

document.getElementById('api-form').addEventListener('submit', function(event) {
    event.preventDefault();
  
    let userInput = document.getElementById('user-input').value;
    let apiKey = process.env.OPENAI_API_KEY;
  
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