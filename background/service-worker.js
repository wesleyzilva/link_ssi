/**
 * service-worker.js
 * Background Service Worker — schedules the daily SSI routine and
 * orchestrates the sequence of content-script tasks.
 *
 * Execution windows (Brasília time, BRT = UTC-3):
 *   11:00 → US East Coast + Europe morning overlap
 *   21:00 → China / Australia morning + US West Coast late afternoon
 */

import { checkGlobalTime, TARGET_WINDOWS } from '../utils/time-checker.js';
import { log } from '../utils/logger.js';

const ALARM_NAMES = {
  MORNING: 'ssi-routine-morning',   // 11:00 BRT — US East + Europe
  EVENING: 'ssi-routine-evening',   // 21:00 BRT — APAC + US West
};

/**
 * 7-day diminishing connection schedule.
 * Day 0 = first run of the cycle (15 connections).
 * After day 6, the cycle resets to day 0.
 */
const DAILY_CAPS = [15, 14, 13, 12, 11, 10, 9];

// Maximum number of sendMessage retries while waiting for the content script
const SEND_MAX_RETRIES = 15;  // 15 × 3 s = 45 s after page load
const SEND_FIRST_WAIT  = 3000; // first attempt: 3 s after status:complete
const SEND_RETRY_WAIT  = 3000; // subsequent attempts: every 3 s

// ─── Extension install / startup ────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  scheduleAlarms();
  log('Extension installed. Daily alarms registered.', 'success');
  console.log('[SSI Optimizer] Installed. Daily alarms registered.');
});

chrome.runtime.onStartup.addListener(() => {
  scheduleAlarms();
  log('Extension started. Alarms refreshed.');
});

// ─── Alarm scheduling ────────────────────────────────────────────────────────

function scheduleAlarms() {
  chrome.alarms.clearAll(() => {
    chrome.alarms.create(ALARM_NAMES.MORNING, {
      when: getNextAlarmTime(11, 0),
      periodInMinutes: 24 * 60,
    });
    chrome.alarms.create(ALARM_NAMES.EVENING, {
      when: getNextAlarmTime(21, 0),
      periodInMinutes: 24 * 60,
    });
    console.log('[SSI Optimizer] Alarms scheduled: 11:00 and 21:00 BRT.');
  });
}

/**
 * Returns the timestamp (ms) of the next occurrence of HH:MM in BRT.
 * If the time has already passed today, returns tomorrow's occurrence.
 */
function getNextAlarmTime(hours, minutes) {
  const now = new Date();
  const brtOffset = -3 * 60;
  const utcNow = now.getTime() + now.getTimezoneOffset() * 60000;
  const brtNow = new Date(utcNow + brtOffset * 60000);

  const target = new Date(brtNow);
  target.setHours(hours, minutes, 0, 0);

  if (target <= brtNow) {
    target.setDate(target.getDate() + 1);
  }

  // Convert back to UTC milliseconds
  return target.getTime() - brtOffset * 60000;
}

// ─── Alarm handler ───────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAMES.MORNING && alarm.name !== ALARM_NAMES.EVENING) return;

  const window = alarm.name === ALARM_NAMES.MORNING
    ? TARGET_WINDOWS.US_EU
    : TARGET_WINDOWS.APAC;

  const allowed = await checkGlobalTime(window);
  if (!allowed) {
    console.warn('[SSI Optimizer] Time window validation failed. Skipping run.');
    await log('Scheduled run skipped — outside allowed time window.', 'warn');
    return;
  }

  const dailyCap = await getDailyConnectionCap();
  console.log(`[SSI Optimizer] Starting daily routine for window: ${window} | connections cap today: ${dailyCap}`);
  await log(`Scheduled run started. Window: ${window} | cap: ${dailyCap} connections.`);

  await runDailySequence(window, dailyCap);
  await advanceDayCycle();
});

// ─── Daily sequence orchestrator ─────────────────────────────────────────────

/**
 * Executes the full daily routine as an ordered task sequence.
 * SSI capture always runs first to log the baseline before any engagement.
 *
 * @param {string} targetWindow - TARGET_WINDOWS value
 * @param {number} dailyCap     - connection requests allowed today
 */
