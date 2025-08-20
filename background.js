/*
 * Zen Tab Sorter (MV2)
 * - Autosort by domain (addons.mozilla.org → mozilla) and by title.
 * - Close duplicate URLs (ignoring #hash).
 * - Alt+S — manual sorting.
 * - Do not touch pinned tabs or (if detectable) Essential Tabs.
 * - Place tabs correctly among normal tabs, without jumping over Zen's special sections.
 */

const b = typeof browser !== 'undefined' ? browser : chrome;

// --- UTILITIES -------------------------------------------------------------

// Mini-PSL: list of common multi-part suffixes to extract eTLD+1 without heavy libs.
// For perfect accuracy, can be replaced by psl/tldts, but this covers most cases.
const MULTIPART_SUFFIXES = new Set([
  // UK
  'co.uk','org.uk','ac.uk','gov.uk','ltd.uk','plc.uk','me.uk','net.uk',
  // AU
  'com.au','net.au','org.au','edu.au','gov.au',
  // JP
  'co.jp','or.jp','ne.jp','ac.jp','go.jp',
  // BR
  'com.br','net.br','org.br','gov.br','edu.br',
  // Others commonly seen
  'github.io','blogspot.com'
]);

function getRegistrableDomain(hostname) {
  const labels = (hostname || '').toLowerCase().split('.').filter(Boolean);
  if (labels.length <= 1) return hostname || '';
  const last2 = labels.slice(-2).join('.');
  const last3 = labels.slice(-3).join('.');
  if (MULTIPART_SUFFIXES.has(last2) && labels.length >= 3) {
    return labels.slice(-3).join('.');
  }
  if (MULTIPART_SUFFIXES.has(last3) && labels.length >= 4) {
    return labels.slice(-4).join('.');
  }
  return last2;
}

function getKeyDomain(urlStr) {
  try {
    const u = new URL(urlStr);
    const reg = getRegistrableDomain(u.hostname); // e.g. mozilla.org
    const parts = reg.split('.');
    return (parts.length >= 2 ? parts[0] : reg) || '';
  } catch { return ''; }
}

function canonicalURL(urlStr) {
  try {
    const u = new URL(urlStr);
    u.hash = '';
    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    return u.toString();
  } catch { return urlStr; }
}

// Zen Essential tabs
function isEssential(tab) {
  if (tab && (tab.isEssential || tab.isZenEssential || tab.zenEssential)) return true;
  if (tab && tab.extData && (tab.extData.isEssential || tab.extData.category === 'essential')) return true;
  return false;
}

// Find the range of normal tabs and sort only within it, so we don’t disturb pinned/essential tabs.
async function sortCurrentWindow() {
  const [win] = await b.windows.getAll({ populate: true, windowTypes: ['normal'] });
  if (!win || !win.tabs) return;

  const tabs = win.tabs;
  const movable = tabs.filter(t => !t.pinned && !isEssential(t));
  if (movable.length <= 1) return;

  const minIdx = Math.min(...movable.map(t => t.index));
  const maxIdx = Math.max(...movable.map(t => t.index));

  // 1) Remove duplicates
  const seen = new Map(); // key -> tabId
  for (const t of movable) {
    const key = canonicalURL(t.url || t.pendingUrl || '');
    if (!key) continue;
    if (seen.has(key)) {
      try { await b.tabs.remove(t.id); } catch {}
    } else {
      seen.set(key, t.id);
    }
  }

  // Refresh tabs after duplicates were closed
  const fresh = (await b.tabs.query({ windowId: win.id })).filter(t => !t.pinned && !isEssential(t) && t.index >= minIdx && t.index <= maxIdx);
  if (fresh.length <= 1) return;

  // 2) Sort
  const sorted = [...fresh].sort((a, bTab) => {
    const da = getKeyDomain(a.url || a.pendingUrl || '');
    const db = getKeyDomain(bTab.url || bTab.pendingUrl || '');
    const c1 = da.localeCompare(db, 'en', { sensitivity: 'base' });
    if (c1 !== 0) return c1; // A..Z
    const ta = (a.title || '').trim().toLowerCase();
    const tb = (bTab.title || '').trim().toLowerCase();
    return ta.localeCompare(tb, 'en', { sensitivity: 'base' });
  });

  // 3) Move tabs into consecutive positions
  let target = minIdx;
  for (const t of sorted) {
    if (t.index !== target) {
      try { await b.tabs.move(t.id, { index: target }); } catch {}
    }
    target++;
  }
}

// Debounce to avoid firing too often on rapid events
const timers = new Map();
function scheduleSort(windowId, delay = 250) {
  if (timers.has(windowId)) {
    clearTimeout(timers.get(windowId));
  }
  timers.set(windowId, setTimeout(() => {
    timers.delete(windowId);
    sortCurrentWindow().catch(() => {});
  }, delay));
}

// --- EVENT HANDLERS --------------------------------------------------------

// Autosort: when new tab is created / URL changes / page load completes
b.tabs.onCreated.addListener(tab => {
  if (tab && tab.windowId != null) scheduleSort(tab.windowId, 300);
});

b.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if ((changeInfo.url || changeInfo.status === 'complete') && tab && tab.windowId != null) {
    scheduleSort(tab.windowId, 200);
  }
});

b.tabs.onActivated.addListener(activeInfo => {
  if (activeInfo && activeInfo.windowId != null) scheduleSort(activeInfo.windowId, 400);
});

// Hotkey Alt+S — manual sort
b.commands.onCommand.addListener(cmd => {
  if (cmd === 'sort-tabs') {
    sortCurrentWindow();
  }
});

// Initial run when extension starts
(async () => {
  try {
    const win = await b.windows.getCurrent();
    if (win && win.id != null) scheduleSort(win.id, 200);
  } catch {}
})();