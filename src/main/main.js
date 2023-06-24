const { app, Tray, Menu, BrowserWindow, globalShortcut, ipcMain } = require("electron");
const { Configuration, OpenAIApi } = require("openai");
require("dotenv").config();

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const nlp = require('compromise');
const { removeStopwords } = require('stopword');

const dbPath = path.join(__dirname, '..', 'database', 'chatDatabase.db');

const dirPath = path.dirname(dbPath);


let mainWindow, spotWindow;
let tray = null;

let db;

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

app.setName('spotGPT');


async function startApp() {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    db = await initDatabase();
    const chats = await queryChats(db);
    await createMainWindow();

    mainWindow.on('close', (event) => {
      if(!app.isQuiting) {
        event.preventDefault();
        mainWindow.hide();
      }
    });

    
    mainWindow.webContents.send('chat-list', chats);

  } catch (err) {
    console.error(err);
  }
}








const createMainWindow = async () => {
    mainWindow = new BrowserWindow({
      title: "spotGPT",
      width: 800,
      //width: 1800,
      height: 600,
      icon: path.join(__dirname, '..', 'assets', 'icon.png'),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        devTools: true,
      },
    });
  
    const mainWindowPath = path.join(__dirname, '..', 'renderer', 'mainWindow', 'index.html');
    await mainWindow.loadFile(mainWindowPath);
    //await mainWindow.loadFile("src/renderer/mainWindow/index.html");    
    
    mainWindow.webContents.openDevTools();
  
};

const createSpotWindow = () => {
  spotWindow = new BrowserWindow({
    width: 800,
    height: 80,
    // width:800,
    // height:500, // testing size to see dev console
    resizable: false,
    frame: false,
    show: false, // do not show the spotWindow immediately
    closable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      //devTools: true
    },
  });

  const spotWindowPath = path.join(__dirname, '..', 'renderer', 'spotGPT', 'spotGPT.html');
  spotWindow.loadFile(spotWindowPath);
  //spotWindow.loadFile("src/renderer/spotGPT/spotGPT.html");
  //spotWindow.webContents.openDevTools();
};


function initDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
      if (err) reject(err);

      db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS chats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_name TEXT NOT NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          isArchived BOOLEAN DEFAULT 0,
          total_tokens INTEGER DEFAULT 0
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chatId INTEGER NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(chatId) REFERENCES chats(id)
        )`, (err) => {
          if (err) reject(err);
          resolve(db);
        });
      });
    });
  });
}

function queryChats(db) {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM chats", [], (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
}

function getChatMessages(chatId) {
  return new Promise((resolve, reject) => {
    // db.all(`SELECT * FROM messages WHERE chatId = ? ORDER BY createdAt, id`, chatId, (err, rows) => {
    //   if (err) {
    //     reject(err);
    //   } else {
    //     let allMessages = rows.map(row => row.content).join(' ');
    //     let tokenCountEstimate = Math.floor(allMessages.length / 3.5);

    //     resolve({messages: rows, tokenCount: tokenCountEstimate});
    //   }
    // });
    db.all(`SELECT c.total_tokens, m.* FROM chats c JOIN messages m ON c.id = m.chatId WHERE m.chatId = ? ORDER BY m.createdAt, m.id`, chatId, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        // total_tokens will be same in all rows for the same chatId
        // so, we take it from the first row
        //const totalTokens = rows.length ? rows[0].total_tokens : 0;

        //resolve({messages: rows, tokenCount: tokenCountEstimate});
        resolve(rows);
      }
    });
  });
}

app.whenReady().then(() => {
  
  // Start the app
  startApp();


  createSpotWindow();


  tray = new Tray(path.join(__dirname, '..', 'assets', 'icon.png'));
  
  tray.setToolTip('spotGPT')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open',
      click: function() {
        mainWindow.show();
      }
    },
    {
      label: 'Quit',
      click: function() {
        app.isQuiting = true;
        if (tray) {
          tray.destroy();
          tray = null;
        }
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow.show();
  })


  //spotWindow.loadFile('src/renderer/spotGPT/spotGPT.html')

  // Register global shortcut
  const ret = globalShortcut.register("CommandOrControl+Space", () => {
    if (spotWindow.isVisible()) {
      spotWindow.hide();
    } else {
      spotWindow.show();
    }
  });

  if (!ret) console.log("registration failed");

  console.log(globalShortcut.isRegistered("CommandOrControl+Space"));

  // Create windows
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('before-quit', () => {
    app.isQuiting = true;
    if (mainWindow) mainWindow.destroy();
    if (spotWindow) spotWindow.destroy();
  });

  spotWindow.on("blur", () => {
    spotWindow.hide();
  });

  spotWindow.on("show", () => {
    spotWindow.webContents.send("window-shown");
  });
});

app.on("window-all-closed", () => {
  shutdown();
});

const shutdown = () => {
  if (process.platform !== "darwin") app.quit();
};

const unregister = () => {
  globalShortcut.unregister("CommandOrControl+Space");
  globalShortcut.unregisterAll();
};
app.on("will-quit", () => {
  // Unregister the shortcut and all shortcuts
  unregister();
});

const callApi = async (messages) => {
  const openai = new OpenAIApi(configuration);
  const chatCompletion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: messages,
  });
  return chatCompletion;
};


// const callApi = async (query) => {
//   const openai = new OpenAIApi(configuration);
//   const chatCompletion = await openai.createChatCompletion({
//     model: "gpt-3.5-turbo",
//     messages: [{ role: "user", content: query }],
//   });
//   return chatCompletion;
// };

const saveMessages = async ({id: chatId, query: userQuery}, chatCompletion) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");
      let chatName = '';

      if (!chatId) {
        chatName = extractKeywords(userQuery);

        db.run(`INSERT INTO chats(chat_name, total_tokens) VALUES(?, ?)`, [chatName, chatCompletion.data.usage.total_tokens], function (err) {
          if (err) {
            console.error(err.message);
            db.run('ROLLBACK');
            reject(err);
            return;
          }
          chatId = this.lastID;

          insertUserMessage();
        });
      } else {
        //updateTokenTotal(chatCompletion.data.choices[0].message.content);
        //insertUserMessage();
        db.run(`UPDATE chats SET total_tokens = ? WHERE id = ?`, [chatCompletion.data.usage.total_tokens, chatId], function (err) {
          if (err) {
            console.error(err.message);
            db.run('ROLLBACK');
            reject(err);
            return;
          }
          insertUserMessage();
        })
      }

      function insertUserMessage() {
        db.run(`INSERT INTO messages(chatId, role, content) VALUES(?, ?, ?)`, [chatId, 'user', userQuery], function (err) {
          if (err) {
            console.error(err.message);
            db.run('ROLLBACK');
            reject(err);
            return;
          }

          insertAssistantMessage();
        });
      }

      function insertAssistantMessage() {
        db.run(`INSERT INTO messages(chatId, role, content) VALUES(?, ?, ?)`, [chatId, 'assistant', chatCompletion.data.choices[0].message.content], function (err) {
          if (err) {
            console.error(err.message);
            db.run('ROLLBACK');
            reject(err);
            return;
          }

          db.run('COMMIT', function (err) {
            if (err) {
              console.error(err.message);
              db.run('ROLLBACK');
              reject(err);
              return;
            }

            const userMessage = {
              chatId: chatId,
              role: 'user',
              content: userQuery,
              createdAt: new Date()
            }

            const assistantMessage = {
              chatId: chatId,
              role: 'assistant',
              content: chatCompletion.data.choices[0].message.content,
              createdAt: new Date()
            }

            resolve([[userMessage, assistantMessage],chatName]);
          });
        });
      }
    });
  });
};

ipcMain.handle('run-query', async (event, data) => {
  try {
    // Get the previous messages
    let previousMessages = [];
    let tokenCount = 0;
    if (data.id) {
      previousMessages = await getChatMessages(data.id);
      tokenCount = previousMessages.length ? previousMessages[0].total_tokens : 0;
      //const result = await getChatMessages(data.id);
      //previousMessages = result.messages;
      //tokenCount = result.tokenCount;
    }

    // Convert previous messages into the format expected by OpenAI API
    const messages = previousMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Add the new user message
    messages.push({ role: "user", content: data.query });

    const chatCompletion = await callApi(messages);
    console.dir(chatCompletion);
    console.log(chatCompletion.data.usage.total_tokens);

    const result = await saveMessages(data, chatCompletion);
    const savedMessages = result[0];
    const chatName = result[1];

    let isArchived = false;
    let isCloseToArchive = false;
    //const tokenCount = estimateTokenCount(messages);
    if (chatCompletion.data.usage.total_tokens > 3200) {
      // Warn the user
      isCloseToArchive = true;
    }
    else if (chatCompletion.data.usage.total_tokens > 3900) {
      db.run(`UPDATE chats SET isArchived = 1 WHERE id = ?`, chatId);
      // Disable input for this chat and inform the user
      isArchived = true;
    }

    // Send the data to the renderer process
    mainWindow.webContents.send('api-response', {
      messages: savedMessages,
      chatName: chatName,
      isArchived: isArchived,
      isCloseToArchive: isCloseToArchive
    });
  } catch (error) {
    console.error(error);
  }
});

ipcMain.on("hide-window", () => {
  if (spotWindow) {
    spotWindow.hide();
  }
});

ipcMain.on('change-chat', async (event, chatId) => {
  // Query the messages for the selected chat and send them back to renderer process
  // You can use the `chatId` to select the right messages from your database.
  try {
    //const {messages, tokenCount } = await getChatMessages(chatId);
    const messages = await getChatMessages(chatId);
    const tokenCount = messages.length ? messages[0].total_tokens : 0;

    let isCloseToArchive = false;
    let isArchived = false;

    if (tokenCount > 3200) {
      isCloseToArchive = true;
    }
    else if (tokenCount > 3900) {
      db.run(`UPDATE chats SET isArchived = 1 WHERE id = ?`, chatId);
      // Disable input for this chat and inform the user
      isArchived = true;
    }

    const chat = await getChatInfo(chatId);

    mainWindow.webContents.send('chat-messages', {
      messages: messages,
      isArchived:chat.isArchived || isArchived,
      isCloseToArchive: isCloseToArchive
    });
  } catch (err) {
    console.error(err);
  }
});

function getChatInfo(chatId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM chats WHERE id = ?`, chatId, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}


