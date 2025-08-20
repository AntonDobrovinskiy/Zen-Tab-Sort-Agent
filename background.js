// A simple function to sort tabs in the current window.
// It's like a tiny librarian for your browser tabs!
async function sortTabs() {
  // Get all tabs in the current window.
  const tabs = await browser.tabs.query({ currentWindow: true });

  // First remove duplicates
  const uniqueTabs = await removeDuplicateTabs(tabs);

  // Sort the remaining tabs. We'll use a two-level sorting approach:
  // 1. Sort by URL first to group tabs from the same website.
  // 2. Then, sort by title for a nice alphabetical order within each group.
  uniqueTabs.sort((a, b) => {
    const urlA = a.url;
    const urlB = b.url;
    const titleA = a.title;
    const titleB = b.title;

    // First, compare by URL.
    const urlCompare = urlA.localeCompare(urlB);
    
    // If URLs are different, we're done here.
    if (urlCompare !== 0) {
      return urlCompare;
    }

    // If URLs are the same, let's sort by title.
    return titleA.localeCompare(titleB);
  });

  // Now, let's rearrange the tabs to their sorted positions.
  // Move all tabs at once, starting from index 0.
  // Think of it as putting the sorted stack of cards back on the table.
  const tabIds = uniqueTabs.map(tab => tab.id);
  await browser.tabs.move(tabIds, { index: 0 }); 
}

// Helper function to remove duplicate tabs
async function removeDuplicateTabs(tabs) {
  const seen = new Map();
  const duplicates = [];

  // Find duplicates while keeping the first occurrence of each URL
  tabs.forEach(tab => {
    if (seen.has(tab.url)) {
      duplicates.push(tab.id);
    } else {
      seen.set(tab.url, tab);
    }
  });

  // Remove duplicate tabs
  if (duplicates.length > 0) {
    await browser.tabs.remove(duplicates);
  }

  // Return remaining tabs
  return Array.from(seen.values());
}

// Listen for when a new tab is created and has finished loading.
// This is more efficient than sorting on every little change.
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // The 'status' property tells us if the tab is fully loaded.
  // We only want to sort when it's "complete."
  if (changeInfo.status === 'complete') {
    sortTabs();
  }
});

// We can also sort manually with a click on the extension icon.
// Just in case things get a little messy.
browser.browserAction.onClicked.addListener(sortTabs);

// --- New code for the keyboard shortcut ---
// Listen for commands (our hotkey!)
browser.commands.onCommand.addListener(command => {
  console.log(`Command received: ${command}`); // This is new!
  if (command === "sort-tabs") {
    console.log("Alt+S was pressed. Sorting tabs!");
    sortTabs();
  }
});