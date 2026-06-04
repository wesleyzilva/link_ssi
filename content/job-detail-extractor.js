/**
 * job-detail-extractor.js — Content script for /jobs/view/{id}
 *
 * Triggered by the service worker after job-collector. For each unprocessed job,
 * the SW opens the job URL and sends { action:'START', task:'job-detail' }.
 *
 * Extracts:
 *  - Recruiter / hiring team (name, headline, profile URL)
 *  - Emails inside the job description (regex)
 *  - External apply URL (when present)
 *  - Workplace type (remote/hybrid/onsite), seniority, employment type if visible
 *  - Short description snippet (first 500 chars)
 *
 * Then calls markJobProcessed(jobId, {...}) so the job won't be re-opened.
 * Recruiter + any emails are also saved as leads with context "from-job".
 *
 * Read-only: never clicks Apply, never opens recruiter profile here (the
 * lead-extractor will catch the recruiter when its profile is later opened
 * through the lead-processing loop).
 */

// utils/human-mimicry.js + utils/db.js injected before this script

const JD_EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JD_EMAIL_BLOCK = /@(linkedin\.com|example\.com|email\.com|domain\.com|test\.com|sentry\.io)$/i;

async function jdLog(msg, level = 'info') {
  console[level === 'error' ? 'error' : 'log']('[Job Detail]', msg);
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push({ ts: new Date().toISOString(), level, script: 'job-detail', msg });
    await chrome.storage.local.set({ activityLog: activityLog.slice(-500) });
  } catch { /* ignore */ }
}

function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

function extractJobIdFromUrl() {
  const m = window.location.href.match(/\/jobs\/view\/(\d+)/);
  return m ? m[1] : null;
}

async function waitFor(selector, maxWait = 15000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const el = document.querySelector(selector);
    if (el) return el;
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START' && message.task === 'job-detail') {
    jdLog('▶ START job-detail').then(() => extractDetails()).then(r => {
      sendResponse({ success: true, ...r });
    }).catch(err => {
      jdLog(`✗ fatal: ${err.message}`, 'error');
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

async function extractDetails() {
  const jobId = extractJobIdFromUrl();
  if (!jobId) {
    await jdLog('⚠ no jobId in URL — abort', 'warn');
    return { skipped: true };
  }

  await randomWait(3000, 6000);

  // Wait for the description block to be rendered
  await waitFor(
    '.jobs-description-content, .jobs-description, .show-more-less-html__markup',
    15000
  );

  // Click "Show more" if present so we capture the full description text
  try {
    const showMore = document.querySelector(
      'button.jobs-description__footer-button, button.show-more-less-html__button--more'
    );
    if (showMore) {
      await humanClick(showMore);
      await randomWait(800, 1800);
    }
  } catch { /* ignore */ }

  // ─── Description ──────────────────────────────────────────────────────────
  const descEl =
    document.querySelector('.jobs-description-content__text') ||
    document.querySelector('.jobs-description__container') ||
    document.querySelector('.show-more-less-html__markup') ||
    document.querySelector('.jobs-description');
  const descriptionText = clean(descEl?.innerText || descEl?.textContent || '');

  // ─── Emails inside description ────────────────────────────────────────────
  const emails = Array.from(new Set(
    (descriptionText.match(JD_EMAIL_REGEX) || []).map(s => s.toLowerCase())
  )).filter(e => !JD_EMAIL_BLOCK.test(e));

  // ─── Recruiter / hiring team ──────────────────────────────────────────────
  // Several layouts exist; try all
  const hirerCard =
    document.querySelector('.hirer-card__hirer-information') ||
    document.querySelector('.jobs-poster__name') ||
    document.querySelector('.job-details-people-who-can-help-section') ||
    document.querySelector('[data-test-id="hirer-card"]');

  let recruiter = null;
  if (hirerCard) {
    const link =
      hirerCard.querySelector('a[href*="/in/"]') ||
      hirerCard.closest('section')?.querySelector('a[href*="/in/"]');
    const nameEl =
      hirerCard.querySelector('.hirer-card__hirer-information-name') ||
      hirerCard.querySelector('strong') ||
      link;
    const headlineEl =
      hirerCard.querySelector('.hirer-card__hirer-job-title') ||
      hirerCard.querySelector('.t-12') ||
      hirerCard.querySelector('.hirer-card__hirer-information ~ *');
    recruiter = {
      name: clean(nameEl?.textContent),
      headline: clean(headlineEl?.textContent),
      profileUrl: link ? link.href.split('?')[0] : '',
    };
  }

  // ─── External apply URL ───────────────────────────────────────────────────
  const externalApply =
    document.querySelector('a.jobs-apply-button[href*="://"]:not([href*="linkedin.com"])') ||
    document.querySelector('.jobs-apply-button[data-job-url]');
  const externalApplyUrl = externalApply
    ? (externalApply.getAttribute('href') || externalApply.getAttribute('data-job-url') || '')
    : '';

  // ─── Workplace / seniority / employment type ──────────────────────────────
  const insights = clean(
    document.querySelector('.job-details-jobs-unified-top-card__job-insight')?.textContent ||
    document.querySelector('.jobs-unified-top-card__workplace-type')?.textContent || ''
  );

  // ─── Persist into the job record ──────────────────────────────────────────
  const details = {
    description: descriptionText.slice(0, 4000),
    descriptionSnippet: descriptionText.slice(0, 500),
    emails,
    recruiter,
    externalApplyUrl,
    insights,
  };
  const changed = await markJobProcessed(jobId, details);

  // ─── Surface emails + recruiter as leads (with backref to the job) ────────
  let leadsAdded = 0;
  for (const email of emails) {
    const ok = await saveLead({
      email,
      name: recruiter?.name || '',
      context: 'from-job-description',
      snippet: descriptionText.slice(0, 300),
      sourceUrl: window.location.href.split('?')[0],
      jobId,
    });
    if (ok) leadsAdded++;
  }
  if (recruiter && recruiter.profileUrl) {
    const ok = await saveLead({
      email: '',
      name: recruiter.name,
      context: 'from-job-recruiter',
      snippet: `${recruiter.headline || ''} | ${descriptionText.slice(0, 200)}`,
      sourceUrl: recruiter.profileUrl,
      jobId,
    });
    if (ok) leadsAdded++;
  }

  await jdLog(
    `■ jobId=${jobId} processed=${changed} | recruiter=${recruiter?.name || '—'} | emails=${emails.length} | leads+${leadsAdded} | extApply=${externalApplyUrl ? 'yes' : 'no'}`,
    'success'
  );

  try { await chrome.runtime.sendMessage({ action: 'EXPORT_LOGS' }); } catch {}

  return { jobId, emailsFound: emails.length, recruiter, leadsAdded, externalApplyUrl };
}