async function runDailySequence(targetWindow, dailyCap) {
  try {
    await log('Step 1/5 — Capturing SSI scores…');
    await openTabAndWait('https://www.linkedin.com/sales/ssi', 'ssi-monitor', {});

    await log(`Step 2/5 — Prospecting Tech Recruiters (cap: ${dailyCap})…`);
    await openTabAndWait(buildSearchUrl(targetWindow), 'recruiter-prospector', { dailyCap });

    await log('Step 2b/5 — Browsing people search (SSI: Localizar as pessoas certas)…');
    const peopleUrl = await getNextPeopleSearchUrl();
    await openTabAndWait(peopleUrl, 'recruiter-prospector', { dailyCap: 0 });
    await advancePeopleQueue();

    await log('Step 3/5 — Engaging with targeted content search posts…');
    const { expr, index: exprIndex, url: postEngageUrl } = await getNextSearchExpression();
    await log(`Keyword ${exprIndex + 1}/${CONTENT_SEARCH_EXPRESSIONS.length}: "${expr}"`);
    await openTabAndWait(postEngageUrl, 'post-engager', {});
    await advanceExprQueue();

    await log('Step 4/5 — Building relationships (birthdays + anniversaries)…');
    await openTabAndWait('https://www.linkedin.com/mynetwork/catch-up/birthday/', 'relationship-builder', { pageType: 'birthday' });
    await openTabAndWait('https://www.linkedin.com/mynetwork/catch-up/work_anniversaries/', 'relationship-builder', { pageType: 'anniversary' });

    await log('Step 5/6 — Tracking accepted connections…');
    await openTabAndWait('https://www.linkedin.com/mynetwork/invitation-manager/sent/', 'connection-tracker', {});

    await log('Step 6/6 — Sending follow-up messages to accepted connections (≥24h)…');
    await openTabAndWait('https://www.linkedin.com/messaging/', 'follow-up-sender', {});
  } catch (err) {
    await log(`Sequence error: ${err.message}`, 'error');
    return;
  }

  await log(`Daily routine complete. Cap used: ${dailyCap}. Window: ${targetWindow}.`, 'success');
  await exportAllCsvs();
  // Note: iconUrl omitted — chrome.notifications fails to download extension icons in MV3 service workers
  chrome.notifications.create(`run-done-${Date.now()}`, {
    type: 'basic',
    title: 'SSI Optimizer',
    message: `Daily routine complete. ${dailyCap} connections attempted. Window: ${targetWindow}.`,
  });
}

/**
 * Opens a LinkedIn URL in a new tab, waits for the content script to register
 * its message listener, sends START, then waits for the task to complete.
 *
 * Because LinkedIn is a heavy SPA, `status: 'complete'` fires long before the
 * page's own JS — and therefore the content script module — is ready.
 * We poll with sendMessage every 3 s until the content script responds or
 * the 90-second safety timer fires.
 *
 * @param {string} url
 * @param {string} task
 * @param {object} payload
 */
function openTabAndWait(url, task, payload = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let createdTabId = null;

    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(safetyTimer);
      if (createdTabId !== null) {
        chrome.tabs.remove(createdTabId, () => {
          if (chrome.runtime.lastError) {} // tab may already be closed
          resolve();
        });
      } else {
        resolve();
      }
    };

    const safetyTimer = setTimeout(() => {
      log(`[${task}] timed out after 90 s — continuing sequence`, 'warn');
      settle();
    }, 90_000);

    chrome.tabs.create({ url, active: false }, (tab) => {
      createdTabId = tab.id;
      if (settled) {
        chrome.tabs.remove(tab.id, () => {});
        return;
      }

      const loadListener = (tabId, changeInfo) => {
        if (tabId !== createdTabId || changeInfo.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(loadListener);
        trySendStart(createdTabId, task, payload, 0, settle);
      };
      chrome.tabs.onUpdated.addListener(loadListener);
    });
  });
}

/**
 * Polls sendMessage every SEND_RETRY_WAIT ms until the content script
 * responds (meaning its onMessage listener is registered and the task ran),
 * or until MAX_RETRIES is exhausted.
 */
function trySendStart(tabId, task, payload, attempt, done) {
  if (attempt > SEND_MAX_RETRIES) {
    log(`[${task}] content script did not respond after ${SEND_MAX_RETRIES} retries — skipping`, 'warn');
    done();
    return;
  }

  const wait = attempt === 0 ? SEND_FIRST_WAIT : SEND_RETRY_WAIT;
  setTimeout(() => {
    chrome.tabs.sendMessage(tabId, { action: 'START', task, ...payload }, (_resp) => {
      if (chrome.runtime.lastError) {
        // Content script not ready yet — try again
        trySendStart(tabId, task, payload, attempt + 1, done);
        return;
      }
      // Content script received START and called sendResponse — task complete
      done();
    });
  }, wait);
}

