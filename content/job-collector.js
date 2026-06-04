/**
 * job-collector.js — Content script for LinkedIn job search pages
 *
 * Goal: harvest job postings matching Wesley's target roles
 * (Project Manager, Project Delivery, Agile Master, Scrum Master,
 *  Delivery Manager, Program Manager) and save them to chrome.storage.local
 * under the `jobs` store. CSV export is triggered after each run.
 *
 * Pages: https://www.linkedin.com/jobs/search/?keywords=...
 *
 * Each captured job: { jobId, title, company, location, postedAgo, url,
 *                       keyword, capturedAt }
 *
 * Anti-detection: human-mimicry scroll + random wait between cards.
 * No applications, no clicks beyond scrolling — pure read-only harvest.
 */

// utils/human-mimicry.js and utils/db.js injected by manifest before this script

const TARGET_KEYWORDS_PATTERN = /(project\s+manager|project\s+delivery|delivery\s+manager|program\s+manager|agile\s+(master|coach|lead)|scrum\s+master)/i;

const CAP = { maxCardsPerRun: 60 };

// ─── Logger ──────────────────────────────────────────────────────────────────

async function jcLog(msg, level = 'info') {
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[Job Collector]', msg);
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push({ ts: new Date().toISOString(), level, script: 'job-collector', msg });
    await chrome.storage.local.set({ activityLog: activityLog.slice(-500) });
  } catch (e) { /* ignore */ }
}

// ─── Message listener ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START' && message.task === 'job-collector') {
    jcLog(`▶ START | keyword="${message.keyword || '(from url)'}"`).then(() =>
      collectJobs(message.keyword)
    ).then((result) => {
      sendResponse({ success: true, ...result });
    }).catch((err) => {
      jcLog(`✗ fatal: ${err.message}`, 'error');
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

// ─── Core ────────────────────────────────────────────────────────────────────

async function collectJobs(keyword) {
  await jcLog(`▶ job-collector started | url=${window.location.href}`);
  await randomWait(4000, 8000);

  let saved = 0, seen = 0, skipped = 0;
  let scrollRounds = 0;
  const MAX_ROUNDS = 8;
  const seenIds = new Set();

  while (scrollRounds < MAX_ROUNDS && seen < CAP.maxCardsPerRun) {
    const cards = getJobCards();
    if (!cards.length) {
      await jcLog(`⚠ no job cards on round ${scrollRounds + 1}/${MAX_ROUNDS}`, 'warn');
    }

    for (const card of cards) {
      if (seen >= CAP.maxCardsPerRun) break;

      let job;
      try {
        job = extractJobFromCard(card);
      } catch (e) {
        await jcLog(`✗ extract error: ${e.message}`, 'error');
        continue;
      }
      if (!job || !job.jobId || seenIds.has(job.jobId)) continue;
      seenIds.add(job.jobId);
      seen++;

      // Filter by title pattern (PM / Delivery / Agile / Scrum)
      const titleOk = TARGET_KEYWORDS_PATTERN.test(job.title || '');
      if (!titleOk) {
        skipped++;
        continue;
      }

      if (await hasJob(job.jobId)) continue;

      job.keyword = keyword || extractKeywordFromUrl();
      const wasNew = await saveJob(job);
      if (wasNew) {
        saved++;
        await jcLog(`✓ JOB | ${job.title} @ ${job.company} | ${job.location} | ${job.url}`, 'success');
      }
    }

    randomScroll(900, 1800);
    await randomWait(2500, 5000);
    scrollRounds++;
    await jcLog(`↓ scroll ${scrollRounds}/${MAX_ROUNDS} | seen=${seen} saved=${saved} skipped=${skipped}`);
  }

  const summary = {
    seen, saved, skipped,
    keyword: keyword || extractKeywordFromUrl(),
    runAt: new Date().toISOString(),
    url: window.location.href,
  };

  try { await chrome.storage.local.set({ lastJobCollect: summary }); } catch {}

  await jcLog(`■ DONE | seen=${seen} saved=${saved} skipped=${skipped}`, 'success');

  try {
    await chrome.runtime.sendMessage({ action: 'EXPORT_LOGS' });
    await jcLog('📁 CSV export triggered → output/');
  } catch (e) {
    await jcLog(`⚠ CSV export trigger failed: ${e.message}`, 'warn');
  }

  return summary;
}

// ─── DOM extraction ──────────────────────────────────────────────────────────

function getJobCards() {
  // LinkedIn job search has multiple layouts; try all
  const selectors = [
    'li.jobs-search-results__list-item',
    'div.job-card-container',
    'div.base-card[data-entity-urn*="jobPosting"]',
    'div[data-job-id]',
  ];
  const set = new Set();
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach(el => set.add(el));
  }
  return Array.from(set);
}

function extractJobFromCard(card) {
  // jobId from data attribute or URL
  let jobId = card.getAttribute('data-job-id') || '';
  if (!jobId) {
    const urn = card.getAttribute('data-entity-urn') || '';
    const m = urn.match(/(\d{8,})/);
    if (m) jobId = m[1];
  }
  const link = card.querySelector('a[href*="/jobs/view/"]');
  let url = '';
  if (link) {
    url = link.href.split('?')[0];
    if (!jobId) {
      const m = url.match(/\/jobs\/view\/(\d+)/);
      if (m) jobId = m[1];
    }
  }
  if (!jobId) return null;

  const titleEl =
    card.querySelector('.job-card-list__title') ||
    card.querySelector('.job-card-container__link') ||
    card.querySelector('a.base-card__full-link') ||
    link;
  const companyEl =
    card.querySelector('.job-card-container__company-name') ||
    card.querySelector('.artdeco-entity-lockup__subtitle') ||
    card.querySelector('.base-search-card__subtitle');
  const locationEl =
    card.querySelector('.job-card-container__metadata-wrapper') ||
    card.querySelector('.artdeco-entity-lockup__caption') ||
    card.querySelector('.job-search-card__location');
  const postedEl =
    card.querySelector('time') ||
    card.querySelector('.job-search-card__listdate') ||
    card.querySelector('.job-search-card__listdate--new');

  return {
    jobId,
    title: clean(titleEl?.textContent),
    company: clean(companyEl?.textContent),
    location: clean(locationEl?.textContent),
    postedAgo: clean(postedEl?.textContent) || postedEl?.getAttribute?.('datetime') || '',
    url: url || `https://www.linkedin.com/jobs/view/${jobId}/`,
  };
}

function clean(str) {
  return (str || '').replace(/\s+/g, ' ').trim();
}

function extractKeywordFromUrl() {
  try {
    const u = new URL(window.location.href);
    return u.searchParams.get('keywords') || '';
  } catch { return ''; }
}
