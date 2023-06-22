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



if (!fs.existsSync(dirPath)) {
  fs.mkdirSync(dirPath, { recursive: true });
}





const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

let mainWindow, spotWindow;
let tray = null;

const createMainWindow = () => {
    mainWindow = new BrowserWindow({
      //width: 800,
      width: 1800,
      height: 600,
      icon: path.join(__dirname, '..', 'assets', 'icon.png'),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        devTools: true,
      },
    });
  
    mainWindow.loadFile("src/renderer/mainWindow/index.html");    
    
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

  spotWindow.loadFile("src/renderer/spotGPT/spotGPT.html");
  //spotWindow.webContents.openDevTools();
};

function loadAndSendChatList() {
  db.all(`SELECT * FROM chats`, [], (err, rows) => {
    if (err) {
      throw err;
    }

    mainWindow.webContents.send('chat-list', rows);
    
  })
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

function initDatabase() {
  let db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err && err.code == "SQLITE_CANTOPEN") {
        createDatabase();
        return;
    } else if (err) {
        console.log("Getting error " + err);
        return;
    }
    runQueries(db);
  });
  
  function createDatabase() {
    // var newdb = new sqlite3.Database(dbPath, (err) => {
    //     if (err) {
    //         console.log("Getting error " + err);
    //         return;
    //     }
    //     createTables(newdb);
    // });
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
              )`);
    
      db.run("PRAGMA foreign_keys = ON");
    });
  }
  
  // function createTables(newdb) {
  //   newdb.exec(`
  //     CREATE TABLE IF NOT EXISTS chats (
  //       id INTEGER PRIMARY KEY AUTOINCREMENT,
  //       chat_name TEXT NOT NULL,
  //       createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  //     );
  
  //     CREATE TABLE IF NOT EXISTS messages (
  //       id INTEGER PRIMARY KEY AUTOINCREMENT,
  //       chatId INTEGER NOT NULL,
  //       role TEXT NOT NULL,
  //       content TEXT NOT NULL,
  //       createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  //       FOREIGN KEY(chatId) REFERENCES chats(id)
  //     );
  
  //     PRAGMA foreign_keys = ON;
  //     `, ()  => {
  //         runQueries(newdb);
  //     });
  // }
  
  function runQueries(db) {
    // Implement your queries here.
    loadAndSendChatList();
  }
}

app.whenReady().then(() => {
  createMainWindow();

  createSpotWindow();

  initDatabase();
  //loadAndSendChatList();

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

  mainWindow.on('close', (event) => {
    if(!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
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
    isQuitting = true;
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

// Listen for 'query' events from the spotWindow
//let data = { query: userInput, id: activeChatID};
ipcMain.on("run-query", async (event, data) => {
  console.log("query:" + data.query);

  const openai = new OpenAIApi(configuration);
  console.log("openai:" + openai);

  try {
    const chatCompletion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo", // replace with the engine you're using
      messages: [{ role: "user", content: data.query }],
    });

    console.log(chatCompletion.data.choices[0].message.content);

    let activeChatId = data.id;
    
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      if(!activeChatId){
        let chatName = extractKeywords(data.query);

        db.run(`INSERT INTO chats(chat_name) VALUES(?)`, [chatName], function(err) {
          if (err) {
            console.error(err.message);
            return db.run('ROLLBACK');
          }
          activeChatId = this.lastID;

          insertUserMessage();
        });
      }else{
        insertUserMessage();
      }

      function insertUserMessage(){
        db.run(`INSERT INTO messages(chatId, role, content) VALUES(?, ?, ?)`, [activeChatId, 'user', data.query], function(err) {
          if (err) {
            console.error(err.message);
            return db.run('ROLLBACK');
          }

          insertAssistantMessage();
        });
      }

      function insertAssistantMessage(){
        db.run(`INSERT INTO messages(chatId, role, content) VALUES(?, ?, ?)`, [activeChatId, 'assistant', chatCompletion.data.choices[0].message.content], function(err) {
          if (err) {
            console.error(err.message);
            return db.run('ROLLBACK');
          }

          db.run('COMMIT', function(err){
            if(err){
              console.error(err.message);
              return db.run('ROLLBACK');
            }

            // If no errors, commit the transaction
            loadAndSendChatList();
            
            try {
              const messages = getChatMessages(chatId).then(() =>{
                mainWindow.webContents.send('chat-messages', messages);
              });
            } catch (err) {
              console.error(err);
            }
            
            
            mainWindow.show();
            mainWindow.webContents.send('api-response', { message: chatCompletion.data.choices[0].message, id: activeChatId } );
          });
        });
      }
      
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
let text = "I would like to know more about the climate change and its impacts.";
let name = extractKeywords(text);
console.log(name); // might output something like "climate change impacts"
