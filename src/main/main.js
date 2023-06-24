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
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
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
    db.all(`SELECT * FROM messages WHERE chatId = ? ORDER BY createdAt, id`, chatId, (err, rows) => {
      if (err) {
        reject(err);
      } else {
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

const callApi = async (query) => {
  const openai = new OpenAIApi(configuration);
  const chatCompletion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: query }],
  });
  return chatCompletion;
};

const saveMessages = async (chatId, userQuery, assistantResponse) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");
      let chatName = '';

      if (!chatId) {
        chatName = extractKeywords(userQuery);

        db.run(`INSERT INTO chats(chat_name) VALUES(?)`, [chatName], function (err) {
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
        insertUserMessage();
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
        db.run(`INSERT INTO messages(chatId, role, content) VALUES(?, ?, ?)`, [chatId, 'assistant', assistantResponse], function (err) {
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
              content: assistantResponse,
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
    const chatCompletion = await callApi(data.query);

    const result = await saveMessages(data.id, data.query, chatCompletion.data.choices[0].message.content);
    const messages = result[0];
    const chatName = result[1];

    // Send the data to the renderer process
    mainWindow.webContents.send('api-response', {
      messages: messages,
      chatName: chatName
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
    const messages = await getChatMessages(chatId);
    mainWindow.webContents.send('chat-messages', messages);
  } catch (err) {
    console.error(err);
  }
});


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

function extractKeywords(text) {
  // Convert text to lower case and split it into an array of words
  let words = text.toLowerCase().split(/\W+/);

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

  return topKeywords.join(' ');
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
