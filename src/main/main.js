const { app, Tray, Menu, BrowserWindow, globalShortcut, ipcMain } = require("electron");
const { Configuration, OpenAIApi } = require("openai");
require("dotenv").config();

const Store = require('../modules/Store')
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

// Define defaults for the Store
const storeDefaults = {
  OPENAI_API_KEY: '', // Default value for the OpenAI API key
  MODEL_ENGINE: '',
  // Add more defaults as needed

}

// Initialize a new Store with a config name and defaults
const store = new Store({
  configName: 'user-settings',
  defaults: storeDefaults
})

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
    
    //mainWindow.webContents.openDevTools();
  
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

ipcMain.handle('get-api-key', (event) => {
  const apiKey = store.get('OPENAI_API_KEY');
  return apiKey;
});

ipcMain.handle('set-api-key', (event, apiKey) => {
  store.set('OPENAI_API_KEY', apiKey);
})

ipcMain.handle('get-model-engine', (event) => {
  const apiKey = store.get('MODEL_ENGINE');
  return apiKey;
});

ipcMain.handle('set-model-engine', (event, engine) => {
  store.set('MODEL_ENGINE', engine);
});

ipcMain.handle('get-model-engines-api', async (event) => {
  const configuration = new Configuration({
    apiKey: store.get('OPENAI_API_KEY')
  });

  const openai = new OpenAIApi(configuration);

  let data = [];
  

  try {
    const response = await openai.listModels();
    //data = response.data.data;
    data = response.data;
  } catch (err) {
    console.error(err);

  }

  // let accessibleModels = [];
  // data = data.data;
  // const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  // for (let model of data) {
  //   console.log('trying model (' + model.id + ')');

  //   try {
  //     let messages = [
  //       {"role": "user", "content": "test"}
  //   ]
  //     let chatConfig = {
  //       model: model.id,
  //       messages: messages,
  //       max_tokens: 1
  //     }
  //     let res = await openai.createChatCompletion(
  //       chatConfig
  //     );

  //     console.log('response');
  //     console.log(res);

  //     accessibleModels.push(model.id);
  //   } catch(error) {
  //     console.log('error');
  //     console.error(error);
  //   }

  //   await sleep(1000);
  // }

  // fs.writeFileSync('accessible_models.txt', accessibleModels.join('\n'), 'utf8');
  // console.log(accessibleModels);
  console.log(data);
  return data;
});

//await run(db, "INSERT INTO MyTable (col1, col2) VALUES (?, ?)", ['value1', 'value2']);
function sqliteRun(db, query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, (err) => {
      if (err) reject(err);
      resolve();
    })
  })
}

//const row = await get(db, "SELECT * FROM MyTable WHERE id = ?", [1]);
function sqliteGet(db, query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      resolve(row);
    })
  })
}

// const rows = await all(db, "SELECT * FROM MyTable WHERE column = ?", ['value']);
function sqliteAll(db, query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    })
  })
}

async function sqliteColumnExists(db, tableName, columnName) {
  const rows = await sqliteAll(db, `PRAGMA table_info(${tableName})`);
  for (const row of rows) {
    if (row.name === columnName) {
      return true;
    }
  }
  return false;
}

async function initDatabase() {

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, async (err) => {
      if (err) reject(err);


      try {
        const row = await sqliteGet(db, 'PRAGMA user_version');
        const dbVersion = row.user_version;

        if (dbVersion < 1) {
          await sqliteRun(db, `CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_name TEXT NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            isArchived BOOLEAN DEFAULT 0
          )
          `);

          await sqliteRun(db, `CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chatId INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(chatId) REFERENCES chats(id)
          )`);
          
          await sqliteRun(db, "PRAGMA user_version = 1");
        }

        if(dbVersion < 2) {
          if (!(await sqliteColumnExists(db, 'chats', 'total_tokens'))) {
            await sqliteRun(db, `ALTER TABLE chats ADD COLUMN total_tokens INTEGER DEFAULT 0`);
          }
          await sqliteRun(db, "PRAGMA user_version = 2");
        }

        resolve(db);

      } catch(err) {
        reject(err);
      }

    });
  });
}

