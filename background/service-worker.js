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
  MORNING:  'ssi-routine-morning',   // 11:00 BRT — US East + Europe
  EVENING:  'ssi-routine-evening',   // 21:00 BRT — APAC + US West
  INTERVAL: 'ssi-routine-interval',  // Repeating interval (configured by user)
};

/**
 * 7-day diminishing connection schedule.
 * Day 0 = first run of the cycle (15 connections).
 * After day 6, the cycle resets to day 0.
 */
const DAILY_CAPS = [15, 14, 13, 12, 11, 10, 9];

// Maximum intro messages sent per run (stays well below LinkedIn DM rate limits)
const MESSAGE_CAP_PER_RUN = 20;

// Maximum number of sendMessage retries while waiting for the content script
const SEND_MAX_RETRIES = 15;  // 15 × 3 s = 45 s after page load
const SEND_FIRST_WAIT  = 3000; // first attempt: 3 s after status:complete
const SEND_RETRY_WAIT  = 3000; // subsequent attempts: every 3 s

// ─── Extension install / startup ────────────────────────────────────────────

// Posts the user specifically requested to comment on (seeded at install/update).
// Additional posts can be queued via the popup at any time.
const SEED_POST_URLS = [
  'https://www.linkedin.com/posts/samuel-gomes-costa-55503a340_backend-nodejs-nestjs-share-7456722421988044800-eWoS/',
  'https://www.linkedin.com/posts/tales-habib_recently-i-started-using-git-worktree-share-7457077215042863104-z_1X/',
  'https://www.linkedin.com/posts/gabriel-saturi_backend-distributedsystems-architecture-share-7457052634265407488-tLcm/',
];

chrome.runtime.onInstalled.addListener(async () => {
  scheduleAlarms();
  await restoreIntervalAlarm();
  log('Extension installed. Daily alarms registered.', 'success');
  console.log('[SSI Optimizer] Installed. Daily alarms registered.');
  await seedPostQueue();
});

/**
 * Re-creates the interval alarm from storage after service-worker restart.
 * Chrome clears all alarms when the service worker is killed.
 */
async function restoreIntervalAlarm() {
  const { intervalMinutes = 0 } = await chrome.storage.local.get('intervalMinutes');
  if (intervalMinutes > 0) {
    chrome.alarms.get(ALARM_NAMES.INTERVAL, (existing) => {
      if (!existing) {
        chrome.alarms.create(ALARM_NAMES.INTERVAL, {
          delayInMinutes: intervalMinutes,
          periodInMinutes: intervalMinutes,
        });
        log(`[Interval] Alarm restored: every ${intervalMinutes} min.`, 'info');
      }
    });
  }
}

/**
 * Adds SEED_POST_URLS to `specificPostQueue` if not already present.
 * Safe to call on every install/update — deduplicates by URL.
 */
async function seedPostQueue() {
  const { specificPostQueue = [] } = await chrome.storage.local.get('specificPostQueue');
  let added = 0;
  let reset = 0;
  for (const url of SEED_POST_URLS) {
    const existing = specificPostQueue.find(e => e.url === url);
    if (!existing) {
      specificPostQueue.push({ url, addedAt: new Date().toISOString(), done: false });
      added++;
    } else if (existing.done) {
      // Reset seed posts that were marked done without a confirmed content-script response
      // (i.e. before the success-based done logic was in place).
      existing.done = false;
      reset++;
    }
  }
  if (added > 0 || reset > 0) {
    await chrome.storage.local.set({ specificPostQueue });
    if (added > 0) await log(`[PostQueue] ${added} seed post(s) added to queue.`, 'success');
    if (reset > 0) await log(`[PostQueue] ${reset} seed post(s) reset to pending (will retry).`, 'info');
  }
}

