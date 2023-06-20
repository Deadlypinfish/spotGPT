const { app, Tray, Menu, BrowserWindow, globalShortcut, ipcMain } = require("electron");
const { Configuration, OpenAIApi } = require("openai");

require("dotenv").config();
const path = require('path');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

let mainWindow, spotWindow;
let tray = null;

const createMainWindow = () => {
    mainWindow = new BrowserWindow({
      width: 800,
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

  try {
    const chatCompletion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo", // replace with the engine you're using
      messages: [{ role: "user", content: query }],
    });

    console.log(chatCompletion.data.choices[0].message);

    mainWindow.show();
    mainWindow.webContents.send('api-response', chatCompletion.data.choices[0].message);

    
    
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
