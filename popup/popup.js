/**
 * popup.js — Popup UI controller for SSI Optimizer
 *
 * Reads activity state from chrome.storage.local and renders it.
 * Also queries the next scheduled alarm from the Service Worker.
 */

document.addEventListener('DOMContentLoaded', async () => {
<<<<<<< HEAD
  // Each render function is isolated so one failure never blocks the rest.
  // wireButtons() MUST always run — broken buttons are worse than broken data.
  const safeRun = (fn) => fn().catch(err => console.warn('[Popup]', err));
  await safeRun(renderSSIScores);
  await safeRun(renderDayCycle);
  await safeRun(renderActivityLog);
  await safeRun(renderAnalytics);
  await safeRun(renderRunCounter);
  await safeRun(renderLiveLog);
  await safeRun(renderPostQueue);
  await safeRun(renderScenarios);
  await safeRun(renderRunNowButton);
=======
  await renderSSIScores();
  await renderDayCycle();
  await renderActivityLog();
  await renderAnalytics();
  await renderNextAlarm();
  await renderLiveLog();
  await renderJobsLeadsSummary();
  await renderCycleStatus();
>>>>>>> d82b910 (feat: novos coletores (job, lead, detail) e refresh popup/manifest)
  wireButtons();
});

// Auto-refresh when storage changes (e.g. a task just completed)
chrome.storage.onChanged.addListener((changes) => {
  const safe = (fn) => fn().catch(err => console.warn('[Popup onChanged]', err));
  if (changes.routineRunning || changes.lastSequenceDoneAt) safe(renderRunNowButton);
  if (changes.pendingRuns || changes.currentRunNumber || changes.totalRunsSession) safe(renderRunCounter);
  if (changes.specificPostQueue) safe(renderPostQueue);
  if (changes.selectedScenarios) safe(renderScenarios);
  if (changes.activityLog)      safe(renderLiveLog);
  if (changes.lastSSI)          { safe(renderSSIScores); safe(renderActivityLog); }
  if (changes.dayCycleIndex)    safe(renderDayCycle);
  if (changes.acceptedConnections || changes.lastConnectionTracking || changes.lastFollowUp || changes.ssiScores) {
    safe(renderAnalytics);
  }
  if (changes.lastProspecting || changes.lastEngagement || changes.lastRelationshipBuild || changes.lastUsedExpression) {
    safe(renderActivityLog);
  }
  if (changes.jobs || changes.leads || changes.lastJobCollect) renderJobsLeadsSummary();
  if (changes.cycleState) renderCycleStatus();
});

async function renderJobsLeadsSummary() {
  const el = document.getElementById('jobs-leads-summary');
  if (!el) return;
  const { jobs = [], leads = [], lastJobCollect } = await chrome.storage.local.get(['jobs', 'leads', 'lastJobCollect']);
  const jobsProcessed = jobs.filter(j => j.processed).length;
  const jobsPending = jobs.length - jobsProcessed;
  const leadsProcessed = leads.filter(l => l.processed).length;
  const leadsPending = leads.length - leadsProcessed;
  const last = lastJobCollect
    ? ` · last: ${new Date(lastJobCollect.runAt).toLocaleTimeString()} (+${lastJobCollect.saved}/${lastJobCollect.seen})`
    : '';
  el.textContent =
    `Jobs: ${jobs.length} (${jobsPending} pending · ${jobsProcessed} processed) · ` +
    `Leads: ${leads.length} (${leadsPending} pending · ${leadsProcessed} done)${last}`;
}

async function renderCycleStatus() {
  const el = document.getElementById('cycle-status');
  if (!el) return;
  let resp;
  try {
    resp = await chrome.runtime.sendMessage({ action: 'CYCLE_STATUS' });
  } catch { return; }
  if (!resp || !resp.state) return;
  const { state, stepNames, stepCount, periodMinutes } = resp;
  el.classList.remove('running', 'stopped');
  if (state.running) {
    const idx = (state.currentStep || 0) % stepCount;
    const next = stepNames[idx] || '?';
    const last = state.lastTickAt ? new Date(state.lastTickAt).toLocaleTimeString() : '—';
    el.classList.add('running');
    el.textContent =
      `▶ Running · cycle #${state.totalCycles || 0} · next step ${idx + 1}/${stepCount}: "${next}" ` +
      `· last tick ${last} · period ${periodMinutes} min`;
  } else if (state.currentStep > 0 || state.totalCycles > 0) {
    const idx = (state.currentStep || 0) % stepCount;
    el.classList.add('stopped');
    el.textContent =
      `⏸ Stopped at step ${idx + 1}/${stepCount} ("${stepNames[idx]}") · ` +
      `cycle #${state.totalCycles || 0} · press Continue to resume`;
  } else {
    el.textContent = 'Idle. Press Start to begin a perpetual cycle.';
  }
}

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
    const total = 27; // CONTENT_SEARCH_EXPRESSIONS.length
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

