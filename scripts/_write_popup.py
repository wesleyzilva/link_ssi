"""Writes popup.html, popup.css and popup.js for LinkedIn Post Commenter."""
import pathlib

BASE = pathlib.Path(__file__).parent.parent / "popup"

# -- popup.html ---------------------------------------------------------------
HTML = r"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Post Commenter</title>
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <header>
      <h1>Post Commenter</h1>
      <span id="status-badge" class="badge">Idle</span>
    </header>

    <section class="totals" id="totals" style="display:none">
      <div class="total-item">
        <span class="total-value" id="t-commented">0</span>
        <span class="total-label">Commented</span>
      </div>
      <div class="total-item">
        <span class="total-value" id="t-liked">0</span>
        <span class="total-label">Liked</span>
      </div>
      <div class="total-item">
        <span class="total-value" id="t-skipped">0</span>
        <span class="total-label">Skipped</span>
      </div>
      <div class="total-item">
        <span class="total-value" id="t-progress">0/10</span>
        <span class="total-label">Progress</span>
      </div>
    </section>

    <div class="btn-row">
      <button id="btn-start" class="btn btn--primary">&#9654; Start</button>
    </div>

    <section class="live-log">
      <div class="live-log-header">
        <h2>Log</h2>
        <button id="btn-clear-log" class="btn btn--ghost">Clear</button>
      </div>
      <div id="log-entries" class="log-entries">
        <p class="log-empty">Press Start to begin.</p>
      </div>
    </section>

    <script src="popup.js"></script>
  </body>
</html>
"""

# -- popup.css ----------------------------------------------------------------
CSS = r"""/* popup.css -- LinkedIn Post Commenter */

:root {
  --color-bg:      #0a0a0a;
  --color-surface: #1a1a1a;
  --color-border:  #2a2a2a;
  --color-text:    #e8e8e8;
  --color-muted:   #888;
  --color-accent:  #0077b5;
  --color-success: #22c55e;
  --color-warn:    #f59e0b;
  --radius: 8px;
  --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font);
  font-size: 13px;
  background: var(--color-bg);
  color: var(--color-text);
  width: 320px;
  padding: 16px;
}

/* -- Header ---------------------------------------------------------------- */
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

h1 {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-accent);
}

.badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-muted);
}