chrome.runtime.onStartup.addListener(() => {
  scheduleAlarms();
  restoreIntervalAlarm();
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
  // ── Interval alarm (no time-window check — user opted in deliberately) ──
  if (alarm.name === ALARM_NAMES.INTERVAL) {
    const dailyCap = await getDailyConnectionCap();
    await log(`[Interval] Run started. Cap today: ${dailyCap}.`, 'warn');
    await runDailySequence(TARGET_WINDOWS.US_EU, dailyCap);
    await advanceDayCycle();
    return;
  }

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
  await chrome.storage.local.set({ routineRunning: true });
  try {
    await log('Step 1/6 — Capturing SSI scores…');
    await openTabAndWait('https://www.linkedin.com/sales/ssi', 'ssi-monitor', {});

    // Split the daily cap: Step 2 uses the keyword pool, Step 2c uses direct validated URLs.
    // Total connections per day stays within the DAILY_CAPS schedule.
    const capHalf = Math.floor(dailyCap / 2);
    const capRest = dailyCap - capHalf;

    await log(`Step 2/6 — Prospecting Tech Recruiters via keyword search (cap: ${capHalf})…`);
    await openTabAndWait(await buildSearchUrl(targetWindow), 'recruiter-prospector', { dailyCap: capHalf }, 600_000);

    await log('Step 2b/6 — Browsing people search (SSI: Localizar as pessoas certas)…');
    const peopleUrl = await getNextPeopleSearchUrl();
    await openTabAndWait(peopleUrl, 'recruiter-prospector', { dailyCap: 0 }, 600_000);
    await advancePeopleQueue();

    await log(`Step 2c/6 — Prospecting global profiles via direct URLs (cap: ${capRest})…`);
    const directUrl = await getNextDirectConnectUrl();
    await openTabAndWait(directUrl, 'recruiter-prospector', { dailyCap: capRest }, 600_000);
    await advanceDirectConnectQueue();

    await log('Step 3/6 — Engaging with targeted content search posts…');
    const { expr, index: exprIndex, url: postEngageUrl } = await getNextSearchExpression();
    await log(`Keyword ${exprIndex + 1}/${CONTENT_SEARCH_EXPRESSIONS.length}: "${expr}"`);
    await openTabAndWait(postEngageUrl, 'post-engager', {});
    await advanceExprQueue();

    await log('Step 3b/6 — Commenting on queued specific posts…');
    await processSpecificPostQueue();

    await log('Step 4/6 — Building relationships (birthdays + anniversaries + job changes)…');
    await openTabAndWait('https://www.linkedin.com/mynetwork/catch-up/birthday/', 'relationship-builder', { pageType: 'birthday' });
    await openTabAndWait('https://www.linkedin.com/mynetwork/catch-up/work_anniversaries/', 'relationship-builder', { pageType: 'anniversary' });
    await openTabAndWait('https://www.linkedin.com/mynetwork/catch-up/job_changes/', 'relationship-builder', { pageType: 'new_job' });

    await log('Step 5/6 — Tracking accepted connections…');
    await openTabAndWait('https://www.linkedin.com/mynetwork/invitation-manager/sent/', 'connection-tracker', {});

    await log('Step 6/6 — Sending follow-up messages to accepted connections (≥24h)…');
    await openTabAndWait('https://www.linkedin.com/messaging/', 'follow-up-sender', {});
  } catch (err) {
    await chrome.storage.local.set({ routineRunning: false });
    await log(`Sequence error: ${err.message}`, 'error');
    return;
  }

  await chrome.storage.local.set({ routineRunning: false, lastSequenceDoneAt: new Date().toISOString() });
  await log(`Daily routine complete. Cap used: ${dailyCap}. Window: ${targetWindow}.`, 'success');

  // ─── Session summary (actual counts, not just caps) ──────────────────
  const _summary = await chrome.storage.local.get(['lastProspecting', 'lastEngagement', 'lastRelationshipBuild']);
  const _conns = _summary.lastProspecting?.sent ?? 0;
  const _posts = (_summary.lastEngagement?.likes ?? 0) + (_summary.lastEngagement?.comments ?? 0);
  const _rels  = _summary.lastRelationshipBuild?.touched ?? 0;
  await log(
    `[Summary] 🤝 Connections ${_conns} | 💬 Posts ${_posts} | 🎉 Relationships ${_rels}`,
    'success'
  );

  await exportAllCsvs();

  await log('Step 7/7 — Auto-messaging newly discovered profiles…');
  await buildAndRunAutoMessageQueue();

  // Note: iconUrl omitted — chrome.notifications fails to download extension icons in MV3 service workers
  chrome.notifications.create(`run-done-${Date.now()}`, {
    type: 'basic',
    title: 'SSI Optimizer',
    message: `Done. 🤝 ${_conns} connections | 💬 ${_posts} posts | 🎉 ${_rels} relationships`,
  });

  // Auto-open history page so the user can review results immediately
  chrome.tabs.create({ url: chrome.runtime.getURL('history/history.html') });
}

// ─── Specific-post queue ─────────────────────────────────────────────────────

/**
 * Reads `specificPostQueue` from storage, comments on each pending post once,
 * then removes successfully processed entries from the queue.
 *
 * Each queue entry: { url: string, addedAt: string, done?: boolean }
 */
async function processSpecificPostQueue() {
  const { specificPostQueue = [] } = await chrome.storage.local.get('specificPostQueue');
  const pending = specificPostQueue.filter(e => !e.done);

  if (!pending.length) {
    await log('[PostQueue] No pending posts in queue — skipping.', 'info');
    return;
  }

  await log(`[PostQueue] Processing ${pending.length} queued post(s)…`);

  for (const entry of pending) {
    await log(`[PostQueue] Commenting on: ${entry.url}`);
    try {
      const responded = await openTabAndWait(entry.url, 'post-engager', { singlePost: true, commentTemplate: null });
      if (responded) {
        entry.done = true;
        await log(`[PostQueue] Done: ${entry.url}`, 'success');
      } else {
        await log(`[PostQueue] Skipped (no content script response) — will retry next run: ${entry.url}`, 'warn');
      }
    } catch (err) {
      await log(`[PostQueue] Error on ${entry.url}: ${err.message}`, 'error');
    }
  }

  // Persist the updated queue (mark done=true; fully remove entries older than 7 days)
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const updated = specificPostQueue.filter(
    e => !e.done || new Date(e.addedAt).getTime() > sevenDaysAgo
  );
  await chrome.storage.local.set({ specificPostQueue: updated });
  await log(`[PostQueue] Queue flushed. ${pending.length} post(s) processed.`, 'success');
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
function openTabAndWait(url, task, payload = {}, timeoutMs = 90_000) {
  return new Promise((resolve) => {
    let settled = false;
    let createdTabId = null;
    let contentScriptResponded = false;

    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(safetyTimer);
      if (createdTabId !== null) {
        chrome.tabs.remove(createdTabId, () => {
          if (chrome.runtime.lastError) {} // tab may already be closed
          resolve(contentScriptResponded);
        });
      } else {
        resolve(contentScriptResponded);
      }
    };

    const settleSuccess = () => {
      contentScriptResponded = true;
      settle();
    };

    const timeoutSecs = Math.round(timeoutMs / 1000);
    const safetyTimer = setTimeout(() => {
      log(`[${task}] timed out after ${timeoutSecs} s — continuing sequence`, 'warn');
      settle();
    }, timeoutMs);

    chrome.tabs.create({ url, active: false }, (tab) => {
      createdTabId = tab.id;
      if (settled) {
        chrome.tabs.remove(tab.id, () => {});
        return;
      }

      const loadListener = (tabId, changeInfo) => {
        if (tabId !== createdTabId || changeInfo.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(loadListener);
        trySendStart(createdTabId, task, payload, 0, settle, settleSuccess);
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
function trySendStart(tabId, task, payload, attempt, done, doneSuccess) {
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
        trySendStart(tabId, task, payload, attempt + 1, done, doneSuccess);
        return;
      }
      // Content script received START and called sendResponse — task complete
      if (doneSuccess) doneSuccess(); else done();
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
  'remote project manager jobs',
  'remote project manager jobs latam',
  'project manager',
  'agile manager',
  'manager project',
  'tech recruiter experian',
  'tech recruiter information technology experian',
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
  'https://www.linkedin.com/search/results/people/?keywords=startup%20project%20manager%20remote&f_I=%5B%2296%22%2C%226%22%2C%224%22%5D',
  'https://www.linkedin.com/search/results/people/?keywords=startup%20delivery%20manager%20LATAM&f_I=%5B%2296%22%2C%226%22%2C%224%22%5D',
  // Tech Recruiter IT — US + Canada + UK + Australia + Germany + Netherlands + Ireland + Brazil — 1st/2nd degree
  'https://www.linkedin.com/search/results/people/?keywords=Tech%20Recruiter%20Information%20Technology&origin=FACETED_SEARCH&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22102713980%22%2C%22101165590%22%2C%22100364837%22%2C%22102454443%22%2C%22102890883%22%2C%22104738515%22%2C%22101174742%22%5D',
  // Tech Recruiter IT — same geos, English-only profiles, staffing/recruiting service category
  'https://www.linkedin.com/search/results/people/?keywords=Tech%20Recruiter%20Information%20Technology&origin=FACETED_SEARCH&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22102713980%22%2C%22101174742%22%2C%22101165590%22%2C%22100364837%22%2C%22102454443%22%2C%22102890883%22%2C%22104738515%22%5D&serviceCategory=%5B%224725%22%5D&profileLanguage=%5B%22en%22%5D',
  // Tech Recruiter IT — US/CA/AU/UK/Singapore, staffing category, English, IT industry
  'https://www.linkedin.com/search/results/people/?keywords=Tech%20Recruiter%20Information%20Technology&origin=FACETED_SEARCH&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22102713980%22%2C%22101174742%22%2C%22101165590%22%2C%22104738515%22%5D&serviceCategory=%5B%224725%22%5D&profileLanguage=%5B%22en%22%5D',
  // Tech Recruiter IT — US/CA/UK/AU/Singapore, IT consulting service category, English
  'https://www.linkedin.com/search/results/people/?keywords=Tech%20Recruiter%20Information%20Technology&origin=FACETED_SEARCH&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22102713980%22%2C%22101165590%22%2C%22101174742%22%2C%22104738515%22%5D&serviceCategory=%5B%2250342%22%5D&profileLanguage=%5B%22en%22%5D',
  // tech recruiter experian — US, Canada, Australia, Netherlands, Germany, France (user-validated geos)
  'https://www.linkedin.com/search/results/people/?keywords=tech%20recruiter%20experian&origin=FACETED_SEARCH&geoUrn=%5B%22103644278%22%2C%22102713980%22%2C%22101739942%22%2C%22104738515%22%2C%22102890883%22%2C%22102454443%22%5D&network=%5B%22S%22%2C%22O%22%5D',
  // tech recruiter experian — same geos, with Tech/IT industry filter
  'https://www.linkedin.com/search/results/people/?keywords=tech%20recruiter%20experian&origin=FACETED_SEARCH&geoUrn=%5B%22103644278%22%2C%22102713980%22%2C%22101739942%22%2C%22104738515%22%2C%22102890883%22%2C%22102454443%22%5D&network=%5B%22S%22%2C%22O%22%5D&f_I=%5B%226%22%5D',
];

// Direct people-search URLs for global (non-Brazilian) profiles — network=O (3rd degree+)
// These are user-validated URLs that target genuinely global audiences.
// Rotated each run, processed with full connect cap (split with Step 2).
const RECRUITER_DIRECT_CONNECT_URLS = [
  // 1st–3rd degree, "eua" keyword — US-oriented global professionals
  'https://www.linkedin.com/search/results/people/?keywords=eua&origin=GLOBAL_SEARCH_HEADER&network=%5B%22O%22%5D',
  // 3rd degree, "europe" keyword — France, Netherlands, US, Portugal, UK, Germany
  'https://www.linkedin.com/search/results/people/?keywords=europe&origin=FACETED_SEARCH&network=%5B%22O%22%5D&geoUrn=%5B%22101165590%22%2C%22105015875%22%2C%22103644278%22%2C%22106204383%22%2C%22101174742%22%2C%22104738515%22%5D',
  // "hiring project manager" — 1st+2nd+3rd degree — US, UK, Canada, Germany, Netherlands, France
  'https://www.linkedin.com/search/results/people/?keywords=hiring%20project%20manager&origin=GLOBAL_SEARCH_HEADER&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101174742%22%2C%22101165590%22%2C%22102454443%22%2C%22104738515%22%2C%22105015875%22%2C%22106204383%22%5D',
  // "hiring delivery manager" — 1st+2nd+3rd degree — US, France, UK, Canada, Germany, Netherlands
  'https://www.linkedin.com/search/results/people/?keywords=hiring%20delivery%20manager&origin=GLOBAL_SEARCH_HEADER&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22105015875%22%2C%22101165590%22%2C%22101174742%22%2C%22102454443%22%2C%22104738515%22%2C%22106204383%22%5D',
  // "hiring delivery manager latam" — 1st+2nd+3rd degree — US, UK, Canada, Germany, Netherlands, France
  'https://www.linkedin.com/search/results/people/?keywords=hiring%20delivery%20manager%20latam&origin=GLOBAL_SEARCH_HEADER&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%2C%22101174742%22%2C%22102454443%22%2C%22104738515%22%2C%22105015875%22%2C%22106204383%22%5D',
  // "hiring project manager latam" — 1st+2nd+3rd degree — US, UK, Canada, Germany, Netherlands, France
  'https://www.linkedin.com/search/results/people/?keywords=hiring%20project%20manager%20latam&origin=GLOBAL_SEARCH_HEADER&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%2C%22101174742%22%2C%22102454443%22%2C%22104738515%22%2C%22105015875%22%2C%22106204383%22%5D',
  // "hiring scrum latam" — 1st+2nd+3rd degree — UK, Canada, Germany, US, Netherlands, France
  'https://www.linkedin.com/search/results/people/?keywords=hiring%20scrum%20latam&origin=GLOBAL_SEARCH_HEADER&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22101165590%22%2C%22101174742%22%2C%22102454443%22%2C%22103644278%22%2C%22104738515%22%2C%22105015875%22%2C%22106204383%22%5D',
  // "hiring agile latam" — 1st+2nd+3rd degree — US, Canada, UK, Germany, Netherlands, France
  'https://www.linkedin.com/search/results/people/?keywords=hiring%20agile%20latam&origin=GLOBAL_SEARCH_HEADER&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101174742%22%2C%22106204383%22%2C%22101165590%22%2C%22102454443%22%2C%22104738515%22%2C%22105015875%22%5D',
  // "hiring startup project manager" — US, UK, Canada, Netherlands, Germany, Portugal, UAE
  'https://www.linkedin.com/search/results/people/?keywords=hiring%20startup%20project%20manager&origin=GLOBAL_SEARCH_HEADER&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%2C%22102713980%22%2C%22104738515%22%2C%22102890883%22%2C%22105015875%22%2C%22106157047%22%5D',
  // "startup delivery manager remote latam" — US, UK, Canada, Netherlands, Germany, Portugal, UAE
  'https://www.linkedin.com/search/results/people/?keywords=startup%20delivery%20manager%20remote%20latam&origin=GLOBAL_SEARCH_HEADER&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%2C%22102713980%22%2C%22104738515%22%2C%22102890883%22%2C%22105015875%22%2C%22106157047%22%5D',
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

  // LinkedIn 2026: /search/results/content/ renders posts with fully obfuscated CSS classes —
  // all 11+ DOM selectors return 0. Switch to /feed/hashtag/ which uses the standard feed
  // layout and retains [data-occludable-entity-urn] and aria-label="Like" attributes.
  // Hashtag URLs have the same content-filtering benefit as content-search keywords.
  const hashtag = expr.trim().toLowerCase().replace(/\s+/g, '-');
  const url = `https://www.linkedin.com/feed/hashtag/${encodeURIComponent(hashtag)}/`;

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

async function getNextDirectConnectUrl() {
  const { directConnectIndex = 0 } = await chrome.storage.local.get('directConnectIndex');
  const idx = directConnectIndex % RECRUITER_DIRECT_CONNECT_URLS.length;
  console.log(`[SSI Optimizer] Direct connect URL ${idx + 1}/${RECRUITER_DIRECT_CONNECT_URLS.length}: ${RECRUITER_DIRECT_CONNECT_URLS[idx]}`);
  return RECRUITER_DIRECT_CONNECT_URLS[idx];
}

async function advanceDirectConnectQueue() {
  const { directConnectIndex = 0 } = await chrome.storage.local.get('directConnectIndex');
  const next = (directConnectIndex + 1) % RECRUITER_DIRECT_CONNECT_URLS.length;
  await chrome.storage.local.set({ directConnectIndex: next });
  console.log(`[SSI Optimizer] Direct connect queue advanced: ${directConnectIndex} → ${next}`);
}

function buildPostEngageUrl() {
  const expr = CONTENT_SEARCH_EXPRESSIONS[
    Math.floor(Math.random() * CONTENT_SEARCH_EXPRESSIONS.length)
  ];
  const hashtag = expr.trim().toLowerCase().replace(/\s+/g, '-');
  return `https://www.linkedin.com/feed/hashtag/${encodeURIComponent(hashtag)}/`;
}

/**
 * Pool of recruiter-search keywords per target window.
 * Rotated each run via chrome.storage.local so LinkedIn sees organic,
 * varied search behaviour — and we reach LATAM-focused hiring managers
 * who use different terminology.
 */
const RECRUITER_SEARCH_POOL = {
  US_EU: [
    'Tech Recruiter Information Technology',
    'IT Recruiter LATAM nearshore',
    'Technical Recruiter remote latin america',
    'Talent Acquisition IT remote LATAM',
    'Engineering Recruiter nearshore Brazil',
    'IT Staffing remote latin america',
    'Head of Talent technology nearshore',
    'Software Engineer Recruiter LATAM',
    'Remote IT Recruiter south america',
    'Talent Acquisition Manager nearshore',
    'Technical Recruiter offshore brazil',
    'IT Recruiter nearshore remote',
    'Recruiter Information Technology remote',
    'Staff Augmentation Recruiter LATAM',
    'Offshore IT Recruiter latin america',
    // Startup / scale-up / VC-backed segment (mirrors portfolio SEO keywords)
    'Startup Recruiter project manager remote',
    'VC startup IT Recruiter LATAM',
    'Tech Recruiter startup nearshore',
    'Scale-up Recruiter engineering LATAM',
    'Talent Acquisition startup project manager',
    'Recruiter Series A Series B LATAM remote',
  ],
  APAC: [
    'Tech Recruiter Information Technology',
    'IT Recruiter remote APAC',
    'Technical Recruiter nearshore',
    'Talent Acquisition IT remote',
    'Engineering Recruiter APAC nearshore',
    'Head of Talent technology APAC',
    'Remote IT Recruiter australia',
    'Staff Augmentation Recruiter APAC',
  ],
};

async function buildSearchUrl(targetWindow) {
  const counterKey = `recruiterCounter_${targetWindow}`;
  const stored = await chrome.storage.local.get(counterKey);
  const counter = stored[counterKey] || 0;

  const pool = RECRUITER_SEARCH_POOL[targetWindow] || RECRUITER_SEARCH_POOL.US_EU;
  // Each keyword spans 10 pages before rotating to the next
  const keywordIdx = Math.floor(counter / 10) % pool.length;
  const page       = (counter % 10) + 1;          // 1 – 10
  const keyword    = pool[keywordIdx];
  const keywords   = encodeURIComponent(keyword);

  await chrome.storage.local.set({ [counterKey]: counter + 1 });
  console.log(
    `[SSI Optimizer] Recruiter search "${keyword}" page ${page}/10` +
    ` (keyword ${keywordIdx + 1}/${pool.length}) | window: ${targetWindow}`
  );

  // Expanded geo list validated by the user across pages 1-10
  const geoMap = {
    // USA, UK, Canada, Australia, Netherlands, Germany, France, Portugal, UAE
    US_EU: '%5B%22103644278%22%2C%22101165590%22%2C%22102713980%22%2C%22101739942%22%2C%22104738515%22%2C%22102890883%22%2C%22102454443%22%2C%22105015875%22%2C%22106157047%22%5D',
    APAC:  '%5B%22102257491%22%2C%22101452733%22%5D',   // Australia + Singapore
  };
  const geo      = geoMap[targetWindow] || geoMap.US_EU;
  const pagePart = page > 1 ? `&page=${page}` : '';
  return (
    `https://www.linkedin.com/search/results/people/?keywords=${keywords}` +
    `&network=%5B%22S%22%2C%22O%22%5D` +
    `&geoUrn=${geo}` +
    `&spellCorrectionEnabled=true` +
    `&prioritizeMessage=false` +
    pagePart
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

/**
 * Exports all discovered /in/ profile URLs to a plain-text file — one URL per line.
 * Saved to Downloads/link_ssi/output/links-{ts}.txt for manual review.
 */
function downloadLinksTxt(profileUrls, ts) {
  if (!profileUrls.length) return;
  const content = profileUrls.join('\n');
  const dataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(content);
  chrome.downloads.download({ url: dataUrl, filename: `link_ssi/output/links-${ts}.txt`, saveAs: false });
}

/**
 * Exports ALL activity data into a single chronological CSV.
 *
 * Headers: Category | Date | Type | Name | Detail | URL
 *   Connection   → type=connection-sent | name=person name | detail=profileId | url=profileUrl
 *   Post         → type=like/comment/follow | name='' | detail=postId | url=postUrl
 *   Relationship → type=birthday/anniversary | name=person name | detail=message | url=profileUrl
 *   Log          → type=info/warn/error/success | name=script | detail=message | url=''
 *   SSI          → type=ssi-score | name='' | detail=total:X brand:X people:X insights:X rel:X | url=''
 *   AcceptedConn → type=accepted | name=person name | detail=followUpSent | url=profileUrl
 *   Email        → type=email-found | name=email | detail=postId | url=postUrl
 *   Link         → type=link-discovered | name=context | detail='' | url=url
 */
async function exportAllCsvs() {
  // Debounce: skip if exported within the last 3 minutes to prevent double-CSV
  // when multiple content scripts send EXPORT_LOGS at the same time as the sequence end.
  const { _lastCsvExportAt } = await chrome.storage.local.get('_lastCsvExportAt');
  const now = Date.now();
  if (_lastCsvExportAt && now - _lastCsvExportAt < 3 * 60 * 1000) {
    console.log('[SSI Optimizer] exportAllCsvs skipped — debounce (< 3 min since last export)');
    return;
  }
  await chrome.storage.local.set({ _lastCsvExportAt: now });

  const data = await chrome.storage.local.get([
    'connections', 'postInteractions', 'relationships', 'activityLog', 'ssiScores',
    'discoveredLinks', 'acceptedConnections', 'extractedEmails',
  ]);
  const ts = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');

  const HEADERS = ['Category', 'Date', 'Type', 'Name', 'Detail', 'URL'];
  const rows = [];

  for (const c of (data.connections || [])) {
    rows.push(['Connection', c.sentAt || '', 'connection-sent', c.name || c.profileId || '', c.profileId || '', c.profileUrl || `https://www.linkedin.com/in/${c.profileId}/`]);
  }

  for (const p of (data.postInteractions || [])) {
    rows.push(['Post', p.interactedAt || '', p.action || 'like', '', p.postId || '', p.postUrl || '']);
  }

  for (const r of (data.relationships || [])) {
    rows.push(['Relationship', r.touchedAt || '', r.eventType || '', r.name || r.profileId || '', r.messageSent || '', r.profileUrl || `https://www.linkedin.com/in/${r.profileId}/`]);
  }

  for (const e of [...(data.activityLog || [])]) {
    rows.push(['Log', e.ts || '', e.level || 'info', e.script || '', e.msg || '', '']);
  }

  for (const s of (data.ssiScores || [])) {
    const detail = `total:${s.total ?? '?'} brand:${s.brand ?? '?'} people:${s.people ?? '?'} insights:${s.insights ?? '?'} rel:${s.relationships ?? '?'}`;
    rows.push(['SSI', s.capturedAt || s.date || '', 'ssi-score', '', detail, '']);
  }

  for (const a of (data.acceptedConnections || [])) {
    rows.push(['AcceptedConn', a.acceptedAt || '', 'accepted', a.name || '', a.followUpSent ? 'follow-up-sent' : 'pending', a.profileUrl || `https://www.linkedin.com/in/${a.profileId}/`]);
  }

  for (const em of (data.extractedEmails || [])) {
    rows.push(['Email', em.foundAt || '', 'email-found', em.email || '', em.postId || '', em.postUrl || '']);
  }

  for (const l of (data.discoveredLinks || [])) {
    rows.push(['Link', l.ts || '', 'link-discovered', l.context || '', l.name || '', l.url || '']);
  }

  // Sort all rows chronologically (column index 1 = Date)
  rows.sort((a, b) => new Date(b[1]) - new Date(a[1]));

  downloadCsvFromSW(`activity-history-${ts}.csv`, HEADERS, rows);

  // Export a plain-text file with only /in/ profile URLs for manual review
  const profileUrls = [...new Set(
    (data.discoveredLinks || []).map(l => l.url).filter(u => u && u.includes('/in/'))
  )];
  if (profileUrls.length) downloadLinksTxt(profileUrls, ts);

  const counts = {
    links: (data.discoveredLinks || []).length,
    accepted: (data.acceptedConnections || []).length,
    emails: (data.extractedEmails || []).length,
    logs: (data.activityLog || []).length,
  };
  await log(
    `Auto-CSV export complete — ${counts.links} links, ${counts.accepted} accepted, ${counts.emails} emails, ${counts.logs} log entries → Downloads/link_ssi/output/`,
    'success'
  );
}
// ─── Sequential message-queue processor ──────────────────────────────────────

/**
 * Builds an auto message queue from newly discovered /in/ profile URLs
 * (profiles not yet messaged), saves to storage, and processes sequentially.
 * Called automatically at the end of each daily run and on demand from the popup.
 */
async function buildAndRunAutoMessageQueue() {
  const { discoveredLinks = [], messagedProfiles = [] } = await chrome.storage.local.get(
    ['discoveredLinks', 'messagedProfiles']
  );

  const alreadyMessaged = new Set(messagedProfiles);
  const seen = new Set();
  const queue = [];

  for (const l of discoveredLinks) {
    if (!l.url || !l.url.includes('/in/')) continue;
    const m = l.url.match(/\/in\/([^/?#]+)/);
    const pid = m ? m[1] : null;
    if (!pid || alreadyMessaged.has(pid) || seen.has(pid)) continue;
    seen.add(pid);
    queue.push({ url: l.url.split('?')[0], profileId: pid, name: l.name || '', status: 'pending', addedAt: new Date().toISOString() });
    if (queue.length >= MESSAGE_CAP_PER_RUN) break;
  }

  if (!queue.length) {
    await log('📨 auto-message: no new profiles to message — all already sent or queue empty');
    return;
  }

  await log(`📨 auto-message: queuing ${queue.length} new profile(s)…`);
  await chrome.storage.local.set({ messageQueue: queue });
  await processMessageQueue();
}

/**
 * Processes messageQueue from storage one by one.
 * For each pending entry, opens a messaging/compose tab, sends the intro
 * message via profile-messenger.js, then persists the sent profileId to
 * messagedProfiles to prevent duplicate sends on future runs.
 */
async function processMessageQueue() {
  const { messageQueue = [] } = await chrome.storage.local.get('messageQueue');
  const items = messageQueue.filter(m => m.status === 'pending');

  await log(`📨 message queue — processing ${items.length} profiles`);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Reload queue before updating (another caller may have modified it)
    const { messageQueue: mq = [] } = await chrome.storage.local.get('messageQueue');
    const idx = mq.findIndex(m => m.url === item.url && m.status === 'pending');
    if (idx === -1) continue;

    mq[idx].status = 'running';
    await chrome.storage.local.set({ messageQueue: mq });

    const composeUrl = item.profileId
      ? `https://www.linkedin.com/messaging/compose/?recipient=${item.profileId}`
      : item.url;

    const responded = await openTabAndWait(composeUrl, 'profile-messenger', {}, 90_000);

    const { messageQueue: mq2 = [] } = await chrome.storage.local.get('messageQueue');
    const idx2 = mq2.findIndex(m => m.url === item.url);
    if (idx2 !== -1) {
      mq2[idx2].status = responded ? 'sent' : 'failed';
      mq2[idx2].processedAt = new Date().toISOString();
      await chrome.storage.local.set({ messageQueue: mq2 });
    }

    // Persist to messagedProfiles so this profile is never messaged again
    if (responded && item.profileId) {
      const { messagedProfiles = [] } = await chrome.storage.local.get('messagedProfiles');
      if (!messagedProfiles.includes(item.profileId)) {
        messagedProfiles.push(item.profileId);
        await chrome.storage.local.set({ messagedProfiles });
      }
    }

    await log(`${responded ? '✓' : '✗'} message ${responded ? 'sent' : 'FAILED'}: ${item.url}`);

    // Human pause between messages: 20-40 s (avoid DM rate limits)
    if (i < items.length - 1) {
      await new Promise(r => setTimeout(r, 20000 + Math.random() * 20000));
    }
  }

  const { messageQueue: final = [] } = await chrome.storage.local.get('messageQueue');
  const sentCount = final.filter(m => m.status === 'sent').length;
  await log(`■ message queue done — ${sentCount}/${final.length} sent`, 'success');
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
      const { routineRunning } = await chrome.storage.local.get('routineRunning');
      if (routineRunning) {
        sendResponse({ alreadyRunning: true });
        return;
      }
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

      if (task === 'post-queue') {
        await processSpecificPostQueue();
        await log('[Manual] Post queue task complete.', 'success');
        sendResponse({ done: true });
        return;
      }

      const url = task === 'recruiter-prospector'
        ? await buildSearchUrl(TARGET_WINDOWS.US_EU)
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

  if (message.action === 'COMMENT_POST') {
    const { postUrl, commentTemplate } = message;
    if (!postUrl || !postUrl.startsWith('https://www.linkedin.com/')) {
      sendResponse({ error: 'Invalid LinkedIn URL' });
      return true;
    }
    log(`[Manual] Comment queued for: ${postUrl}`, 'warn').then(async () => {
      await openTabAndWait(postUrl, 'post-engager', { singlePost: true, commentTemplate: commentTemplate || null });
      await log(`[Manual] Comment task complete for: ${postUrl}`, 'success');
      sendResponse({ done: true });
    }).catch(async (err) => {
      await log(`[Manual] COMMENT_POST error: ${err.message}`, 'error');
      sendResponse({ error: err.message });
    });
    return true;
  }

  if (message.action === 'QUEUE_POST') {
    const { postUrl } = message;
    if (!postUrl || !postUrl.startsWith('https://www.linkedin.com/')) {
      sendResponse({ error: 'Invalid LinkedIn URL' });
      return true;
    }
    chrome.storage.local.get('specificPostQueue').then(async ({ specificPostQueue = [] }) => {
      const alreadyQueued = specificPostQueue.some(e => e.url === postUrl);
      if (alreadyQueued) {
        sendResponse({ queued: false, reason: 'already in queue' });
        return;
      }
      specificPostQueue.push({ url: postUrl, addedAt: new Date().toISOString(), done: false });
      await chrome.storage.local.set({ specificPostQueue });
      await log(`[PostQueue] Queued: ${postUrl}`, 'success');
      sendResponse({ queued: true, total: specificPostQueue.filter(e => !e.done).length });
    }).catch(async (err) => {
      await log(`[PostQueue] QUEUE_POST error: ${err.message}`, 'error');
      sendResponse({ error: err.message });
    });
    return true;
  }

  if (message.action === 'GET_POST_QUEUE') {
    chrome.storage.local.get('specificPostQueue').then(({ specificPostQueue = [] }) => {
      sendResponse({ queue: specificPostQueue });
    });
    return true;
  }

  if (message.action === 'CLEAR_POST_QUEUE') {
    chrome.storage.local.set({ specificPostQueue: [] }).then(() => {
      sendResponse({ cleared: true });
    });
    return true;
  }

  if (message.action === 'SCHEDULE_ALARMS') {
    scheduleAlarms();
    log('Alarms rescheduled via popup.', 'info');
    sendResponse({ scheduled: true });
    return true;
  }

  if (message.action === 'SCHEDULE_INTERVAL') {
    const { minutes } = message;
    chrome.alarms.clear(ALARM_NAMES.INTERVAL, () => {
      if (minutes > 0) {
        chrome.alarms.create(ALARM_NAMES.INTERVAL, {
          delayInMinutes: minutes,
          periodInMinutes: minutes,
        });
        chrome.storage.local.set({ intervalMinutes: minutes });
        log(`[Interval] Scheduled every ${minutes} min.`, 'success');
        sendResponse({ scheduled: true, minutes });
      } else {
        chrome.storage.local.remove('intervalMinutes');
        log('[Interval] Interval schedule cleared.', 'info');
        sendResponse({ scheduled: false });
      }
    });
    return true;
  }

  if (message.action === 'GET_INTERVAL') {
    chrome.alarms.get(ALARM_NAMES.INTERVAL, (alarm) => {
      sendResponse({ alarm: alarm ?? null });
    });
    return true;
  }

  // ─── Links export ───────────────────────────────────────────────────────────
  if (message.action === 'EXPORT_LINKS') {
    chrome.storage.local.get('discoveredLinks').then(({ discoveredLinks = [] }) => {
      const profileUrls = [...new Set(
        discoveredLinks.map(l => l.url).filter(u => u && u.includes('/in/'))
      )];
      const ts = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
      downloadLinksTxt(profileUrls, ts);
      sendResponse({ exported: profileUrls.length });
    });
    return true;
  }

  // ─── Auto message sender (popup "Send Messages Now" button) ────────────────
  if (message.action === 'AUTO_SEND_MESSAGES') {
    buildAndRunAutoMessageQueue()
      .then(() => sendResponse({ started: true }))
      .catch(async (err) => {
        await log(`[AUTO_SEND_MESSAGES] error: ${err.message}`, 'error');
        sendResponse({ error: err.message });
      });
    return true;
  }
});
