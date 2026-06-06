import pathlib, textwrap

code = textwrap.dedent(r"""
/**
 * service-worker.js -- Tab queue manager for LinkedIn post URL collection.
 *
 * Opens each search URL one at a time, waits for PAGE_DONE from the content script,
 * accumulates all post URLs (deduped), then opens the next tab.
 * When all pages are done, stores the full list in chrome.storage.local
 * so the popup can download it as a CSV.
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
  'https://www.linkedin.com/search/results/content/?keywords=project%20manager%20latam%20hiring&origin=GLOBAL_SEARCH_HEADER'
];

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'START_QUEUE') {
    handleStartQueue();
  } else if (message.action === 'PAGE_DONE') {
    handlePageDone(message, sender.tab ? sender.tab.id : null);
  } else if (message.action === 'LOG') {
    appendLog(message.text);
  }
  sendResponse({});
  return false;
});

function handleStartQueue() {
  var state = {
    queueIndex: 0,
    total: SEARCH_URLS.length,
    collectedUrls: [],   // [{ postUrl, keywords }]
    log: [],
    running: true,
    done: false
  };
  chrome.storage.local.set({ commenterRunning: true, commenterState: state }, function() {
    appendLog('Queue started — ' + SEARCH_URLS.length + ' search pages to scan.');
    openUrl(0, state);
  });
}

function handlePageDone(message, tabId) {
  chrome.storage.local.get('commenterState', function(data) {
    var state = data.commenterState;
    if (!state) return;

    var existing = new Set(state.collectedUrls.map(function(r) { return r.postUrl; }));
    var newUrls  = (message.urls || []).filter(function(u) { return !existing.has(u); });

    newUrls.forEach(function(u) {
      state.collectedUrls.push({
        postUrl:  u,
        keywords: message.keywords || '',
        collectedAt: new Date().toISOString()
      });
    });

    var nextIndex = state.queueIndex + 1;
    state.queueIndex = nextIndex;

    appendLog(
      'Page ' + nextIndex + '/' + SEARCH_URLS.length + ' done — ' +
      newUrls.length + ' new posts. Total: ' + state.collectedUrls.length
    );

    if (tabId) {
      chrome.tabs.remove(tabId, function() {});
    }

    if (nextIndex >= state.total) {
      state.running = false;
      state.done    = true;
      appendLog(
        'All pages scanned. ' + state.collectedUrls.length +
        ' posts collected. Click "Download CSV" in the popup.'
      );
      chrome.storage.local.set({ commenterRunning: false, commenterState: state });
    } else {
      chrome.storage.local.set({ commenterState: state }, function() {
        openUrl(nextIndex, state);
      });
    }
  });
}

function openUrl(index, state) {
  var label = (index + 1) + '/' + SEARCH_URLS.length;
  appendLog('Opening page ' + label + ': ' + SEARCH_URLS[index].split('keywords=')[1] || '');
  chrome.tabs.create({ url: SEARCH_URLS[index], active: false });
}

function appendLog(text) {
  chrome.storage.local.get('commenterState', function(data) {
    var state = data.commenterState;
    if (!state) return;
    var ts = new Date().toLocaleTimeString();
    state.log = state.log || [];
    state.log.push({ ts: ts, text: text });
    if (state.log.length > 300) state.log = state.log.slice(-300);
    chrome.storage.local.set({ commenterState: state });
  });
}
""").lstrip()

dest = pathlib.Path(r"C:\repositorio\link_ssi\background\service-worker.js")
dest.write_text(code, encoding="utf-8")
print("Written:", dest, f"({len(code)} bytes)")