.badge.running { background: #1a3a1a; border-color: var(--color-success); color: var(--color-success); }
.badge.done    { background: #1a2a3a; border-color: var(--color-accent);  color: var(--color-accent); }

/* -- Totals ---------------------------------------------------------------- */
.totals {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.total-item {
  flex: 1;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 8px 4px;
  text-align: center;
}

.total-value {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-accent);
}

.total-label {
  font-size: 10px;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* -- Start button ---------------------------------------------------------- */
.btn-row { margin-bottom: 14px; }

.btn {
  cursor: pointer;
  border-radius: 6px;
  border: none;
  font-size: 12px;
  font-family: var(--font);
  padding: 7px 14px;
  transition: opacity .15s;
}
.btn:hover { opacity: .85; }
.btn:disabled { opacity: .4; cursor: not-allowed; }

.btn--primary { background: var(--color-accent); color: #fff; width: 100%; }
.btn--ghost   { background: transparent; color: var(--color-muted); border: 1px solid var(--color-border); }

/* -- Log ------------------------------------------------------------------- */
.live-log { margin-top: 4px; }

.live-log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

h2 { font-size: 11px; font-weight: 600; color: var(--color-muted); text-transform: uppercase; letter-spacing: .5px; }

.log-entries {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 8px;
  height: 220px;
  overflow-y: auto;
  font-size: 11px;
  line-height: 1.5;
}

.log-empty { color: var(--color-muted); font-style: italic; }

.log-line { color: var(--color-text); margin-bottom: 2px; }
.log-line .ts { color: var(--color-muted); margin-right: 6px; }
"""

# -- popup.js -----------------------------------------------------------------
JS = r"""/**
 * popup.js -- LinkedIn Post Commenter popup controller.
 *
 * Sends START_QUEUE to service worker when Start is clicked.
 * Polls chrome.storage.local every 2s to update the live log and totals.
 */

const btnStart  = document.getElementById('btn-start');
const btnClear  = document.getElementById('btn-clear-log');
const badge     = document.getElementById('status-badge');
const logEl     = document.getElementById('log-entries');
const totalsEl  = document.getElementById('totals');
const tComment  = document.getElementById('t-commented');
const tLiked    = document.getElementById('t-liked');
const tSkipped  = document.getElementById('t-skipped');
const tProgress = document.getElementById('t-progress');

let lastLogLength = 0;
let pollTimer = null;

// -- Start button ------------------------------------------------------------

btnStart.addEventListener('click', async () => {
  btnStart.disabled = true;
  badge.textContent = 'Starting...';
  badge.className = 'badge running';

  try {
    const resp = await chrome.runtime.sendMessage({ action: 'START_QUEUE' });
    if (!resp || !resp.ok) throw new Error(resp && resp.error ? resp.error : 'Failed to start');
    startPolling();
  } catch (e) {
    badge.textContent = 'Error: ' + e.message;
    badge.className = 'badge';
    btnStart.disabled = false;
  }
});

// -- Clear log button --------------------------------------------------------

btnClear.addEventListener('click', async () => {
  const data = await chrome.storage.local.get('commenterState');
  const state = data.commenterState || {};
  state.log = [];
  await chrome.storage.local.set({ commenterState: state });
  logEl.innerHTML = '<p class="log-empty">Log cleared.</p>';
  lastLogLength = 0;
});

// -- Polling -----------------------------------------------------------------

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(poll, 2000);
  poll();
}

async function poll() {
  const data  = await chrome.storage.local.get('commenterState');
  const state = data.commenterState;
  if (!state) return;

  // Update badge
  if (state.running) {
    badge.textContent = 'Running ' + (state.queueIndex || 0) + '/' + (state.totalUrls || 10);
    badge.className = 'badge running';
    btnStart.disabled = true;
  } else if (state.finishedAt) {
    badge.textContent = 'Done';
    badge.className = 'badge done';
    btnStart.disabled = false;
    clearInterval(pollTimer);
    pollTimer = null;
  }

  // Show totals
  totalsEl.style.display = 'flex';
  tComment.textContent  = state.totalCommented || 0;
  tLiked.textContent    = state.totalLiked     || 0;
  tSkipped.textContent  = state.totalSkipped   || 0;
  tProgress.textContent = (state.queueIndex || 0) + '/' + (state.totalUrls || 10);

  // Append new log lines
  const entries = Array.isArray(state.log) ? state.log : [];
  if (entries.length !== lastLogLength) {
    const newEntries = entries.slice(lastLogLength);
    if (lastLogLength === 0) logEl.innerHTML = '';
    for (const entry of newEntries) {
      const div = document.createElement('div');
      div.className = 'log-line';
      div.innerHTML = '<span class="ts">' + escHtml(entry.ts) + '</span>' + escHtml(entry.text);
      logEl.appendChild(div);
    }
    lastLogLength = entries.length;
    logEl.scrollTop = logEl.scrollHeight;
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// -- On open: check if already running ---------------------------------------

(async function onOpen() {
  const data  = await chrome.storage.local.get('commenterState');
  const state = data.commenterState;
  if (!state) return;

  if (state.running) {
    btnStart.disabled = true;
    startPolling();
  } else if (state.finishedAt) {
    badge.textContent = 'Done';
    badge.className = 'badge done';
  }

  if (state.log && state.log.length) {
    logEl.innerHTML = '';
    for (const entry of state.log) {
      const div = document.createElement('div');
      div.className = 'log-line';
      div.innerHTML = '<span class="ts">' + escHtml(entry.ts) + '</span>' + escHtml(entry.text);
      logEl.appendChild(div);
    }
    lastLogLength = state.log.length;
    logEl.scrollTop = logEl.scrollHeight;
    totalsEl.style.display = 'flex';
    tComment.textContent  = state.totalCommented || 0;
    tLiked.textContent    = state.totalLiked     || 0;
    tSkipped.textContent  = state.totalSkipped   || 0;
    tProgress.textContent = (state.queueIndex || 0) + '/' + (state.totalUrls || 10);
  }
})();
"""

(BASE / "popup.html").write_text(HTML, encoding="utf-8")
(BASE / "popup.css").write_text(CSS, encoding="utf-8")
(BASE / "popup.js").write_text(JS, encoding="utf-8")

print("popup.html:", len(HTML.splitlines()), "lines")
print("popup.css :", len(CSS.splitlines()), "lines")
print("popup.js  :", len(JS.splitlines()), "lines")
