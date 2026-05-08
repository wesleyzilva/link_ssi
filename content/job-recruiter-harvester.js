/**
 * job-recruiter-harvester.js — Content script for linkedin.com/jobs/search/
 *
 * For each job card on the page:
 *   1. Click the card to open the detail panel
 *   2. Wait for the "Meet the hiring team" section to render
 *   3. Extract the recruiter name + /in/ profile URL
 *   4. Save to chrome.storage.local under:
 *       - discoveredLinks  (same format used by auto-message queue)
 *       - jobRecruiters    (dedicated key — popup reads this for display)
 *   5. Advance to the next results page and repeat
 *
 * Daily cap: none (harvest-only, no connection requests)
 * Anti-duplication: skips profileIds already in jobRecruiters
 * Human-mimicry: every click/scroll goes through randomWait + scrollIntoViewAndPause
 */

// utils/human-mimicry.js and utils/db.js are injected before this script

// ─── Logger ───────────────────────────────────────────────────────────────────

async function contentLog(msg, level = 'info') {
  const entry = { ts: new Date().toISOString(), level, script: 'job-recruiter-harvester', msg };
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[Job Harvester]', msg);
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push(entry);
    await chrome.storage.local.set({ activityLog: activityLog.slice(-500) });
  } catch (e) { console.warn('[contentLog]', e); }
}

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START' && message.task === 'job-recruiter-harvester') {
    harvestJobRecruiters().then(result => {
      sendResponse({ success: true, ...result });
    }).catch(err => {
      contentLog(`✗ fatal: ${err.message}`, 'error');
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

// ─── DOM helpers ──────────────────────────────────────────────────────────────

/**
 * Waits for a DOM query to return at least one element, or times out.
 */
async function waitForElements(queryFn, maxWait = 20000, interval = 1500) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const els = queryFn();
    if (els.length) return els;
    await new Promise(r => setTimeout(r, interval));
  }
  return queryFn();
}

/**
 * Extracts the bare /in/ slug from a LinkedIn profile URL.
 * Returns null if the URL is not a valid profile URL.
 */
