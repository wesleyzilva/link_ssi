/**
 * popup.js — Popup UI controller for SSI Optimizer
 *
 * Reads activity state from chrome.storage.local and renders it.
 * Also queries the next scheduled alarm from the Service Worker.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Each render function is isolated so one failure never blocks the rest.
  // wireButtons() MUST always run — broken buttons are worse than broken data.
  const safeRun = (fn) => fn().catch(err => console.warn('[Popup]', err));
  await safeRun(renderSSIScores);
  await safeRun(renderDayCycle);
  await safeRun(renderActivityLog);
  await safeRun(renderAnalytics);
  await safeRun(renderNextAlarm);
  await safeRun(renderIntervalSchedule);
  await safeRun(renderLiveLog);
  await safeRun(renderPostQueue);
  wireButtons();
});

// Auto-refresh when storage changes (e.g. a task just completed)
chrome.storage.onChanged.addListener((changes) => {
  if (changes.specificPostQueue) renderPostQueue();
  if (changes.activityLog)      renderLiveLog();
  if (changes.lastSSI)          renderSSIScores();
  if (changes.dayCycleIndex)    renderDayCycle();
  if (changes.acceptedConnections || changes.lastConnectionTracking || changes.lastFollowUp || changes.ssiScores) {
    renderAnalytics();
  }
  if (changes.lastProspecting || changes.lastEngagement || changes.lastRelationshipBuild || changes.lastUsedExpression) {
    renderActivityLog();
  }
});

// ─── SSI Scores ───────────────────────────────────────────────────────────────

async function renderSSIScores() {
  const { lastSSI } = await chrome.storage.local.get('lastSSI');
  const badge = document.getElementById('status-badge');

  if (!lastSSI) {
    badge.textContent = 'No data';
    badge.className = 'badge badge--neutral';
    return;
  }

  document.getElementById('score-total').textContent = lastSSI.error ? '?' : (lastSSI.total ?? '–');
  document.getElementById('score-brand').textContent = lastSSI.error ? '?' : (lastSSI.brand ?? '–');
  document.getElementById('score-people').textContent = lastSSI.error ? '?' : (lastSSI.people ?? '–');
  document.getElementById('score-insights').textContent = lastSSI.error ? '?' : (lastSSI.insights ?? '–');
  document.getElementById('score-relationships').textContent = lastSSI.error ? '?' : (lastSSI.relationships ?? '–');

  badge.textContent = lastSSI.error ? 'Selector error — check DevTools' : formatRelativeTime(lastSSI.capturedAt);
  badge.className = lastSSI.error ? 'badge badge--error' : 'badge badge--success';
}

// ─── Activity log ─────────────────────────────────────────────────────────────

async function renderDayCycle() {
  const DAILY_CAPS = [15, 14, 13, 12, 11, 10, 9];
  const { dayCycleIndex = 0 } = await chrome.storage.local.get('dayCycleIndex');
  const dayNum = (dayCycleIndex % DAILY_CAPS.length) + 1;
  const cap = DAILY_CAPS[dayCycleIndex % DAILY_CAPS.length];
  document.getElementById('log-day-cycle').textContent = `Day ${dayNum}/7 — cap: ${cap} connections`;
}

async function renderActivityLog() {
  const data = await chrome.storage.local.get([
    'lastSSI',
    'lastProspecting',
    'lastEngagement',
    'lastRelationshipBuild',
    'lastUsedExpression',
    'exprQueueIndex',
  ]);

  if (data.lastSSI?.capturedAt) {
    document.getElementById('log-ssi-time').textContent =
      formatDateTimeShort(data.lastSSI.capturedAt);
  }

  if (data.lastProspecting) {
    document.getElementById('log-connections').textContent = data.lastProspecting.sent ?? '–';
  }

  if (data.lastEngagement) {
    document.getElementById('log-likes').textContent = data.lastEngagement.likes ?? '–';
    document.getElementById('log-comments').textContent = data.lastEngagement.comments ?? '–';
  }

  if (data.lastRelationshipBuild) {
    document.getElementById('log-relationships').textContent =
      data.lastRelationshipBuild.touched ?? '–';
  }

  const exprEl = document.getElementById('log-last-expr');
  if (data.lastUsedExpression) {
    const { expr, index } = data.lastUsedExpression;
    const total = 15; // CONTENT_SEARCH_EXPRESSIONS.length
    const nextIdx = (index + 1) % total;
    exprEl.textContent = `#${index + 1}/${total}: ${expr}`;
    exprEl.title = `Next: #${nextIdx + 1}/${total}`;
  }
}

// ─── Analytics ────────────────────────────────────────────────────────────────

async function renderAnalytics() {
  const data = await chrome.storage.local.get([
    'connections', 'acceptedConnections', 'ssiScores', 'lastSSI',
  ]);

  const connections = data.connections || [];
  const accepted = data.acceptedConnections || [];
  const totalSent = connections.length;
  const totalAccepted = accepted.length;
  const rate = totalSent > 0 ? Math.round((totalAccepted / totalSent) * 100) : 0;
  const followUpSent = accepted.filter(a => a.followUpSent).length;
  const followUpPending = accepted.filter(a => !a.followUpSent).length;

  document.getElementById('analytics-acceptance').textContent =
    totalSent > 0 ? `${rate}%` : 'no data';
  document.getElementById('analytics-accepted-sent').textContent =
    `${totalAccepted} / ${totalSent}`;
  document.getElementById('analytics-followups').textContent = followUpSent;
  document.getElementById('analytics-followup-pending').textContent = followUpPending;

  // Weakest SSI pillar from last score
  const lastSSI = data.lastSSI;
  if (lastSSI && !lastSSI.error) {
    const pillars = { Brand: lastSSI.brand, People: lastSSI.people, Insights: lastSSI.insights, Relationships: lastSSI.relationships };
    const weakest = Object.entries(pillars)
      .filter(([, v]) => typeof v === 'number')
      .sort((a, b) => a[1] - b[1])[0];
    document.getElementById('analytics-weakest').textContent =
      weakest ? `${weakest[0]} (${weakest[1]})` : '–';
  }

  // SSI 7-day trend: last 7 daily totals as arrow sequence
  const scores = (data.ssiScores || []).slice(-7);
  if (scores.length >= 2) {
    const trend = scores.map((s, i) => {
      if (i === 0) return String(s.total ?? '?');
      const prev = scores[i - 1].total ?? 0;
      const cur  = s.total ?? 0;
      const arrow = cur > prev ? '↑' : cur < prev ? '↓' : '→';
      return `${arrow}${cur}`;
    }).join(' ');
    document.getElementById('analytics-ssi-trend').textContent = trend;
  } else if (scores.length === 1) {
    document.getElementById('analytics-ssi-trend').textContent = String(scores[0].total ?? '–');
  } else {
    document.getElementById('analytics-ssi-trend').textContent = 'no data';
  }
}

// ─── Specific-post queue ──────────────────────────────────────────────────────

async function renderPostQueue() {
  const { specificPostQueue = [] } = await chrome.storage.local.get('specificPostQueue');
  const pending = specificPostQueue.filter(e => !e.done);

  const countEl = document.getElementById('queue-count');
  countEl.textContent = String(pending.length);
  countEl.className = pending.length > 0 ? 'badge badge--success' : 'badge badge--neutral';

  const listEl = document.getElementById('queue-list');
  if (!pending.length) {
    listEl.innerHTML = '<li class="queue-empty">Queue is empty.</li>';
    return;
  }
  listEl.innerHTML = pending.map(e => {
    const shortUrl = e.url.replace('https://www.linkedin.com/', '…/').slice(0, 60);
    return `<li class="queue-item" title="${escapeHtml(e.url)}">${escapeHtml(shortUrl)}</li>`;
  }).join('');
}

// ─── Next alarm ───────────────────────────────────────────────────────────────
async function renderNextAlarm() {
  const el = document.getElementById('next-alarm');
  const alarms = await chrome.alarms.getAll();

  if (!alarms.length) {
    el.innerHTML =
      'No alarms found. <button id="btn-fix-alarms" style="margin-left:6px;padding:2px 8px;font-size:11px;cursor:pointer;">📅 Fix</button>';

    const fixAlarms = async () => {
      try { await chrome.runtime.sendMessage({ action: 'SCHEDULE_ALARMS' }); } catch { /* ok */ }
      // Give the service worker 800 ms to register the alarms before re-reading
      await new Promise(r => setTimeout(r, 800));
      await renderNextAlarm();
    };

    document.getElementById('btn-fix-alarms')?.addEventListener('click', fixAlarms);
    // Auto-attempt once in background without blocking UI
    fixAlarms();
    return;
  }

  const next = alarms.reduce((prev, curr) =>
    curr.scheduledTime < prev.scheduledTime ? curr : prev
  );

  const brtLabel = formatDateTimeShort(new Date(next.scheduledTime).toISOString());
  const windowLabel = next.name.includes('morning') ? '11:00 BRT — US/EU' : '21:00 BRT — APAC';
  el.textContent = `${windowLabel} · ${brtLabel}`;
}

