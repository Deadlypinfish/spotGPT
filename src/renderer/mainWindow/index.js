const { ipcRenderer } = require("electron");

document
  .getElementById("chat-form")
  .addEventListener("submit", function (event) {
    event.preventDefault();

    let userInput = document.getElementById("user-input").value;
    let activeChatID = document.getElementById("active-chat-id").value;

    var spinner = document.getElementById('spinner');
    var submitButton = document.getElementById('btn-submit-message');

    submitButton.style.display = 'none';
    spinner.style.display = 'block';

    // Send 'run-query' event to the main process with the user input as argument
    
    let data = { query: userInput, id: activeChatID};

    ipcRenderer.send("run-query", data);
  });

// Listen for 'api-response' event from main process
ipcRenderer.on("api-response", (event, data) => {
  console.log("api-response called");
  console.log("message:" + data.message);

  var spinner = document.getElementById('spinner');
  var submitButton = document.getElementById('btn-submit-message');

  submitButton.style.display = 'block';
  spinner.style.display = 'none';

  document.getElementById("user-input").value = '';

  document.getElementById("active-chat-id").value = data.id;
  
  document.getElementById("chat-response").innerText = data.message.content;
});

ipcRenderer.on('chat-list', (event, chats) => {
  // Render chat list...
  let sideMenuList = document.querySelector('.side-menu ul');
  sideMenuList.innerHTML = '';

  for (let chat of chats) {
      let li = document.createElement('li');
      li.textContent = chat.chat_name;
      li.id = chat.id; // Make sure chat has an id property
      sideMenuList.appendChild(li);

      // Add click event listener
      li.addEventListener('click', function() {
          let chatId = this.id;

          // Pass the id to main process
          ipcRenderer.send('change-chat', chatId);
      });
  }
})

ipcRenderer.on('chat-messages', (event, messages) => {
  const chatMessagesContainer = document.querySelector('.chat-messages');
  // Clear the container first
  chatMessagesContainer.innerHTML = '';

  messages.forEach(message => {
    const messageElement = document.createElement('div');

    // Use 'r-assistant' class for assistant's messages and 'r-user' for user's messages
    messageElement.classList.add(message.role === 'assistant' ? 'r-assistant' : 'r-user');

    const messageText = document.createElement('p');
    messageText.textContent = message.content;

    messageElement.appendChild(messageText);
    chatMessagesContainer.appendChild(messageElement);
});

})