function extractProfileId(href) {
  if (!href) return null;
  const m = href.match(/linkedin\.com\/in\/([^/?#]+)/);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Resolves an absolute LinkedIn URL from a potentially relative href.
 */
function absoluteUrl(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href.split('?')[0];
  return 'https://www.linkedin.com' + href.split('?')[0];
}

// ─── Job card list ────────────────────────────────────────────────────────────

/**
 * Returns all visible job cards in the left-panel list.
 * Multiple fallback selectors — LinkedIn changes classes frequently.
 */
function getJobCards() {
  const selectors = [
    'li.jobs-search-results__list-item',
    'li[data-occludable-entity-urn]',
    '.job-card-container',
    'li.scaffold-layout__list-item',
  ];
  for (const sel of selectors) {
    const els = Array.from(document.querySelectorAll(sel));
    if (els.length) return els;
  }
  return [];
}

/**
 * Returns the clickable anchor/button inside a job card.
 */
function getJobCardLink(card) {
  return (
    card.querySelector('a.job-card-container__link') ||
    card.querySelector('a[href*="/jobs/view/"]') ||
    card.querySelector('.job-card-list__title') ||
    card.querySelector('a[data-control-name="job_card_title"]') ||
    card.querySelector('a')
  );
}

// ─── Hiring team extraction ───────────────────────────────────────────────────

/**
 * Waits for the job detail panel to render after clicking a job card.
 * Returns the detail panel element, or null on timeout.
 */
async function waitForDetailPanel(maxWait = 18000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const panel =
      document.querySelector('.jobs-unified-top-card') ||
      document.querySelector('.job-view-layout') ||
      document.querySelector('.jobs-details__main-content') ||
      document.querySelector('[data-job-id]') ||
      document.querySelector('.jobs-search__job-details--container');
    if (panel) return panel;
    await new Promise(r => setTimeout(r, 1200));
  }
  return null;
}

/**
 * Finds the "Meet the hiring team" section inside the detail panel.
 * Returns the section element or null if not present.
 */
function findHiringTeamSection() {
  // Try explicit aria-label
  const byAria =
    document.querySelector('[aria-label*="hiring team" i]') ||
    document.querySelector('[aria-label*="equipe de contratação" i]');
  if (byAria) return byAria;

  // Try heading text scan
  const headings = Array.from(
    document.querySelectorAll('h2, h3, h4, .artdeco-card h2, .artdeco-card h3')
  );
  for (const h of headings) {
    const text = h.textContent.trim().toLowerCase();
    if (
      text.includes('meet the hiring') ||
      text.includes('hiring team') ||
      text.includes('equipe de contrata')
    ) {
      // Walk up to the containing section/div
      let el = h.parentElement;
      for (let i = 0; i < 4 && el; i++) {
        const link = el.querySelector('a[href*="/in/"]');
        if (link) return el;
        el = el.parentElement;
      }
    }
  }

  // Fallback: look for hirer-card class patterns
  const hirerCard =
    document.querySelector('.hirer-card__container') ||
    document.querySelector('.hiring-team') ||
    document.querySelector('[class*="hirer-card"]') ||
    document.querySelector('[class*="hiring-team"]') ||
    document.querySelector('.jobs-poster__profile-container');
  return hirerCard || null;
}

/**
 * Extracts recruiter entries from a hiring-team section element.
 * Returns an array of { name, profileUrl, profileId }.
 */
function extractRecruitersFromSection(section) {
  if (!section) return [];
  const results = [];

  const links = Array.from(section.querySelectorAll('a[href*="/in/"]'));
  for (const link of links) {
    const href = link.getAttribute('href');
    const profileId = extractProfileId(href);
    if (!profileId) continue;

    const profileUrl = absoluteUrl(href);

    // Extract name: try image alt, then aria-label, then link text
    const img = link.querySelector('img');
    const imgAlt = img ? img.getAttribute('alt') : null;
    const ariaLabel = link.getAttribute('aria-label');
    const textContent = link.textContent.trim();

    const name = imgAlt || ariaLabel || textContent || profileId;

    results.push({ name: name.trim(), profileUrl, profileId });
  }

  return results;
}

// ─── Email extraction ─────────────────────────────────────────────────────────

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// Domains that are LinkedIn system/no-reply addresses — not worth collecting
const EMAIL_BLOCKLIST = ['linkedin.com', 'licdn.com'];

/**
 * Finds the "About the job" / job description section in the detail panel
 * and extracts any email addresses from its text content.
 */
function extractEmailsFromPanel(jobUrl) {
  const descSelectors = [
    '.jobs-description-content__text',
    '.job-details-module',
    '.jobs-description__content',
    '[class*="jobs-description"]',
    '[class*="job-description"]',
    '.description__text',
    '.show-more-less-html__markup',
    '#job-details',
    'article.jobs-description',
  ];

  let text = '';
  for (const sel of descSelectors) {
    const el = document.querySelector(sel);
    if (el) { text = el.innerText || el.textContent || ''; break; }
  }

  if (!text) return [];

  const matches = text.match(EMAIL_REGEX) || [];
  const unique = [...new Set(matches)].filter(e => {
    const domain = e.split('@')[1]?.toLowerCase() ?? '';
    return !EMAIL_BLOCKLIST.some(bl => domain.endsWith(bl));
  });

  return unique.map(email => ({
    email,
    postUrl: jobUrl,
    postId: jobUrl.match(/currentJobId=(\d+)/)?.[1] || '',
    foundAt: new Date().toISOString(),
  }));
}

/**
 * Saves extracted email entries to `extractedEmails` storage key.
 * Returns the count of genuinely new emails saved.
 */
async function saveEmails(emailEntries) {
  if (!emailEntries.length) return 0;
  const { extractedEmails = [] } = await chrome.storage.local.get('extractedEmails');
  const existingSet = new Set(extractedEmails.map(e => e.email));
  const newEntries = emailEntries.filter(e => !existingSet.has(e.email));
  if (!newEntries.length) return 0;
  const updated = [...extractedEmails, ...newEntries].slice(-500);
  await chrome.storage.local.set({ extractedEmails: updated });
  return newEntries.length;
}

// ─── Persistence ─────────────────────────────────────────────────────────────

/**
 * Saves harvested recruiters to both storage keys.
 * Deduplicates by profileId. Marks the entry with the source job URL.
 * Returns { newCount, newProfileUrls[] }.
 */
async function saveRecruiters(recruiters, jobUrl) {
  if (!recruiters.length) return { newCount: 0, newProfileUrls: [] };

  const { jobRecruiters = {}, discoveredLinks = [] } = await chrome.storage.local.get([
    'jobRecruiters',
    'discoveredLinks',
  ]);

  const existingDiscoveredIds = new Set(
    discoveredLinks
      .map(l => extractProfileId(l.url))
      .filter(Boolean)
  );

  let newCount = 0;
  const newProfileUrls = [];

  for (const r of recruiters) {
    if (jobRecruiters[r.profileId]) continue; // already harvested

    // ── jobRecruiters (dedicated key for display) ──
    jobRecruiters[r.profileId] = {
      name: r.name,
      profileUrl: r.profileUrl,
      foundAt: new Date().toISOString(),
      sourceJobUrl: jobUrl,
      messageSent: false,
    };

    // ── discoveredLinks (feeds the auto-message queue) ──
    if (!existingDiscoveredIds.has(r.profileId)) {
      discoveredLinks.push({
        url: r.profileUrl,
        name: r.name,
        context: 'job-recruiter-harvest',
        ts: new Date().toISOString(),
      });
      existingDiscoveredIds.add(r.profileId);
    }

    newProfileUrls.push(r.profileUrl);
    newCount++;
  }

  // Cap discoveredLinks at 1000
  const trimmed = discoveredLinks.slice(-1000);

  await chrome.storage.local.set({ jobRecruiters, discoveredLinks: trimmed });
  return { newCount, newProfileUrls };
}

// ─── Pagination ───────────────────────────────────────────────────────────────

/**
 * Clicks the "Next" pagination button if present.
 * Returns true if navigation was triggered.
 */
async function goToNextPage() {
  const nextBtn =
    document.querySelector('button[aria-label="View next page"]') ||
    document.querySelector('button[aria-label="Próxima página"]') ||
    Array.from(document.querySelectorAll('button')).find(b => {
      const lbl = (b.getAttribute('aria-label') || '').toLowerCase();
      return lbl === 'view next page' || lbl === 'next' || lbl === 'próxima página';
    });

  if (!nextBtn || nextBtn.disabled) return false;

  await scrollIntoViewAndPause(nextBtn);
  await humanClick(nextBtn);
  await randomWait(4000, 8000);
  return true;
}

// ─── Core harvester ───────────────────────────────────────────────────────────

async function harvestJobRecruiters() {
  await contentLog(`▶ job-recruiter-harvester started | ${window.location.href}`);
  await randomWait(3000, 6000);

  let totalHarvested = 0;
  let totalEmailsFound = 0;
  let totalJobsProcessed = 0;
  const allNewProfileUrls = [];
  let page = 1;
  const MAX_PAGES = 20; // safety cap — harvester stops earlier if goToNextPage() returns false

  while (page <= MAX_PAGES) {
    await contentLog(`📄 Processing page ${page}…`);

    // Wait for job cards to appear
    const cards = await waitForElements(getJobCards, 20000, 1500);
    if (!cards.length) {
      await contentLog(`⚠ No job cards found on page ${page} — stopping.`, 'warn');
      break;
    }

    await contentLog(`Found ${cards.length} job cards on page ${page}`);

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const link = getJobCardLink(card);
      if (!link) {
        await contentLog(`  · Card ${i + 1}: no clickable link — skipping`);
        continue;
      }

      const jobUrl = absoluteUrl(link.getAttribute('href')) || window.location.href;

      // Scroll card into view and click it
      await scrollIntoViewAndPause(card);
      await humanClick(link);

      // Wait for the detail panel to load
      await randomWait(2500, 5000);
      const panel = await waitForDetailPanel(18000);
      if (!panel) {
        await contentLog(`  · Card ${i + 1}: detail panel timeout — skipping`, 'warn');
        continue;
      }

      // Give the hiring-team section extra time to lazy-load
      await randomWait(1500, 3000);

      // ── Email extraction (runs on every job, regardless of hiring team) ──
      const emailEntries = extractEmailsFromPanel(jobUrl);
      if (emailEntries.length) {
        const saved = await saveEmails(emailEntries);
        if (saved > 0) {
          totalEmailsFound += saved;
          await contentLog(`  📧 Card ${i + 1}: ${saved} new email(s) found — ${emailEntries.map(e => e.email).join(', ')}`, 'success');
        }
      }

      // ── Recruiter extraction ──
      const section = findHiringTeamSection();
      if (!section) {
        await contentLog(`  · Card ${i + 1}: no "Meet the hiring team" section`);
        totalJobsProcessed++;
        continue;
      }

      const recruiters = extractRecruitersFromSection(section);
      if (!recruiters.length) {
        await contentLog(`  · Card ${i + 1}: hiring section found but no /in/ links`);
        totalJobsProcessed++;
        continue;
      }

      const { newCount, newProfileUrls } = await saveRecruiters(recruiters, jobUrl);
      totalHarvested += newCount;
      allNewProfileUrls.push(...newProfileUrls);
      totalJobsProcessed++;

      if (newCount > 0) {
        const names = recruiters.map(r => r.name).join(', ');
        await contentLog(`  ✓ Card ${i + 1}: saved ${newCount} recruiter(s) — ${names}`, 'success');
      } else {
        await contentLog(`  · Card ${i + 1}: recruiter(s) already in list — skipped`);
      }

      await randomWait(2000, 4000);
    }

    // Try to go to the next page
    const advanced = await goToNextPage();
    if (!advanced) {
      await contentLog('No more pages — harvest complete.', 'success');
      break;
    }

    page++;
    await randomWait(4000, 7000);
  }

  await contentLog(
    `✅ Harvest done — ${totalJobsProcessed} jobs scanned, ${totalHarvested} new recruiter(s) saved, ${totalEmailsFound} email(s) found.`,
    'success'
  );

  // Update summary for popup
  await chrome.storage.local.set({
    lastJobHarvest: {
      jobsScanned: totalJobsProcessed,
      recruitersFound: totalHarvested,
      emailsFound: totalEmailsFound,
      newProfileUrls: allNewProfileUrls,
      completedAt: new Date().toISOString(),
      sourceUrl: window.location.href,
    },
  });

  return { jobsScanned: totalJobsProcessed, recruitersFound: totalHarvested, emailsFound: totalEmailsFound, newProfileUrls: allNewProfileUrls };
}