/**
 * Targeted content-search expressions for Wesley's profile:
 * Project Manager / Delivery Manager / Agile lead, working globally from Brazil.
 *
 * Format: phrase that appears in posts written BY or FOR recruiters/leaders
 * in the target market. Each run picks one at random so LinkedIn doesn't flag
 * repetitive automated searches.
 *
 * Industries targeted (LinkedIn f_I codes):
 *   96  → Technology, Information and Internet
 *   6   → Technology, Information and Media
 *   4   → IT Services and IT Consulting
 *   69  → Technical and Vocational Training
 *   32  → Utilities / Energy Technology
 */
// Validated content-search keywords — matches proven LinkedIn search URL format
// (authorIndustry=6 = Technology, Information and Media — user-validated sector)
const CONTENT_SEARCH_EXPRESSIONS = [
  'project delivery',
  'project delivery latam',
  'agile master',
  'project manager brazil',
  'project delivery brazil',
  'tech recruiter information technology',
  'delivery manager',
  'delivery manager latam',
  'project manager latam',
  'IT manager remote',
  'nearshore project manager',
  'tech lead latam',
  'engineering manager brazil',
  'program manager latam',
  'product delivery latam',
  'agile delivery brazil',
  'scrum master latam',
];

// People-search URLs for "Localizar as pessoas certas" SSI pillar — view-only browse
// Rotated each run so LinkedIn sees varied, organic search behaviour
const PEOPLE_SEARCH_URLS = [
  'https://www.linkedin.com/search/results/people/?keywords=IT%20Manager%20remote%20brazil&f_I=%5B%2296%22%2C%226%22%2C%224%22%5D',
  'https://www.linkedin.com/search/results/people/?keywords=Delivery%20Manager%20LATAM&f_I=%5B%2296%22%2C%226%22%2C%224%22%5D',
  'https://www.linkedin.com/search/results/people/?keywords=Project%20Manager%20Brazil%20remote&f_I=%5B%2296%22%2C%226%22%2C%224%22%5D',
  'https://www.linkedin.com/search/results/people/?keywords=tech%20recruiter%20information%20technology&f_I=%5B%2296%22%2C%226%22%2C%224%22%5D',
  'https://www.linkedin.com/search/results/people/?keywords=Engineering%20Manager%20LATAM&f_I=%5B%2296%22%2C%226%22%2C%224%22%5D',
  'https://www.linkedin.com/search/results/people/?keywords=IT%20recruitment%20technology%20brazil&f_I=%5B%2296%22%2C%226%22%2C%224%22%5D',
  'https://www.linkedin.com/search/results/people/?keywords=nearshore%20IT%20manager%20LATAM&f_I=%5B%2296%22%2C%226%22%2C%224%22%5D',
];

/**
 * Returns the next content-search expression using round-robin rotation.
 * Cycles through all 15 expressions before any repeats.
 * Stores `exprQueueIndex` (0–14) in chrome.storage.local.
 */
async function getNextSearchExpression() {
  const { exprQueueIndex = 0 } = await chrome.storage.local.get('exprQueueIndex');
  const idx  = exprQueueIndex % CONTENT_SEARCH_EXPRESSIONS.length;
  const expr = CONTENT_SEARCH_EXPRESSIONS[idx];
  const kw   = encodeURIComponent(expr);
  // Use validated URL format: authorIndustry=6 (Technology, Information and Media), past-month
  const url  =
    `https://www.linkedin.com/search/results/content/?keywords=${kw}` +
    `&origin=GLOBAL_SEARCH_HEADER` +
    `&datePosted=%5B%22past-month%22%5D` +
    `&authorIndustry=%5B%226%22%5D`;
  await chrome.storage.local.set({ lastUsedExpression: { expr, index: idx, usedAt: new Date().toISOString() } });
  return { expr, index: idx, url };
}

async function advanceExprQueue() {
  const { exprQueueIndex = 0 } = await chrome.storage.local.get('exprQueueIndex');
  const next = (exprQueueIndex + 1) % CONTENT_SEARCH_EXPRESSIONS.length;
  await chrome.storage.local.set({ exprQueueIndex: next });
  console.log(`[SSI Optimizer] Expr queue advanced: ${exprQueueIndex} → ${next} (next: "${CONTENT_SEARCH_EXPRESSIONS[next]}")`);
}

async function getNextPeopleSearchUrl() {
  const { peopleQueueIndex = 0 } = await chrome.storage.local.get('peopleQueueIndex');
  const idx = peopleQueueIndex % PEOPLE_SEARCH_URLS.length;
  console.log(`[SSI Optimizer] People search URL ${idx + 1}/${PEOPLE_SEARCH_URLS.length}: ${PEOPLE_SEARCH_URLS[idx]}`);
  return PEOPLE_SEARCH_URLS[idx];
}

