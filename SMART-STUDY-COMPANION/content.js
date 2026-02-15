chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_SELECTION") {
    const selectedText = window.getSelection().toString();
    sendResponse({ text: selectedText });
  }
});