// ─── Run counter ──────────────────────────────────────────────────────────────

async function renderRunCounter() {
  const { pendingRuns = 0, totalRunsSession = 0, currentRunNumber = 0, runsTarget = 1 } =
    await chrome.storage.local.get(['pendingRuns', 'totalRunsSession', 'currentRunNumber', 'runsTarget']);

  const select = document.getElementById('select-run-count');
  if (select) {
    const opt = select.querySelector(`option[value="${runsTarget}"]`);
    if (opt) opt.selected = true;
  }

  const status = document.getElementById('run-counter-status');
  if (!status) return;

  if (pendingRuns > 0 && totalRunsSession > 0) {
    const done = totalRunsSession - pendingRuns;
    status.textContent = `\u23f3 Run ${currentRunNumber}/${totalRunsSession} in progress\u2026 (${done} done, ${pendingRuns} remaining)`;
    status.className = 'comment-post-status';
  } else if (totalRunsSession > 0 && pendingRuns === 0) {
    status.textContent = `\u2713 All ${totalRunsSession} run(s) complete.`;
    status.className = 'comment-post-status comment-post-status--success';
  } else {
    status.textContent = `Target: ${runsTarget}\u00d7 run(s). Click \u201cSet\u201d then \u201c\u25b6 Run Now\u201d.`;
    status.className = 'comment-post-status';
  }
}

// ─── Scenarios \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/**
 * Fetches the SCENARIOS list from the service worker, reads selectedScenarios
 * from storage, and renders a checkbox list. Each checkbox change persists the
 * new selection immediately so it survives popup close/reopen.
 */