async function advancePeopleQueue() {
  const { peopleQueueIndex = 0 } = await chrome.storage.local.get('peopleQueueIndex');
  const next = (peopleQueueIndex + 1) % PEOPLE_SEARCH_URLS.length;
  await chrome.storage.local.set({ peopleQueueIndex: next });
  console.log(`[SSI Optimizer] People queue advanced: ${peopleQueueIndex} → ${next}`);
}

function buildPostEngageUrl() {
  const expr = CONTENT_SEARCH_EXPRESSIONS[
    Math.floor(Math.random() * CONTENT_SEARCH_EXPRESSIONS.length)
  ];
  const kw = encodeURIComponent(expr);
  return (
    `https://www.linkedin.com/search/results/content/?keywords=${kw}` +
    `&origin=GLOBAL_SEARCH_HEADER` +
    `&datePosted=%5B%22past-month%22%5D` +
    `&authorIndustry=%5B%226%22%5D`
  );
}

function buildSearchUrl(targetWindow) {
  // Target: Tech / IT Recruiters specifically in the technology sector
  const keywords = encodeURIComponent('Tech Recruiter Information Technology');
  const geoMap = {
    US_EU: '103644278,101165590',   // USA + United Kingdom URNs
    APAC: '102257491,101452733',    // Australia + Singapore URNs
  };
  const geo = geoMap[targetWindow] || geoMap.US_EU;
  // industry URN IDs: 4 = IT Services, 96 = Software, 6 = Internet
  const industry = encodeURIComponent('["4","96","6"]');
  return (
    `https://www.linkedin.com/search/results/people/?keywords=${keywords}` +
    `&geoUrn=%5B${geo}%5D` +
    `&industryFilter=${industry}` +
    `&network=%5B%22S%22%2C%22O%22%5D`
  );
}

// ─── Day cycle management ────────────────────────────────────────────────────

/**
 * Returns the connection cap for today based on the current position
 * in the 7-day diminishing schedule: 15, 14, 13, 12, 11, 10, 9.
 */
async function getDailyConnectionCap() {
  const { dayCycleIndex = 0 } = await chrome.storage.local.get('dayCycleIndex');
  return DAILY_CAPS[dayCycleIndex % DAILY_CAPS.length];
}

/**
 * Advances the day cycle index by 1 (mod 7).
 * Called after each successful daily routine completion.
 */
async function advanceDayCycle() {
  const { dayCycleIndex = 0 } = await chrome.storage.local.get('dayCycleIndex');
  const next = (dayCycleIndex + 1) % DAILY_CAPS.length;
  await chrome.storage.local.set({ dayCycleIndex: next });
  console.log(
    `[SSI Optimizer] Day cycle advanced: ${dayCycleIndex} → ${next} ` +
    `(next cap: ${DAILY_CAPS[next]} connections)`
  );
}

function randomWait(minMs, maxMs) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// ─── CSV auto-export ──────────────────────────────────────────────────────────

function csvRow(values) {
  return values.map(v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }).join(',');
}

function downloadCsvFromSW(filename, headers, rows) {
  const lines = [csvRow(headers), ...rows.map(csvRow)].join('\r\n');
  // Service workers cannot use URL.createObjectURL — use a data URL instead
  const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + lines);
  chrome.downloads.download({ url: dataUrl, filename: `link_ssi/output/${filename}`, saveAs: false });
}

