"""Writes the rebuilt service-worker.js for LinkedIn Post Commenter."""
import pathlib

SW = pathlib.Path(__file__).parent.parent / "background" / "service-worker.js"

content = r"""/**
 * service-worker.js -- Tab queue manager for LinkedIn Post Commenter.
 *
 * Responsibilities:
 *   1. Receive START_QUEUE from popup
 *   2. Open each search URL in a new tab, one at a time
 *   3. Wait for content script PAGE_DONE message
 *   4. Close the finished tab and open the next
 *   5. Write all progress to commenterState in chrome.storage.local (popup polls it)
 */

const SEARCH_URLS = [
  'https://www.linkedin.com/search/results/content/?keywords=project%20manager%20latam&origin=SWITCH_SEARCH_VERTICAL',
  'https://www.linkedin.com/search/results/content/?keywords=%22delivery%20manager%22%20latam&origin=GLOBAL_SEARCH_HEADER',
  'https://www.linkedin.com/search/results/content/?keywords=%22delivery%20project%22%20latam&origin=GLOBAL_SEARCH_HEADER',
  'https://www.linkedin.com/search/results/content/?keywords=%22nearshore%22%20latam&origin=GLOBAL_SEARCH_HEADER',
  'https://www.linkedin.com/search/results/content/?keywords=%22offshore%22%20latam&origin=GLOBAL_SEARCH_HEADER',
  'https://www.linkedin.com/search/results/content/?keywords=%22digital%20products%22%20latam&origin=GLOBAL_SEARCH_HEADER',
  'https://www.linkedin.com/search/results/content/?keywords=%22digital%20project%22%20latam&origin=GLOBAL_SEARCH_HEADER',
  'https://www.linkedin.com/search/results/content/?keywords=%22agile%22%20latam&origin=GLOBAL_SEARCH_HEADER',
  'https://www.linkedin.com/search/results/content/?keywords=%22scrum%22%20latam&origin=GLOBAL_SEARCH_HEADER',
  'https://www.linkedin.com/search/results/content/?keywords=project%20manager%20latam%20hiring&origin=GLOBAL_SEARCH_HEADER',
];

// -- Message listener ---------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_QUEUE') {
    handleStartQueue()
      .then(() => sendResponse({ ok: true }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (message.action === 'PAGE_DONE') {
    handlePageDone(message, sender.tab && sender.tab.id)
      .then(() => sendResponse({ ok: true }))
      .catch(e => { console.error('[SW] PAGE_DONE error:', e); sendResponse({ ok: false }); });
    return true;
  }

  if (message.action === 'LOG') {
    appendLog(message.text).catch(console.error);
    sendResponse({ ok: true });
    return true;
  }
});

// -- Queue management ---------------------------------------------------------

async function handleStartQueue() {
  const state = {
    running: true,
    queueIndex: 0,
    totalUrls: SEARCH_URLS.length,
    totalCommented: 0,
    totalLiked: 0,
    totalSkipped: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    log: [],
  };
  await chrome.storage.local.set({ commenterState: state, commenterRunning: true });
  await appendLog('Queue started -- ' + SEARCH_URLS.length + ' URLs to process');
  await openUrl(0);
}

async function handlePageDone(message, tabId) {
  const data = await chrome.storage.local.get('commenterState');
  const state = data.commenterState || {};
  state.totalCommented = (state.totalCommented || 0) + (message.commented || 0);
  state.totalLiked     = (state.totalLiked     || 0) + (message.liked     || 0);
  state.totalSkipped   = (state.totalSkipped   || 0) + (message.skipped   || 0);
  const nextIndex = (state.queueIndex || 0) + 1;
  state.queueIndex = nextIndex;
  await chrome.storage.local.set({ commenterState: state });

  await appendLog(
    'URL ' + nextIndex + '/' + SEARCH_URLS.length + ' done' +
    ' -- commented: ' + message.commented +
    ', liked: ' + message.liked +
    ', skipped: ' + message.skipped
  );

  if (tabId) {
    try { await chrome.tabs.remove(tabId); } catch (_) {}
  }

  await openUrl(nextIndex);
}

async function openUrl(index) {
  if (index >= SEARCH_URLS.length) {
    const data = await chrome.storage.local.get('commenterState');
    const state = data.commenterState || {};
    state.running    = false;
    state.finishedAt = new Date().toISOString();
    await chrome.storage.local.set({ commenterState: state, commenterRunning: false });
    await appendLog('All ' + SEARCH_URLS.length + ' URLs processed. Session complete.');
    return;
  }

  const url   = SEARCH_URLS[index];
  const label = decodeURIComponent(new URL(url).searchParams.get('keywords') || url);
  await appendLog('Opening [' + (index + 1) + '/' + SEARCH_URLS.length + ']: ' + label);
  await chrome.tabs.create({ url: url, active: true });
}

// -- Shared log writer --------------------------------------------------------

async function appendLog(text) {
  try {
    const data = await chrome.storage.local.get('commenterState');
    const state = data.commenterState || {};
    if (!Array.isArray(state.log)) state.log = [];
    state.log.push({ ts: new Date().toISOString().slice(11, 19), text: text });
    state.log = state.log.slice(-300);
    await chrome.storage.local.set({ commenterState: state });
  } catch (e) {
    console.warn('[SW] appendLog failed:', e);
  }
}
"""

SW.write_text(content, encoding='utf-8')
print("service-worker.js written:", len(content.splitlines()), "lines")
