//Renderer process for spotGPT.html:
const { ipcRenderer } = require("electron");

document.addEventListener("DOMContentLoaded", (event) => {
  const inputField = document.getElementById("spot-search");

  // Add this code to focus the input and clear its contents when the window is shown
  ipcRenderer.on("window-shown", () => {
    inputField.value = "";
    inputField.focus();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      inputField.value = "";
      ipcRenderer.send("hide-window");
    } else if (e.key === "Enter") {
      let text = inputField.value.trim();
      inputField.value = "";
      if (text) {
        ipcRenderer.send("run-query", text);
        inputField.value = ""; // Clear the input field
        ipcRenderer.send("hide-window");
      }
    }
  });
});
