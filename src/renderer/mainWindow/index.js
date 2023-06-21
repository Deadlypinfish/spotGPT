const { ipcRenderer } = require("electron");

document
  .getElementById("chat-form")
  .addEventListener("submit", function (event) {
    event.preventDefault();
    let userInput = document.getElementById("user-input").value;

    var spinner = document.getElementById('spinner');
    var submitButton = document.getElementById('btn-submit-message');

    submitButton.style.display = 'none';
    spinner.style.display = 'block';

    // Send 'run-query' event to the main process with the user input as argument
    ipcRenderer.send("run-query", userInput);
  });

// Listen for 'api-response' event from main process
ipcRenderer.on("api-response", (event, message) => {
  console.log("api-response called");
  console.log("message:" + message);

  var spinner = document.getElementById('spinner');
  var submitButton = document.getElementById('btn-submit-message');

  submitButton.style.display = 'block';
  spinner.style.display = 'none';

  document.getElementById("user-input").value = '';
  
  document.getElementById("chat-response").innerText = message.content;
});