async function renderIntervalSchedule() {
  // Load the saved interval from storage
  const { intervalMinutes = 0 } = await chrome.storage.local.get('intervalMinutes');
  const select = document.getElementById('select-interval');
  if (!select) return;

  // Pre-select the current value (or Off if none)
  const opt = select.querySelector(`option[value="${intervalMinutes}"]`);
  if (opt) opt.selected = true;

  // Render status line
  const status = document.getElementById('interval-status');
  if (intervalMinutes > 0) {
    let resp = null;
    try { resp = await chrome.runtime.sendMessage({ action: 'GET_INTERVAL' }); } catch { /* ok */ }
    const alarm = resp?.alarm;
    if (alarm) {
      const nextRun = formatDateTimeShort(new Date(alarm.scheduledTime).toISOString());
      status.textContent = `⏱ Running every ${intervalMinutes} min · next: ${nextRun}`;
      status.className = 'interval-status interval-status--on';
    } else {
      status.textContent = `Saved: every ${intervalMinutes} min (alarm not found — will restore on next reload)`;
      status.className = 'interval-status';
    }
  } else {
    status.textContent = 'No repeat interval set — runs at 11:00 and 21:00 BRT only.';
    status.className = 'interval-status';
  }
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatRelativeTime(isoString) {
  if (!isoString) return '–';
  const diff = Date.now() - new Date(isoString).getTime();
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

function formatDateTimeShort(isoString) {
  if (!isoString) return '–';
  return new Date(isoString).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Live log ─────────────────────────────────────────────────────────────────

async function renderLiveLog() {
  const { activityLog = [] } = await chrome.storage.local.get('activityLog');
  const container = document.getElementById('log-entries');

  if (!activityLog.length) {
    container.innerHTML = '<p class="log-empty">No activity recorded yet.</p>';
    return;
  }

  // Show most recent entries first (up to 30)
  const entries = [...activityLog].reverse().slice(0, 30);
  container.innerHTML = entries.map((e) => {
    const time = formatDateTimeShort(e.ts);
    const levelClass = `log-entry--${e.level ?? 'info'}`;
    return `<div class="log-entry ${levelClass}">
      <span class="log-time">${time}</span>
      <span class="log-msg">${escapeHtml(e.msg)}</span>
    </div>`;
  }).join('');
}

// ─── Button wiring ────────────────────────────────────────────────────────────

function wireButtons() {
  const runNow = document.getElementById('btn-run-now');
  runNow.addEventListener('click', async () => {
    runNow.disabled = true;
    runNow.textContent = 'Running…';
    try {
      await chrome.runtime.sendMessage({ action: 'RUN_NOW' });
    } catch {
      // Service worker may restart briefly; that's OK
    }
    // Re-enable after 5 s; the log will update via storage.onChanged
    setTimeout(() => {
      runNow.disabled = false;
      runNow.textContent = '▶ Run Now';
    }, 5000);
  });

  document.querySelectorAll('.btn--task').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const task = btn.dataset.task;
      btn.disabled = true;
      try {
        await chrome.runtime.sendMessage({ action: 'RUN_TASK', task });
      } catch {
        // ignore
      }
      setTimeout(() => { btn.disabled = false; }, 5000);
    });
  });

  document.getElementById('btn-clear-log').addEventListener('click', async () => {
    await chrome.storage.local.set({ activityLog: [] });
    renderLiveLog();
  });

  document.getElementById('btn-comment-post').addEventListener('click', async () => {
    const input  = document.getElementById('input-post-url');
    const status = document.getElementById('comment-post-status');
    const postUrl = (input.value || '').trim();

    if (!postUrl.startsWith('https://www.linkedin.com/')) {
      status.textContent = '⚠ Enter a valid LinkedIn post URL.';
      status.className = 'comment-post-status comment-post-status--error';
      return;
    }

    const btn = document.getElementById('btn-comment-post');
    btn.disabled = true;
    status.textContent = '⏳ Opening post and commenting…';
    status.className = 'comment-post-status';

    try {
      const resp = await chrome.runtime.sendMessage({ action: 'COMMENT_POST', postUrl });
      if (resp?.done) {
        status.textContent = '✓ Comment sent successfully.';
        status.className = 'comment-post-status comment-post-status--success';
        input.value = '';
      } else {
        status.textContent = `⚠ ${resp?.error || 'Comment may not have been sent — check Activity Log.'}`;
        status.className = 'comment-post-status comment-post-status--error';
      }
    } catch (e) {
      status.textContent = '⚠ Could not reach service worker — try again.';
      status.className = 'comment-post-status comment-post-status--error';
    }
    setTimeout(() => { btn.disabled = false; }, 8000);
  });

  document.getElementById('btn-queue-post').addEventListener('click', async () => {
    const input  = document.getElementById('input-post-url');
    const status = document.getElementById('comment-post-status');
    const postUrl = (input.value || '').trim();

    if (!postUrl.startsWith('https://www.linkedin.com/')) {
      status.textContent = '⚠ Enter a valid LinkedIn post URL.';
      status.className = 'comment-post-status comment-post-status--error';
      return;
    }

    const btn = document.getElementById('btn-queue-post');
    btn.disabled = true;
    try {
      const resp = await chrome.runtime.sendMessage({ action: 'QUEUE_POST', postUrl });
      if (resp?.queued) {
        status.textContent = `✓ Queued! ${resp.total} post(s) pending for next run.`;
        status.className = 'comment-post-status comment-post-status--success';
        input.value = '';
        await renderPostQueue();
      } else {
        status.textContent = `⚠ ${resp?.reason || resp?.error || 'Could not queue post.'}`;
        status.className = 'comment-post-status comment-post-status--error';
      }
    } catch (e) {
      status.textContent = '⚠ Could not reach service worker — try again.';
      status.className = 'comment-post-status comment-post-status--error';
    }
    setTimeout(() => { btn.disabled = false; }, 3000);
  });

  document.getElementById('btn-clear-queue').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'CLEAR_POST_QUEUE' });
    await renderPostQueue();
  });

  document.getElementById('btn-run-queue-now').addEventListener('click', async () => {
    const btn = document.getElementById('btn-run-queue-now');
    btn.disabled = true;
    btn.textContent = 'Running…';
    try {
      await chrome.runtime.sendMessage({ action: 'RUN_TASK', task: 'post-queue' });
    } catch { /* ignore */ }
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = '▶ Run queue now';
    }, 10000);
  });

  document.getElementById('btn-save-interval').addEventListener('click', async () => {
    const select  = document.getElementById('select-interval');
    const minutes = parseInt(select.value, 10);
    const btn     = document.getElementById('btn-save-interval');
    btn.disabled  = true;
    try {
      await chrome.runtime.sendMessage({ action: 'SCHEDULE_INTERVAL', minutes });
    } catch { /* service worker may be waking */ }
    // Persist locally even if SW message failed (restoreIntervalAlarm will pick it up)
    if (minutes > 0) {
      await chrome.storage.local.set({ intervalMinutes: minutes });
    } else {
      await chrome.storage.local.remove('intervalMinutes');
    }
    await renderIntervalSchedule();
    btn.disabled = false;
  });

  document.getElementById('open-history').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('history/history.html') });
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
