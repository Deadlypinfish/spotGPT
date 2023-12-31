const { ipcRenderer } = require("electron");
const { marked } = require('marked');


const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const domWindow = new JSDOM('').window;
const DOMPurify = createDOMPurify(domWindow);

let isEditListMode = false;

document
  .getElementById("chat-form")
  .addEventListener("submit", function (event) {
    event.preventDefault();

    // check if the input is already disabled and don't do anything
    let userInput = document.getElementById("user-input").value;
    if (userInput.disabled == true) return;

    userInput.disabled = true;

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

function retryChat_Click() {
  const chatId = document.getElementById('active-chat-id').value;

  document.getElementById("user-input").value = '';
  document.getElementById("user-input").disabled = true;

  document.getElementById('response-info').style.display = 'none';
  document.getElementById("chat-retry").style.display = 'none';
  document.getElementById("chat-retry").style.display = 'none';

  showLoading();

  ipcRenderer.invoke("retry-query", chatId);
}

function editList_Click() {
  isEditListMode = !isEditListMode;

  let checkboxes = document.querySelectorAll('.edit-list-checkbox');

  if (isEditListMode) {
    document.querySelector('.btn-edit-list').innerHTML = 'Cancel';
    document.querySelector('.btn-delete-selected').style.display = 'inline-block';

    document.getElementById("user-input").disabled = true;
  }
  else {
    document.querySelector('.btn-edit-list').innerHTML = 'Edit';
    document.querySelector('.btn-delete-selected').style.display = 'none';
    
    document.getElementById("user-input").disabled = false;
  }

  ipcRenderer.send('toggle-shortcut', !isEditListMode);

  checkboxes.forEach(checkbox => {
    checkbox.checked = false;
    checkbox.style.display = isEditListMode ? 'flex' : 'none';
  })
}


function deleteSelected_Click() {
  let checkedBoxes = document.querySelectorAll('.edit-list-checkbox:checked');
  let idsToDelete = Array.from(checkedBoxes).map(box => box.dataset.chatId); // Use the data attribute

  editList_Click();
  newChat_Click();

  if (idsToDelete.length > 0) {
    ipcRenderer.send('delete-chats', idsToDelete);
  }

}

function newChat_Click() {
  document.getElementById("user-input").value = '';
  document.getElementById("user-input").disabled = false;
  document.getElementById("active-chat-id").value = '';


  document.querySelector('.chat-messages').innerHTML = '';
  clearActive();

  document.getElementById('chat-retry').style.display = 'none';
  document.getElementById('response-info').style.display = 'none';
  document.getElementById('btn-submit-message').style.display = 'block';

  document.getElementById("user-input").focus();
}

function showLoading() {
  var spinner = document.getElementById('spinner');
  var submitButton = document.getElementById('btn-submit-message');

  submitButton.style.display = 'none';
  spinner.style.display = 'block';
}

// Listen for 'api-response' event from main process
// data [] [usermessage, assistant message]
ipcRenderer.on("api-response", (event, data) => {
  console.log("api-response called");
  console.log(data);
  console.log(data.messages);
  console.log(data.chatName);
  console.log(data.isArchived);
  console.log(data.isCloseToArchive);

  var spinner = document.getElementById('spinner');
  var submitButton = document.getElementById('btn-submit-message');

  submitButton.style.display = 'block';
  spinner.style.display = 'none';

  document.getElementById("user-input").value = '';
  document.getElementById("user-input").disabled = false;
  document.getElementById("user-input").focus();

  document.getElementById("active-chat-id").value = data.messages[0].chatId;
  
  appendMessagesToChatContainer(data.messages);

  setActiveChat(data.messages[0].chatId, data.chatName);
  //document.getElementById("chat-response").innerText = data.message.content;

  if (data.isArchived) {
    document.querySelector(".chat-input").style.display = 'none';
    document.querySelector("#chat-archived").style.display = 'block';
    // document.getElementById("user-input").disabled = true;
    // document.getElementById("btn-submit-message").disabled = true;
    // document.getElementById("btn-submit-message").style.display = 'none';
  } else {
    document.querySelector("#chat-archived").style.display = 'none';
    document.querySelector(".chat-input").style.display = 'block';
    
    // if the most recent message is a user role, assume the api failed
    // and show the retry, and hide submit and disable input
    if (messages[messages.length - 1].role === 'user') {
      document.getElementById('response-info').style.display = 'block';
      document.getElementById('chat-retry').style.display = 'inline-block';
      document.getElementById('btn-submit-message').style.display = 'none';
      document.getElementById("user-input").value = '';
      document.getElementById("user-input").disabled = true;
    }
    else {
      document.getElementById('response-info').style.display = 'none';
      document.getElementById('chat-retry').style.display = 'none';
      document.getElementById('btn-submit-message').style.display = 'block';
      document.getElementById('chat-retry-message').style.display = 'none';
      document.getElementById("user-input").value = '';
      document.getElementById("user-input").disabled = false;
    }
  }
  

  if (data.isCloseToArchive) {
    document.querySelector('#chat-warning').style.display = 'block';
    console.warn("The chat is close to the archive limit.");
  }
  else {
    document.querySelector('#chat-warning').style.display = 'none';
  }

});

// in the even the api fails, the loading event
// would have already worked and appended the message to the chat
// the purpose of this event is to reset and allow trying again
ipcRenderer.on("api-call-failed", (event, data) => {
  console.log("api-call-failed");
  console.log(data);


  var spinner = document.getElementById('spinner');
  var submitButton = document.getElementById('btn-submit-message');

  // turn off the spinner
  //submitButton.style.display = 'block';
  spinner.style.display = 'none';
  //submitButton.disabled = true;

  // reenable user input
  // document.getElementById("user-input").value = '';
  // document.getElementById("user-input").disabled = false;
  // document.getElementById("user-input").focus();
  
  document.getElementById("chat-retry").style.display = 'inline-block';
  document.getElementById('response-info').style.display = 'block';



  if (data.isArchived) {
    document.querySelector(".chat-input").style.display = 'none';
    document.querySelector("#chat-archived").style.display = 'block';
  } else {
    document.querySelector("#chat-archived").style.display = 'none';
    document.querySelector(".chat-input").style.display = 'block';
  }
  

  if (data.isCloseToArchive) {
    document.querySelector('#chat-warning').style.display = 'block';
    console.warn("The chat is close to the archive limit.");
  }
  else {
    document.querySelector('#chat-warning').style.display = 'none';
  }

});

// {query: 'try this out', id: '', chatName: 'Try'}
ipcRenderer.on("db-operation-failed", (event, data) => {
  console.log("db-operation-failed");
  console.log(data);

  var spinner = document.getElementById('spinner');
  var submitButton = document.getElementById('btn-submit-message');

  submitButton.style.display = 'block';
  spinner.style.display = 'none';

  // put input back into chat-input to let the user keep it but
  // be aware it didn't save
  document.getElementById("user-input").value = data.query;
  document.getElementById("user-input").disabled = false;
  document.getElementById("user-input").focus();

  document.getElementById('response-info').style.display = 'block';
  document.getElementById('chat-retry-message').style.display = 'inline-block';
  document.getElementById('chat-retry-message').innerHTML = 'There was a problem saving this message to the database...';

  // if the chat id doesn't exist
  if (data.id) {
    document.getElementById("active-chat-id").value = data.messages[0].chatId;
    setActiveChat(data.messages[0].chatId, data.chatName);

  }

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

ipcRenderer.on('loading', (event, data) => {
  console.log('loading');
  console.log(data);
  // {query: 'loading', id: 22, chatName: 'Loading'}
  
  // clear container
  const chatMessagesContainer = document.querySelector('.chat-messages');
  
  // if the incoming chat has a different id than the existing chat, clear the messages it's probably
  // a new chat
  const chatId = data.messages.length ? data.messages[0].chatId : null;
  const existingID = document.getElementById('active-chat-id').value;
  if (existingID != chatId)
    chatMessagesContainer.innerHTML = '';

  appendMessagesToChatContainer(data.messages);


  // clear input
  document.getElementById("user-input").value = '';
  document.getElementById("user-input").disabled = true;
  document.getElementById("active-chat-id").value = chatId;

  document.getElementById('response-info').style.display = 'none';
  document.getElementById("chat-retry").style.display = 'none';

  // show loading/don't allow input
  showLoading();

  setActiveChat(chatId, data.chatName);
  
})

ipcRenderer.on('chat-messages', (event, {messages, isArchived, isCloseToArchive}) => {
  const chatMessagesContainer = document.querySelector('.chat-messages');
  // Clear the container first
  chatMessagesContainer.innerHTML = '';
  document.getElementById("user-input").value = '';
  document.getElementById("user-input").focus();

  appendMessagesToChatContainer(messages);

  
  const chatId = messages.length ? messages[0].chatId : null;

  if (chatId) {
    document.getElementById("active-chat-id").value = chatId;
    setActiveChat(chatId);

  }


  if (isArchived) {
    document.querySelector(".chat-input").style.display = 'none';
    document.querySelector("#chat-archived").style.display = 'block';
    // document.getElementById("user-input").disabled = true;
    // document.getElementById("btn-submit-message").disabled = true;
    // document.getElementById("btn-submit-message").style.display = 'none';
  } else {
    document.querySelector(".chat-input").style.display = 'block';
    document.querySelector("#chat-archived").style.display = 'none';

    // if the most recent message is a user role, assume the api failed
    // and show the retry, and hide submit and disable input
    if (messages[messages.length - 1].role === 'user') {
      document.getElementById('response-info').style.display = 'block';
      document.getElementById('chat-retry').style.display = 'inline-block';
      document.getElementById('btn-submit-message').style.display = 'none';
      document.getElementById("user-input").value = '';
      document.getElementById("user-input").disabled = true;
    }
    else {
      document.getElementById('response-info').style.display = 'none';
      document.getElementById('chat-retry').style.display = 'none';
      document.getElementById('btn-submit-message').style.display = 'block';
      document.getElementById('chat-retry-message').style.display = 'none';
      document.getElementById("user-input").value = '';
      document.getElementById("user-input").disabled = false;
    }
  }

  // if (isArchived) {
  //   document.getElementById("user-input").disabled = true;
  // } else {
  //   document.getElementById("user-input").disabled = false;
  // }
  
  if (isCloseToArchive) {
    document.querySelector('#chat-warning').style.display = 'block';
    console.warn("The chat is close to the archive limit.");
  }
  else {
    document.querySelector('#chat-warning').style.display = 'none';
  }

  
})

// General method for appending messages to chat container
function appendMessagesToChatContainer(messages) {
  const chatMessagesContainer = document.querySelector('.chat-messages');

  messages.forEach(message => {
    const messageElement = document.createElement('div');

    // Use 'r-assistant' class for assistant's messages and 'r-user' for user's messages
    messageElement.classList.add(message.role === 'assistant' ? 'r-assistant' : 'r-user');

    let htmlContent = marked.parse(message.content);


    // Sanitize the HTML content
    htmlContent = DOMPurify.sanitize(htmlContent);


    messageElement.innerHTML = htmlContent;

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
  let activeItem = document.getElementById(`chat-${chatId}`);

  // If the list item is not found, create a new one
  if (!activeItem) {
    const sideMenuList = document.querySelector('.side-menu ul');
    activeItem = createChatListItem({ id: chatId, chat_name: chatName });

    //let placeholderItem = document.getElementById("chat-placeholder");
    //if (placeholderItem) {
    //  sideMenuList.replaceChild(activeItem, placeholderItem);
    //} else {
      // If the placeholder doesn't exist for some reason, just prepend the actual item
      sideMenuList.prepend(activeItem);
    //}
  }

  activeItem.classList.add('active');

}

function createChatListItem(chat) {

  /*
  <label class="form-control">
    <input type="checkbox" name="checkbox" />
    Checkbox
  </label>
  */
  let li = document.createElement('li');

  let label = document.createElement('label');
  label.classList.add('form-control');

  // create a checkbox and hide it initially
  let checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.classList.add('edit-list-checkbox');
  checkbox.dataset.chatId = chat.id;
  checkbox.style.display = 'none'; // hide it initially
  checkbox.addEventListener('click', function(event) {
    event.stopPropagation();
  })

  label.appendChild(checkbox);
  label.appendChild(document.createTextNode(chat.chat_name));

  li.appendChild(label);
  //li.appendChild(document.createTextNode(chat.chat_name));
  li.id = `chat-${chat.id}`;
  li.classList.add('chat-list-item');

  // li.textContent = chat.chat_name;
  // li.id = chat.id;

  // Add click event listener
  li.addEventListener('click', function() {
    let chatId = this.id.replace('chat-', '');

    if (isEditListMode) {
      event.preventDefault();
      //let checkbox = document.getElementById(`checkbox-${chatId}`);
      checkbox.checked = !checkbox.checked;
    } else {
      // Pass the id to main process
      ipcRenderer.send('change-chat', chatId);
    }
  });

  return li;
}