async function renderScenarios() {
  const listEl = document.getElementById('scenario-list');
  if (!listEl) return;

  let scenarios = [];
  try {
    const resp = await chrome.runtime.sendMessage({ action: 'GET_SCENARIOS' });
    scenarios = resp?.scenarios || [];
  } catch { scenarios = []; }

  const { selectedScenarios = ['full-pipeline'] } =
    await chrome.storage.local.get('selectedScenarios');
  const selectedSet = new Set(selectedScenarios);

  if (!scenarios.length) {
    listEl.innerHTML = '<li class="scenario-item-loading">No scenarios available.</li>';
    return;
  }

  listEl.innerHTML = scenarios.map(s => `
    <li class="scenario-item">
      <label class="scenario-label" title="${escapeHtml(s.description)}">
        <input type="checkbox" class="scenario-checkbox"
          data-scenario="${escapeHtml(s.id)}"
          ${selectedSet.has(s.id) ? 'checked' : ''}>
        <span class="scenario-label-text">${escapeHtml(s.label)}</span>
      </label>
    </li>`).join('');

  listEl.querySelectorAll('.scenario-checkbox').forEach(cb => {
    cb.addEventListener('change', async () => {
      const checked = [...listEl.querySelectorAll('.scenario-checkbox:checked')]
        .map(el => el.dataset.scenario);
      const ids = checked.length ? checked : ['full-pipeline'];
      await chrome.storage.local.set({ selectedScenarios: ids });
    });
  });
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

// ─── Run Now button state ─────────────────────────────────────────────────────

async function renderRunNowButton() {
  const { routineRunning, lastSequenceDoneAt } = await chrome.storage.local.get(['routineRunning', 'lastSequenceDoneAt']);

  if (routineRunning) {
    setRunNowState('running');
    return;
  }

  const doneRecently = lastSequenceDoneAt &&
    (Date.now() - new Date(lastSequenceDoneAt).getTime()) < 60_000;

  if (doneRecently) {
    setRunNowState('done');
    const elapsed = Date.now() - new Date(lastSequenceDoneAt).getTime();
    setTimeout(() => setRunNowState('idle'), Math.max(0, 60_000 - elapsed));
    return;
  }

  setRunNowState('idle');
}

function setRunNowState(state) {
  const btn = document.getElementById('btn-run-now');
  btn.classList.remove('btn--danger', 'btn--running', 'btn--done');

  if (state === 'running') {
    btn.classList.add('btn--running');
    btn.textContent = '⏳ Running…';
    btn.disabled = true;
  } else if (state === 'done') {
    btn.classList.add('btn--done');
    btn.textContent = '✓ Done';
    btn.disabled = false;
  } else {
    btn.classList.add('btn--danger');
    btn.textContent = '▶ Run Now';
    btn.disabled = false;
  }
}

// ─── Button wiring ────────────────────────────────────────────────────────────

function wireButtons() {
  const runNow = document.getElementById('btn-run-now');
  runNow.addEventListener('click', async () => {
    const { routineRunning } = await chrome.storage.local.get('routineRunning');
    if (routineRunning) return; // already running — ignore click
    setRunNowState('running');
    try {
      await chrome.runtime.sendMessage({ action: 'RUN_NOW' });
    } catch {
      // Service worker may restart briefly; that's OK — storage flag will sync
    }
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

<<<<<<< HEAD
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
=======
  const dlBtn = document.getElementById('btn-download-csvs');
  if (dlBtn) {
    dlBtn.addEventListener('click', async () => {
      dlBtn.disabled = true;
      const original = dlBtn.textContent;
      dlBtn.textContent = 'Exporting…';
      try {
        await chrome.runtime.sendMessage({ action: 'DOWNLOAD_CSVS' });
      } catch { /* ignore */ }
      setTimeout(() => { dlBtn.disabled = false; dlBtn.textContent = original; }, 3000);
    });
  }

  const customBtn = document.getElementById('btn-job-custom');
  const customInput = document.getElementById('job-keyword-input');
  if (customBtn && customInput) {
    const runCustom = async () => {
      const keyword = customInput.value.trim();
      if (!keyword) { customInput.focus(); return; }
      customBtn.disabled = true;
      try {
        await chrome.runtime.sendMessage({ action: 'RUN_TASK', task: 'job-collector', keyword });
      } catch { /* ignore */ }
      setTimeout(() => { customBtn.disabled = false; }, 5000);
    };
    customBtn.addEventListener('click', runCustom);
    customInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runCustom(); });
  }

  const openTopBtn = document.getElementById('btn-open-top');
  if (openTopBtn) {
    openTopBtn.addEventListener('click', async () => {
      openTopBtn.disabled = true;
      try {
        await chrome.runtime.sendMessage({ action: 'OPEN_TOP_JOBS', cap: 5 });
      } catch { /* ignore */ }
      setTimeout(() => { openTopBtn.disabled = false; }, 3000);
    });
  }

  // ─── Cycle engine controls ───────────────────────────────────────────────
  const cycleAction = async (action, btn) => {
    btn.disabled = true;
    try {
      await chrome.runtime.sendMessage({ action });
    } catch { /* ignore */ }
    await renderCycleStatus();
    setTimeout(() => { btn.disabled = false; }, 2000);
  };
  const startBtn = document.getElementById('btn-cycle-start');
  if (startBtn) startBtn.addEventListener('click', () => cycleAction('CYCLE_START', startBtn));
  const continueBtn = document.getElementById('btn-cycle-continue');
  if (continueBtn) continueBtn.addEventListener('click', () => cycleAction('CYCLE_CONTINUE', continueBtn));
  const stopBtn = document.getElementById('btn-cycle-stop');
  if (stopBtn) stopBtn.addEventListener('click', () => cycleAction('CYCLE_STOP', stopBtn));

  // Refresh cycle status every 5s while popup is open (lastTickAt drifts)
  setInterval(renderCycleStatus, 5000);
>>>>>>> d82b910 (feat: novos coletores (job, lead, detail) e refresh popup/manifest)

  document.getElementById('open-history').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('history/history.html') });
  });

  // ─── Run counter ───────────────────────────────────────────────────────────
  document.getElementById('btn-set-runs').addEventListener('click', async () => {
    const select = document.getElementById('select-run-count');
    const count  = parseInt(select.value, 10);
    await chrome.storage.local.set({ runsTarget: count });
    await renderRunCounter();
  });
}


// ─── Utilities ────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