function queryChats(db) {
  return new Promise((resolve, reject) => {
    let sql = `
      SELECT 
        c.*
      FROM chats c
      LEFT JOIN (
        SELECT 
          chatId, 
          MAX(createdAt) AS createdAt 
        FROM messages 
        GROUP BY chatId
      ) m ON c.id = m.chatId 
      ORDER BY m.createdAt DESC;
    `;
    db.all(sql, [], (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });

    // db.all("SELECT * FROM chats", [], (err, rows) => {
    //   if (err) reject(err);
    //   resolve(rows);
    // });
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

  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { role: 'quit' } // "role": system prepared action menu
        ,
        {
          label: 'Preferences',
          click: () => {
            const settingsWindow = new BrowserWindow(
              { 
                width: 500,
                height: 315,
                title: "spotGPT - Preferences",
                resizable: false,
                icon: path.join(__dirname, '..', 'assets', 'icon.png'),
                webPreferences: {
                  nodeIntegration: true,
                  contextIsolation: false,
                  //devTools: true
                },
              });

            settingsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'settingsWindow', 'settings.html')) // Path to your settings form

            //settingsWindow.webContents.openDevTools();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forcereload' },
        { role: 'toggledevtools' },
        { type: 'separator' },
        { role: 'resetzoom' },
        { role: 'zoomin' },
        { role: 'zoomout' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    // Other system prepared action menus: "Window", "Help"
    
  ])

  
  
  Menu.setApplicationMenu(menu)

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow.show();
  })


  //spotWindow.loadFile('src/renderer/spotGPT/spotGPT.html')

  // Register global shortcut
  let registerShortcut = true;
  const ret = toggleShortcut(registerShortcut);

  if (!ret) console.log("registration failed");

  console.log(globalShortcut.isRegistered("CommandOrControl+Shift+Space"));

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

