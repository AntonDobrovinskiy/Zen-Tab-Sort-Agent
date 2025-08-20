// A simple function to sort tabs in the current window.
// It's like a tiny librarian for your browser tabs!
async function sortTabs() {
  try {
    // Get ALL tabs
    let tabs = await browser.tabs.query({ currentWindow: true });
    
    // Remove duplicates first
    tabs = await removeDuplicateTabs(tabs);

    // Create an array of objects with sorting information
    const tabsWithSortInfo = tabs.map(tab => ({
      id: tab.id,
      index: tab.index,
      domain: extractDomain(tab.url || ''),
      url: tab.url || '',
      title: tab.title || ''
    }));

    // Sort tabs
    tabsWithSortInfo.sort((a, b) => {
      // Compare domains first
      const domainCompare = a.domain.localeCompare(b.domain);
      if (domainCompare !== 0) return domainCompare;

      // Then compare full URLs
      const urlCompare = a.url.localeCompare(b.url);
      if (urlCompare !== 0) return urlCompare;

      // Finally compare titles
      return a.title.localeCompare(b.title);
    });

    // Move all tabs to their new positions
    const movements = tabsWithSortInfo.map((tab, newIndex) => 
      browser.tabs.move(tab.id, { index: newIndex })
    );

    // Wait for all tab movements to complete
    await Promise.all(movements);

  } catch (error) {
    console.error('Error sorting tabs:', error);
  }
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

// Helper function to extract domain from URL
function extractDomain(url) {
  if (!url) return 'zzz_empty';
  if (url.startsWith('about:')) return `0_${url}`;
  if (url.startsWith('chrome:')) return `0_${url}`;
  if (url.startsWith('firefox:')) return `0_${url}`;
  if (url.startsWith('view-source:')) return `0_${url}`;

  try {
    const urlObject = new URL(url);
    // Get main domain without subdomain
    const parts = urlObject.hostname.split('.');
    const domain = parts.length >= 2 ? parts.slice(-2).join('.') : urlObject.hostname;
    return domain;
  } catch {
    return `0_${url}`;
  }
}

// Listen for when a new tab is created and has finished loading.
// This is more efficient than sorting on every little change.
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // The 'status' property tells us if the tab is fully loaded.
  // We only want to sort when it's "complete."
  if (changeInfo.status === 'complete' || changeInfo.url) {
    sortTabs();
  }
});

// Also sort when a tab is created
browser.tabs.onCreated.addListener(() => {
  sortTabs();
});

// Also sort when a tab is removed
browser.tabs.onRemoved.addListener(() => {
  sortTabs();
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