// function extractKeywords(text) {
//   const doc = nlp(text);
//   const nouns = doc.nouns().out('array');
//   const adjectives = doc.adjectives().out('array');
  
//   // Combine the extracted nouns and adjectives
//   const keywords = [...nouns, ...adjectives];
  
//   // Remove duplicates and join the keywords into a single string
//   const chatName = Array.from(new Set(keywords)).join(' ');

//   return chatName;
// }

// function estimateTokenCount(messages) {
//   const allContent = messages.map(message => message.content).join(' ');

//   return Math.ceil(allContent.length / 3.5);
// }

function extractKeywords(text) {
  // Convert text to lower case and split it into an array of words
  //let words = text.toLowerCase().split(/\W+/);
  let words = text.toLowerCase().split(/(?:(?:[^a-zA-Z']+)|(?:'(?![a-z])))+/);


  // Remove stop words
  let keywords = removeStopwords(words);
  
  // Count the occurrences of each word
  let keywordFrequencies = keywords.reduce((counts, word) => {
    counts[word] = (counts[word] || 0) + 1;
    return counts;
  }, {});
  
  // Sort the words by frequency
  let sortedKeywords = Object.keys(keywordFrequencies).sort((a, b) => keywordFrequencies[b] - keywordFrequencies[a]);
  
  // Take the top 3 most frequent words
  let topKeywords = sortedKeywords.slice(0, 5);

  let title = topKeywords.map(capitalizeFirstLetter).join(' ');

  return title;
}

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// function extractKeywords(text) {
//   let doc = nlp(text);
//   // Extract keywords as the words that aren't filler (stop) words
//   let words = doc
//     .normalize() // Normalize text
//     .out('array'); // Extract array of words
  
//   // Remove stop words
//   let keywords = removeStopwords(words);
  
//   // Return top 3 most frequent non-stopwords, if available
//   let keywordFrequencies = keywords.reduce((counts, word) => {
//     counts[word] = (counts[word] || 0) + 1;
//     return counts;
//   }, {});
  
//   let sortedKeywords = Object.keys(keywordFrequencies).sort((a, b) => keywordFrequencies[b] - keywordFrequencies[a]);
  
//   let topKeywords = sortedKeywords.slice(0, 3); // Take top 3

//   return topKeywords.join(' ');
// }

// Test it out
// let text = "I would like to know more about the climate change and its impacts.";
// let name = extractKeywords(text);
// console.log(name); // might output something like "climate change impacts"
