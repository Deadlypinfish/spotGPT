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

    try {
      ipcRenderer.invoke("run-query", data);
      // Handle any response here if needed
    } catch (error) {
      console.error(error);
      // Handle error here
    }
  });

function newChat_Click() {
  document.getElementById("user-input").value = '';
  document.getElementById("active-chat-id").value = '';


  document.querySelector('.chat-messages').innerHTML = '';
  clearActive();

  document.getElementById("user-input").focus();
}

// Listen for 'api-response' event from main process
// data [] [usermessage, assistant message]
ipcRenderer.on("api-response", (event, data) => {
  console.log("api-response called");
  console.log(data);
  console.log(data.messages);
  console.log(data.chatName);

  var spinner = document.getElementById('spinner');
  var submitButton = document.getElementById('btn-submit-message');

  submitButton.style.display = 'block';
  spinner.style.display = 'none';

  document.getElementById("user-input").value = '';

  document.getElementById("active-chat-id").value = data.messages[0].chatId;
  
  appendMessagesToChatContainer(data.messages);

  setActiveChat(data.messages[0].chatId, data.chatName);
  //document.getElementById("chat-response").innerText = data.message.content;
});



ipcRenderer.on('chat-list', (event, chats) => {
  // Render chat list...
  let sideMenuList = document.querySelector('.side-menu ul');
  sideMenuList.innerHTML = '';

  for (let chat of chats) {
      let li = createChatListItem(chat);
      sideMenuList.appendChild(li);
  }
})

ipcRenderer.on('chat-messages', (event, messages) => {
  const chatMessagesContainer = document.querySelector('.chat-messages');
  // Clear the container first
  chatMessagesContainer.innerHTML = '';
  document.getElementById("user-input").value = '';

  appendMessagesToChatContainer(messages);

  
  const chatId = messages[0].chatId;
  document.getElementById("active-chat-id").value = chatId;

  setActiveChat(chatId);
})

// General method for appending messages to chat container
function appendMessagesToChatContainer(messages) {
  const chatMessagesContainer = document.querySelector('.chat-messages');

  messages.forEach(message => {
    const messageElement = document.createElement('div');

    // Use 'r-assistant' class for assistant's messages and 'r-user' for user's messages
    messageElement.classList.add(message.role === 'assistant' ? 'r-assistant' : 'r-user');

    const messageText = document.createElement('p');
    messageText.textContent = message.content;

    messageElement.appendChild(messageText);
    chatMessagesContainer.appendChild(messageElement);
  });
}

function clearActive() {
  const listItems = document.querySelectorAll('.side-menu ul li');

  // Remove the "active" class from all list items
  listItems.forEach(item => {
    item.classList.remove('active');
  });
}

function setActiveChat(chatId, chatName) {
  clearActive();

  // Try to find the list item with the matching id
  let activeItem = document.getElementById(chatId);

  // If the list item is not found, create a new one
  if (!activeItem) {
    const sideMenuList = document.querySelector('.side-menu ul');
    activeItem = createChatListItem({ id: chatId, chat_name: chatName });
    sideMenuList.appendChild(activeItem);
  }

  activeItem.classList.add('active');

}

function createChatListItem(chat) {
  let li = document.createElement('li');
  li.textContent = chat.chat_name;
  li.id = chat.id;

  // Add click event listener
  li.addEventListener('click', function() {
    let chatId = this.id;

    // Pass the id to main process
    ipcRenderer.send('change-chat', chatId);
  });

  return li;
}