async function exportAllCsvs() {
  const data = await chrome.storage.local.get([
    'connections', 'postInteractions', 'relationships', 'activityLog', 'ssiScores', 'discoveredLinks',
    'acceptedConnections', 'lastConnectionTracking', 'lastFollowUp',
  ]);
  const ts = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');

  const conns = [...(data.connections || [])].sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  downloadCsvFromSW(`connections-${ts}.csv`,
    ['Date', 'Name', 'Profile URL', 'Profile ID'],
    conns.map(c => [c.sentAt, c.name || c.profileId, c.profileUrl || `https://www.linkedin.com/in/${c.profileId}/`, c.profileId]));

  const posts = [...(data.postInteractions || [])].sort((a, b) => new Date(b.interactedAt) - new Date(a.interactedAt));
  downloadCsvFromSW(`post-interactions-${ts}.csv`,
    ['Date', 'Action', 'Post URL', 'Post ID'],
    posts.map(p => [p.interactedAt, p.action || 'like', p.postUrl || '', p.postId]));

  const rels = [...(data.relationships || [])].sort((a, b) => new Date(b.touchedAt) - new Date(a.touchedAt));
  downloadCsvFromSW(`relationships-${ts}.csv`,
    ['Date', 'Name', 'Event Type', 'Message Sent', 'Profile URL', 'Profile ID'],
    rels.map(r => [r.touchedAt, r.name || r.profileId, r.eventType, r.messageSent || '',
      r.profileUrl || `https://www.linkedin.com/in/${r.profileId}/`, r.profileId]));

  const logs = [...(data.activityLog || [])].reverse();
  downloadCsvFromSW(`activity-log-${ts}.csv`,
    ['Date', 'Level', 'Script', 'Message'],
    logs.map(e => [e.ts, e.level || 'info', e.script || '', e.msg || '']));

  const ssi = [...(data.ssiScores || [])].sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt));
  downloadCsvFromSW(`ssi-scores-${ts}.csv`,
    ['Date', 'CapturedAt', 'Total', 'Brand', 'People', 'Insights', 'Relationships'],
    ssi.map(s => [s.date || (s.capturedAt || '').slice(0, 10), s.capturedAt,
      s.total ?? '', s.brand ?? '', s.people ?? '', s.insights ?? '', s.relationships ?? '']));

  // Links discovered — for human validation
  const links = [...(data.discoveredLinks || [])].sort((a, b) => new Date(b.ts) - new Date(a.ts));
  downloadCsvFromSW(`discovered-links-${ts}.csv`,
    ['Date', 'Context', 'URL', 'Profile ID', 'Name'],
    links.map(l => [l.ts, l.context || '', l.url || '', l.profileId || '', l.name || '']));

  // Accepted connections — for ROI tracking and outreach review
  const accepted = [...(data.acceptedConnections || [])].sort((a, b) => new Date(b.acceptedAt) - new Date(a.acceptedAt));
  downloadCsvFromSW(`accepted-connections-${ts}.csv`,
    ['AcceptedAt', 'Name', 'Profile URL', 'Profile ID', 'SentAt', 'FollowUpSent', 'FollowUpAt'],
    accepted.map(a => [a.acceptedAt, a.name || '', a.profileUrl || '', a.profileId || '',
      a.sentAt || '', a.followUpSent ? 'yes' : 'no', a.followUpAt || '']));

  await log(`Auto-CSV export complete — ${links.length} links, ${accepted.length} accepted, ${logs.length} log entries → Downloads/link_ssi/output/`, 'success');
}

// ─── Manual trigger (popup „Run Now“ / per-task buttons) ──────────────────────

const TASK_URLS = {
  'ssi-monitor': 'https://www.linkedin.com/sales/ssi',
  'post-engager': 'https://www.linkedin.com/feed/',
  'relationship-builder': 'https://www.linkedin.com/mynetwork/catch-up/birthday/',
  'connection-tracker': 'https://www.linkedin.com/mynetwork/invitation-manager/sent/',
  'follow-up-sender': 'https://www.linkedin.com/messaging/',
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'RUN_NOW') {
    getDailyConnectionCap().then(async (cap) => {
      await log(`[Manual] Full sequence triggered. Cap today: ${cap}.`, 'warn');
      runDailySequence(TARGET_WINDOWS.US_EU, cap)
        .then(() => advanceDayCycle())
        .catch(async (err) => log(`[Manual] Sequence error: ${err.message}`, 'error'));
      sendResponse({ started: true });
    });
    return true;
  }

  if (message.action === 'RUN_TASK') {
    const { task } = message;
    getDailyConnectionCap().then(async (cap) => {
      await log(`[Manual] Single task triggered: ${task}.`, 'warn');
      const url = task === 'recruiter-prospector'
        ? buildSearchUrl(TARGET_WINDOWS.US_EU)
        : TASK_URLS[task];
      if (!url) {
        await log(`[Manual] Unknown task: ${task}`, 'error');
        sendResponse({ error: 'Unknown task' });
        return;
      }
      const payload = task === 'recruiter-prospector' ? { dailyCap: cap } : {};
      await openTabAndWait(url, task, payload);
      await log(`[Manual] Task complete: ${task}.`, 'success');
      sendResponse({ done: true });
    });
    return true;
  }

  // Content scripts request CSV export after each run (logs go to output/ immediately)
  if (message.action === 'EXPORT_LOGS') {
    exportAllCsvs()
      .then(() => sendResponse({ exported: true }))
      .catch(async (err) => {
        await log(`[EXPORT_LOGS] error: ${err.message}`, 'error');
        sendResponse({ error: err.message });
      });
    return true;
  }
});
