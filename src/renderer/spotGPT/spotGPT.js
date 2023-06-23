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
        console.log('Enter pressed');
        let text = inputField.value.trim();
        console.log(text);
      inputField.value = "";
      if (text) {

        try {

            ipcRenderer.invoke("run-query", { query: text, id: ''});
            // Handle any response here if needed
          } catch (error) {
            console.error(error);
            // Handle error here
          }

          
        inputField.value = ""; // Clear the input field
        ipcRenderer.send("hide-window");
      }
    }
  });
});
