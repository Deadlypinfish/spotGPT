const { app, Tray, Menu, BrowserWindow, globalShortcut, ipcMain } = require("electron");
const { Configuration, OpenAIApi } = require("openai");
require("dotenv").config();

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'database', 'chatDatabase.cb');

const dirPath = path.dirname(dbPath);

if (!fs.existsSync(dirPath)) {
  fs.mkdirSync(dirPath, { recursive: true });
}

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
  var newdb = new sqlite3.Database(dbPath, (err) => {
      if (err) {
          console.log("Getting error " + err);
          return;
      }
      createTables(newdb);
  });
}

function createTables(newdb) {
  newdb.exec(`
    CREATE TABLE chats(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_name TEXT NOT NULL
    );

    CREATE TABLE messages(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY(chat_id) REFERENCES chats(id)
    );
    `, ()  => {
        runQueries(newdb);
    });
}

function runQueries(db) {
  // Implement your queries here.
}

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
          )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY,
            chatId INTEGER,
            role TEXT,
            content TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(chatId) REFERENCES chats(id)
          )`);

  db.run("PRAGMA foreign_keys = ON");
});

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

let mainWindow, spotWindow;
let tray = null;

const createMainWindow = () => {
    mainWindow = new BrowserWindow({
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
  
    mainWindow.loadFile("src/renderer/mainWindow/index.html");    
    
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

  spotWindow.loadFile("src/renderer/spotGPT/spotGPT.html");
  //spotWindow.webContents.openDevTools();
};

app.whenReady().then(() => {
  createMainWindow();

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
ipcMain.on("run-query", async (event, query) => {
  console.log("query:" + query);

  const openai = new OpenAIApi(configuration);
  console.log("openai:" + openai);

  // openai.listEngines().then((e) => {
  //   console.log(e);
  // });

  // Get ID of active chat, if any
  let activeChatId = ''; // Get this from your application state


  try {
    const chatCompletion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo", // replace with the engine you're using
      messages: [{ role: "user", content: query }],
    });

    console.log(chatCompletion.data.choices[0].message.content);

    
    

    db.serialize(() => {
      db.run("BEGIN TRANSACTION");
    
      db.run(`INSERT INTO chats DEFAULT VALUES`, function(err) {
        if (err) {
          console.error(err.message);
          return db.run('ROLLBACK');
        }
        // The last inserted row id is here
        let activeChatId = this.lastID;
    
        // insert user query
        db.run(`INSERT INTO messages(chatId, role, content) VALUES(?, ?, ?)`, [activeChatId, 'user', query], function(err) {
          if (err) {
            console.error(err.message);
            return db.run('ROLLBACK');
          }
    
          // Now insert the assistant's message, using the activeChatId
          db.run(`INSERT INTO messages(chatId, role, content) VALUES(?, ?, ?)`, [activeChatId, 'assistant', chatCompletion.data.choices[0].message.content], function(err) {
            if (err) {
              console.error(err.message);
              return db.run('ROLLBACK');
            }
    
            // If no errors, commit the transaction
            db.run('COMMIT');
          });
        });
      });
    });

    

    mainWindow.show();
    mainWindow.webContents.send('api-response', chatCompletion.data.choices[0].message);

    //await new Promise(resolve => setTimeout(resolve, 3000));

    //mainWindow.show();
    //mainWindow.webContents.send('api-response', {content:'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Sed enim ut sem viverra aliquet eget sit amet. Sed sed risus pretium quam vulputate dignissim suspendisse in. Auctor elit sed vulputate mi sit amet mauris commodo. Nisi lacus sed viverra tellus in hac habitasse. Velit dignissim sodales ut eu sem integer vitae justo eget. Scelerisque purus semper eget duis at tellus at urna. At consectetur lorem donec massa sapien. Sed blandit libero volutpat sed cras ornare arcu dui vivamus.'});
    
    
  } catch (error) {
    console.error(error);
  }


  // Send the query to the mainWindow
  //mainWindow.webContents.send('run-query', query)
});

ipcMain.on("hide-window", () => {
  if (spotWindow) {
    spotWindow.hide();
  }
});
