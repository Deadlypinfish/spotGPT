const { ipcRenderer } = require("electron");

document
  .getElementById("chat-form")
  .addEventListener("submit", function (event) {
    event.preventDefault();
    let userInput = document.getElementById("user-input").value;

    // Send 'run-query' event to the main process with the user input as argument
    ipcRenderer.send("run-query", userInput);
  });

// Listen for 'api-response' event from main process
ipcRenderer.on("api-response", (event, message) => {
  console.log("api-response called");
  console.log("message:" + message);
  document.getElementById("chat-response").innerText = message.content;
});