const callApi = async (messages, configuration) => {
  console.log('callApi called');
  let model = store.get('MODEL_ENGINE');
  console.log(model)

  //if (!model) model = 'gpt-3.5-turbo';

  //model = 'gpt-3.5-turbo';

  const openai = new OpenAIApi(configuration);
  const chatCompletion = await openai.createChatCompletion({
    model: model,
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


async function insertMessage({chatId: chatId, role: role, content: userQuery}) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO messages(chatId, role, content) VALUES(?, ?, ?)`, 
           [chatId, role, userQuery], function (err) {
      if (err) {
        console.error(err.message);
        reject(err);
        return;
      }

      const userMessage = {
        chatId: chatId,
        role: role,
        content: userQuery,
        createdAt: new Date()
      }

      resolve(userMessage);
    });
  });
};


async function createChatAndMessage(chatName, userQuery) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      db.run(`INSERT INTO chats(chat_name) VALUES(?)`, [chatName], function (err) {
        if (err) {
          console.error(err.message);
          db.run('ROLLBACK');
          reject(err);
          return;
        }
        const chatId = this.lastID;

        db.run(`INSERT INTO messages(chatId, role, content) VALUES(?, ?, ?)`, [chatId, 'user', userQuery], function (err) {
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

            resolve([chatId, userMessage]);
          });
        });
      });
    });
  });
};

async function saveGptMessageAndUpdateChat(chatId, chatCompletion) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      db.run(`UPDATE chats SET total_tokens = ? WHERE id = ?`, [chatCompletion.data.usage.total_tokens, chatId], function (err) {
        if (err) {
          console.error(err.message);
          db.run('ROLLBACK');
          reject(err);
          return;
        }

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

            const assistantMessage = {
              chatId: chatId,
              role: 'assistant',
              content: chatCompletion.data.choices[0].message.content,
              createdAt: new Date()
            }

            resolve(assistantMessage);
          });
        });
      });
    });
  });
};


// const saveMessages = async ({id: chatId, query: userQuery, chatName: chatName}, chatCompletion) => {
//   return new Promise((resolve, reject) => {
//     db.serialize(() => {
//       db.run("BEGIN TRANSACTION");
//       //let chatName = '';

//       if (!chatId) {
//         //chatName = extractKeywords(userQuery);

//         db.run(`INSERT INTO chats(chat_name, total_tokens) VALUES(?, ?)`, [chatName, chatCompletion.data.usage.total_tokens], function (err) {
//           if (err) {
//             console.error(err.message);
//             db.run('ROLLBACK');
//             reject(err);
//             return;
//           }
//           chatId = this.lastID;

//           insertUserMessage();
//         });
//       } else {
//         //updateTokenTotal(chatCompletion.data.choices[0].message.content);
//         //insertUserMessage();
//         db.run(`UPDATE chats SET total_tokens = ? WHERE id = ?`, [chatCompletion.data.usage.total_tokens, chatId], function (err) {
//           if (err) {
//             console.error(err.message);
//             db.run('ROLLBACK');
//             reject(err);
//             return;
//           }
//           insertUserMessage();
//         })
//       }

//       function insertUserMessage() {
//         db.run(`INSERT INTO messages(chatId, role, content) VALUES(?, ?, ?)`, [chatId, 'user', userQuery], function (err) {
//           if (err) {
//             console.error(err.message);
//             db.run('ROLLBACK');
//             reject(err);
//             return;
//           }

//           insertAssistantMessage();
//         });
//       }

//       function insertAssistantMessage() {
//         db.run(`INSERT INTO messages(chatId, role, content) VALUES(?, ?, ?)`, [chatId, 'assistant', chatCompletion.data.choices[0].message.content], function (err) {
//           if (err) {
//             console.error(err.message);
//             db.run('ROLLBACK');
//             reject(err);
//             return;
//           }

//           db.run('COMMIT', function (err) {
//             if (err) {
//               console.error(err.message);
//               db.run('ROLLBACK');
//               reject(err);
//               return;
//             }

//             const userMessage = {
//               chatId: chatId,
//               role: 'user',
//               content: userQuery,
//               createdAt: new Date()
//             }

//             const assistantMessage = {
//               chatId: chatId,
//               role: 'assistant',
//               content: chatCompletion.data.choices[0].message.content,
//               createdAt: new Date()
//             }

//             resolve([[userMessage, assistantMessage],chatName]);
//           });
//         });
//       }
//     });
//   });
// };

ipcMain.on('delete-chats', (event, chatIds) => {
  console.log('delete chats called');
  console.log(chatIds);

  // Convert array to string and add parenthesis for the SQL query
  const chatIdsString = `(${chatIds.join(',')})`;

  db.serialize(() => {
    db.run(`BEGIN TRANSACTION`);

    // Delete messages from the chats first to maintain foreign key constraint
    db.run(`DELETE FROM messages WHERE chatId IN ${chatIdsString}`, (err) => {
      if (err) {
        console.error(err.message);
        db.run('ROLLBACK');
        return;
      }

      // Delete chats
      db.run(`DELETE FROM chats WHERE id IN ${chatIdsString}`, (err) => {
        if (err) {
          console.error(err.message);
          db.run('ROLLBACK');
          return;
        }

        db.run(`COMMIT`, async (err) => {
          if (err) {
            console.error(err.message);
            db.run('ROLLBACK');
            return;
          }

          console.log(`Chats with IDs ${chatIdsString} have been deleted`);

          // Get updated chat list after delete
          try {
            const chats = await queryChats(db);
            console.log(chats);
            
            mainWindow.webContents.send('chat-list', chats);
          } catch(err) {
            console.error('Error while fetching updated chats: ', err);
          }


        });
      });
    });
  });

});

ipcMain.on('toggle-shortcut', (event, isEditListMode) => {
  toggleShortcut(isEditListMode);
});

function toggleShortcut(registerShortcut) {

  if (registerShortcut) {
    globalShortcut.register("CommandOrControl+Shift+Space", () => {
      if (spotWindow.isVisible()) {
        spotWindow.hide();
      } else {
        spotWindow.show();
      }
    });
  }
  else {
    globalShortcut.unregister('CommandOrControl+Shift+Space');
  }
  

}

ipcMain.handle('run-query', async (event, data) => {
  let previousMessages = [];
  let messages = [];
  let tokenCount = 0;

  let newMessage;
  let isArchived = false;
  let isCloseToArchive = false;
  
  try {
    const isNewChat = !data.id;

    if (data.id) {
      previousMessages = await getChatMessages(data.id);
      tokenCount = previousMessages.length ? previousMessages[0].total_tokens : 0;
      newMessage = {
        chatId: data.id,
        role: 'user',
        content: data.query,
        createdAt: new Date()
      }
      await insertMessage(newMessage);

    } else {
      data.chatName = extractKeywords(data.query);
      //throw new Error('db error!');
      const result = await createChatAndMessage(data.chatName, data.query);
      data.id = result[0];
      newMessage = result[1];
    }

    if (tokenCount > 3200) {
      // Warn the user
      isCloseToArchive = true;
    }
    else if (tokenCount > 3900) {
      db.run(`UPDATE chats SET isArchived = 1 WHERE id = ?`, newMessage.chatId);
      // Disable input for this chat and inform the user
      isArchived = true;
    }

    const loadingData = {
      messages: [newMessage],
      chatName: data.chatName,
      isArchived: isArchived,
      isCloseToArchive: isCloseToArchive
    }
    mainWindow.webContents.send('loading', loadingData);


    // prepare new message to be appended to old
    // messages to give AI full context of conversation
    // (map is to take db columns to conver to openaiAPI
    // object parameter names)
    messages = previousMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    messages.push({ role: "user", content: data.query });

  } catch (error) {
    // Send error to renderer process
    mainWindow.webContents.send('db-operation-failed', data);
    console.error(error);
    return;  // Exit the function here if DB operation failed
  }

  try {
    const configuration = new Configuration({
      apiKey: store.get('OPENAI_API_KEY')
    });

    const chatCompletion = await callApi(messages, configuration);

    //const tokenCount = estimateTokenCount(messages);
    if (chatCompletion.data.usage.total_tokens > 3200) {
      // Warn the user
      isCloseToArchive = true;
    }
    else if (chatCompletion.data.usage.total_tokens > 3900) {
      db.run(`UPDATE chats SET isArchived = 1 WHERE id = ?`, newMessage.chatId);
      // Disable input for this chat and inform the user
      isArchived = true;
    }

    let assistantResponse;
    // if (isNewChat) {
      assistantResponse = await saveGptMessageAndUpdateChat(data.id, chatCompletion);
      //data.id = result[0];
      //assistantResponse = result[1];

      //await saveGptMessageAndUpdateChat(data.id, chatCompletion);
    // } else {
    //   const result = await saveMessages(data, chatCompletion);
    //   assistantResponse = result[0][0];
    // }

    // Send the data to the renderer process
    // mainWindow.webContents.send('api-response', {
    //   messages: assistantResponse,
    //   chatName: data.chatName,
    //   isArchived: isArchived,
    //   isCloseToArchive: isCloseToArchive
    // });
    mainWindow.webContents.send('api-response', {
      messages: [assistantResponse],
      chatName: data.chatName,
      isArchived: isArchived,
      isCloseToArchive: isCloseToArchive
    });
    

    mainWindow.show();
    mainWindow.focus();

  } catch (error) {


    let response = {
      isArchived: isArchived,
      isCloseToArchive: isCloseToArchive
    }

    mainWindow.webContents.send('api-call-failed', response);
    console.error(error);
  }
});

ipcMain.handle('retry-query', async (event, chatId) => {
  let previousMessages = [];
  let tokenCount = 0;

  let isArchived = false;
  let isCloseToArchive = false;

  try {
    previousMessages = await getChatMessages(chatId);
    tokenCount = previousMessages.length ? previousMessages[0].total_tokens : 0;
    
    if (tokenCount > 3200) {
      // Warn the user
      isCloseToArchive = true;
    }
    else if (tokenCount > 3900) {
      db.run(`UPDATE chats SET isArchived = 1 WHERE id = ?`, chatId);
      // Disable input for this chat and inform the user
      isArchived = true;
    }

    // Prepare previous messages to give AI full context of conversation
    const messages = previousMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    const configuration = new Configuration({
      apiKey: store.get('OPENAI_API_KEY')
    });

    const chatCompletion = await callApi(messages, configuration);

    if (chatCompletion.data.usage.total_tokens > 3200) {
      // Warn the user
      isCloseToArchive = true;
    }
    else if (chatCompletion.data.usage.total_tokens > 3900) {
      db.run(`UPDATE chats SET isArchived = 1 WHERE id = ?`, chatId);
      // Disable input for this chat and inform the user
      isArchived = true;
    }

    const assistantResponse = await saveGptMessageAndUpdateChat(chatId, chatCompletion);

    // Send the data to the renderer process
    mainWindow.webContents.send('api-response', {
      messages: [assistantResponse],
      chatName: assistantResponse.chatName,  // Assuming assistantResponse object contains chatName
      isArchived: isArchived,
      isCloseToArchive: isCloseToArchive
    });

    mainWindow.show();
    mainWindow.focus();

  } catch (error) {
    let response = {
      isArchived: isArchived,
      isCloseToArchive: isCloseToArchive
    }

    mainWindow.webContents.send('api-call-failed', response);
    console.error(error);
  }
});

// ipcMain.handle('run-query-old', async (event, data) => {
//   try {
//     // Get the previous messages
//     let previousMessages = [];
//     let tokenCount = 0;
//     //let chatName = '';

//     if (data.id) {
//       previousMessages = await getChatMessages(data.id);
//       tokenCount = previousMessages.length ? previousMessages[0].total_tokens : 0;
//       //const result = await getChatMessages(data.id);
//       //previousMessages = result.messages;
//       //tokenCount = result.tokenCount;
//     }
//     else {
//       data.chatName = extractKeywords(data.query);

//       // clear any potential messages in the main window since this is a new search
//       // mainWindow.webContents.send('chat-messages', {
//       //   messages: [],
//       //   isArchived:false,
//       //   isCloseToArchive: false
//       // });

//       mainWindow.webContents.send('loading', data.chatName);

//     }

//     // Convert previous messages into the format expected by OpenAI API
//     const messages = previousMessages.map(msg => ({
//       role: msg.role,
//       content: msg.content
//     }));

//     // Add the new user message
//     messages.push({ role: "user", content: data.query });

//     const configuration = new Configuration({
//       apiKey: store.get('OPENAI_API_KEY')
//     });

//     const chatCompletion = await callApi(messages, configuration);
//     console.dir(chatCompletion);
//     console.log(chatCompletion.data.usage.total_tokens);

//     const result = await saveMessages(data, chatCompletion);
//     const savedMessages = result[0];
//     //const chatName = result[1];

//     let isArchived = false;
//     let isCloseToArchive = false;
//     //const tokenCount = estimateTokenCount(messages);
//     if (chatCompletion.data.usage.total_tokens > 3200) {
//       // Warn the user
//       isCloseToArchive = true;
//     }
//     else if (chatCompletion.data.usage.total_tokens > 3900) {
//       db.run(`UPDATE chats SET isArchived = 1 WHERE id = ?`, chatId);
//       // Disable input for this chat and inform the user
//       isArchived = true;
//     }

//     // Send the data to the renderer process
//     mainWindow.webContents.send('api-response', {
//       messages: savedMessages,
//       chatName: data.chatName,
//       isArchived: isArchived,
//       isCloseToArchive: isCloseToArchive
//     });
    
//     mainWindow.show();
//     mainWindow.focus();

//   } catch (error) {
//     // reset and show error
//     // if there is not a chat id yet, we can remove the placeholder?
//     // or maybe put it back in the input text to try again. or do we still create the chat
//     // and save the single message to let them try again. 

//     mainWindow.webContents.send('api-failed', data);

//     console.error(error);
//   }
// });

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

  // if extracting words prevented the title from existing just use the 
  // original words
  if (!title) {
    title = words.map(capitalizeFirstLetter).join(' ');
  }
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
