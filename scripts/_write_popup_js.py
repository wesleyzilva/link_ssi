import pathlib, textwrap

code = textwrap.dedent(r"""
/**
 * popup.js -- LinkedIn Post Collector popup controller.
 *
 * - Sends START_QUEUE to service worker when "Scan" is clicked.
 * - Polls chrome.storage.local every 2s to update progress and log.
 * - Shows "Download CSV" button when collection is done.
 */

const btnStart    = document.getElementById('btn-start');
const btnDownload = document.getElementById('btn-download');
const btnClear    = document.getElementById('btn-clear-log');
const badge       = document.getElementById('status-badge');
const logEl       = document.getElementById('log-entries');
const totalsEl    = document.getElementById('totals');
const tPosts      = document.getElementById('t-posts');
const tProgress   = document.getElementById('t-progress');

let lastLogLength = 0;
let pollTimer     = null;

// -- Start button ------------------------------------------------------------

btnStart.addEventListener('click', function() {
  btnStart.disabled = true;
  badge.textContent = 'Starting...';
  badge.className   = 'badge running';
  chrome.runtime.sendMessage({ action: 'START_QUEUE' }, function() {
    startPolling();
  });
});

// -- Download CSV button -----------------------------------------------------

btnDownload.addEventListener('click', function() {
  chrome.storage.local.get('commenterState', function(data) {
    var urls = (data.commenterState && data.commenterState.collectedUrls) || [];
    if (urls.length === 0) {
      alert('No posts collected yet.');
      return;
    }

    var lines = ['postUrl,keywords,collectedAt'];
    urls.forEach(function(r) {
      var url        = '"' + (r.postUrl     || '').replace(/"/g, '""') + '"';
      var kw         = '"' + (r.keywords    || '').replace(/"/g, '""') + '"';
      var ts         = '"' + (r.collectedAt || '').replace(/"/g, '""') + '"';
      lines.push(url + ',' + kw + ',' + ts);
    });

    var csv  = lines.join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var href = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = href;
    a.download = 'linkedin_posts_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(href);
  });
});

// -- Clear log button --------------------------------------------------------

btnClear.addEventListener('click', function() {
  chrome.storage.local.get('commenterState', function(data) {
    var state = data.commenterState || {};
    state.log = [];
    chrome.storage.local.set({ commenterState: state });
    logEl.innerHTML = '<p class="log-empty">Log cleared.</p>';
    lastLogLength = 0;
  });
});

// -- Polling -----------------------------------------------------------------

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(poll, 2000);
  poll();
}

function poll() {
  chrome.storage.local.get('commenterState', function(data) {
    var state = data.commenterState;
    if (!state) return;

    var total     = SEARCH_URLS_COUNT;
    var pagesDone = state.queueIndex || 0;
    var postCount = (state.collectedUrls || []).length;

    if (state.running) {
      badge.textContent = 'Scanning ' + pagesDone + '/' + total;
      badge.className   = 'badge running';
      btnStart.disabled = true;
      btnDownload.style.display = 'none';
    } else if (state.done) {
      badge.textContent = 'Done — ' + postCount + ' posts';
      badge.className   = 'badge done';
      btnStart.disabled = false;
      btnDownload.style.display = '';
      clearInterval(pollTimer);
      pollTimer = null;
    }

    totalsEl.style.display = 'flex';
    tPosts.textContent    = postCount;
    tProgress.textContent = pagesDone + '/' + total;

    appendNewLogLines(state.log || []);
  });
}

function appendNewLogLines(entries) {
  if (entries.length === lastLogLength) return;
  var newEntries = entries.slice(lastLogLength);
  if (lastLogLength === 0) logEl.innerHTML = '';
  newEntries.forEach(function(entry) {
    var div = document.createElement('div');
    div.className = 'log-line';
    div.innerHTML =
      '<span class="ts">' + escHtml(entry.ts) + '</span>' + escHtml(entry.text);
    logEl.appendChild(div);
  });
  lastLogLength = entries.length;
  logEl.scrollTop = logEl.scrollHeight;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Matches SEARCH_URLS length in service-worker.js
var SEARCH_URLS_COUNT = 10;

// -- On popup open: restore state --------------------------------------------

(function onOpen() {
  chrome.storage.local.get('commenterState', function(data) {
    var state = data.commenterState;
    if (!state) return;

    if (state.running) {
      btnStart.disabled = true;
      startPolling();
    } else if (state.done) {
      badge.textContent = 'Done — ' + (state.collectedUrls || []).length + ' posts';
      badge.className   = 'badge done';
      btnDownload.style.display = '';
    }

    if (state.log && state.log.length) {
      logEl.innerHTML = '';
      appendNewLogLines(state.log);
      totalsEl.style.display = 'flex';
      tPosts.textContent    = (state.collectedUrls || []).length;
      tProgress.textContent = (state.queueIndex || 0) + '/' + SEARCH_URLS_COUNT;
    }
  });
})();
""").lstrip()

dest = pathlib.Path(r"C:\repositorio\link_ssi\popup\popup.js")
dest.write_text(code, encoding="utf-8")
print("Written:", dest, f"({len(code)} bytes)")
