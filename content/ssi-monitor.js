/**
 * ssi-monitor.js — Content script for linkedin.com/sales/ssi
 *
 * Captures the 4 SSI pillar scores + total, saves them to chrome.storage.local,
 * and updates the popup state via chrome.storage.local.
 *
 * Triggered by the Service Worker with: { action: 'START', task: 'ssi-monitor' }
 */

// utils/human-mimicry.js and utils/db.js are loaded before this script by the manifest

// ─── Activity logger (inline — content scripts cannot use ES modules) ────────
async function contentLog(msg, level = 'info') {
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push({ ts: new Date().toISOString(), level, msg });
    await chrome.storage.local.set({ activityLog: activityLog.slice(-300) });
  } catch (e) { console.warn('[contentLog]', e); }
}

// ─── Message listener ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START' && message.task === 'ssi-monitor') {
    captureSSIScores().then((scores) => {
      sendResponse({ success: true, scores });
    }).catch((error) => {
      console.error('[SSI Monitor] Failed to capture scores:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // keep message channel open for async response
  }
});

// ─── Core capture logic ───────────────────────────────────────────────────────

async function captureSSIScores() {
  await contentLog(`▶ ssi-monitor started | ${window.location.href}`);
  await randomWait(6000, 10000); // wait longer for LinkedIn SPA to render all score elements

  const scores = extractScoresFromDOM();
  if (!scores) {
    await contentLog('✗ ssi-monitor failed — no SSI elements found in DOM', 'warn');
    // Save a null-state so the popup shows 'unknown' rather than '–' forever
    await chrome.storage.local.set({
      lastSSI: { total: null, brand: null, people: null, insights: null, relationships: null, capturedAt: new Date().toISOString(), error: true },
    });
    throw new Error('Could not find SSI score elements in the DOM.');
  }

  await saveSSIScore(scores);

  await chrome.storage.local.set({
    lastSSI: { ...scores, capturedAt: new Date().toISOString() },
  });

  await contentLog(`■ ssi-monitor done | total:${scores.total} brand:${scores.brand} people:${scores.people} insights:${scores.insights} rel:${scores.relationships}`, 'success');
  console.log('[SSI Monitor] Scores captured and saved:', scores);
  return scores;
}

/**
 * Scrapes the SSI score elements from the Sales Navigator SSI page.
 * LinkedIn may update the DOM; selectors should be validated periodically.
 *
 * Expected structure:
 *   .ssi-score__overall         → total (0–100)
 *   .ssi-score__component       → 4 pillars in order:
 *     1. Professional brand
 *     2. Right people
 *     3. Engage with insights
 *     4. Build relationships
 */
function extractScoresFromDOM() {
  // Strategy 1: official data-test attributes (original LinkedIn SSI page)
  const totalEl = document.querySelector('[data-test-ssi-overall-score]');
  const pillars = document.querySelectorAll('[data-test-ssi-component-score]');
  if (totalEl && pillars.length >= 4) {
    console.log('[SSI Monitor] Scores via data-test attributes.');
    return sanitiseScores({
      total:         parseInt(totalEl.textContent.trim(), 10) || 0,
      brand:         parseInt(pillars[0].textContent.trim(), 10) || 0,
      people:        parseInt(pillars[1].textContent.trim(), 10) || 0,
      insights:      parseInt(pillars[2].textContent.trim(), 10) || 0,
      relationships: parseInt(pillars[3].textContent.trim(), 10) || 0,
    });
  }

  // Strategy 2: class-based (LinkedIn 2022-2024 design)
  const classEls = document.querySelectorAll('.social-selling-index-score__value');
  if (classEls.length >= 5) {
    console.log('[SSI Monitor] Scores via .social-selling-index-score__value.');
    return sanitiseScores({
      total:         parseInt(classEls[0].textContent.trim(), 10) || 0,
      brand:         parseInt(classEls[1].textContent.trim(), 10) || 0,
      people:        parseInt(classEls[2].textContent.trim(), 10) || 0,
      insights:      parseInt(classEls[3].textContent.trim(), 10) || 0,
      relationships: parseInt(classEls[4].textContent.trim(), 10) || 0,
    });
  }

  // Strategy 3: aria-label or data-* on score items (Sales Navigator redesign)
  const ssiItems = document.querySelectorAll('[data-ssi-score], [aria-label*="SSI"], .ssi-index__score-value');
  if (ssiItems.length >= 5) {
    console.log('[SSI Monitor] Scores via ssi-index selector.');
    return sanitiseScores({
      total:         parseInt(ssiItems[0].textContent.trim(), 10) || 0,
      brand:         parseInt(ssiItems[1].textContent.trim(), 10) || 0,
      people:        parseInt(ssiItems[2].textContent.trim(), 10) || 0,
      insights:      parseInt(ssiItems[3].textContent.trim(), 10) || 0,
      relationships: parseInt(ssiItems[4].textContent.trim(), 10) || 0,
    });
  }

  // Strategy 4: broad numeric scan — find all standalone 2-digit numbers on page
  // that look like SSI scores (0–100) in score card containers
  const scoreContainers = document.querySelectorAll(
    '.ssi-score, [class*="ssi-score"], [class*="social-selling"]'
  );
  const nums = Array.from(scoreContainers)
    .map(el => parseInt(el.textContent.trim(), 10))
    .filter(n => !isNaN(n) && n >= 0 && n <= 100);
  if (nums.length >= 5) {
    console.log('[SSI Monitor] Scores via broad numeric scan:', nums);
    return sanitiseScores({ total: nums[0], brand: nums[1], people: nums[2], insights: nums[3], relationships: nums[4] });
  }

  // Log what IS on the page to help debug
  console.warn('[SSI Monitor] All strategies failed. Page title:', document.title);
  console.warn('[SSI Monitor] Body classes:', document.body.className.slice(0, 200));
  return null;
}

/**
 * Validates extracted SSI scores.
 * LinkedIn often shows the total score in multiple DOM containers; when the
 * broad-scan strategy runs, nums[1] (brand) may accidentally capture the total
 * again (e.g., {total:51, brand:51, ...}). Each pillar is max 25, so if brand
 * equals total or exceeds 25 we recalculate it as the residual.
 */
function sanitiseScores({ total, brand, people, insights, relationships }) {
  const isBrandBad = brand === total || brand > 25;
  if (isBrandBad) {
    const recalculated = Math.max(0, total - people - insights - relationships);
    console.warn(`[SSI Monitor] brand:${brand} looks like duplicate of total:${total} — recalculating brand as ${recalculated}`);
    brand = recalculated;
  }
  return { total, brand, people, insights, relationships };
}
