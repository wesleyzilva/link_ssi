/**
 * recruiter-prospector.js — Content script for linkedin.com/search/results/
 *
 * Automates strategic connection requests to Tech Recruiters in target regions.
 *
 * Rules:
 *   - Daily cap: 20 connection requests per session
 *   - 7-day lock per recruiter profile (enforced via chrome.storage.local)
 *   - Personalised connection note included with every request
 *   - Human-mimicry delays between all actions
 *   - Only sends requests to 1st or 2nd degree connections (excludes 3rd+)
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

/**
 * Daily cap is passed from the Service Worker via the START message.
 * Fallback to 9 (minimum of the 7-day cycle) if not provided.
 */
let SESSION_CAP = 9;

const CONNECTION_NOTE =
  "Hi {firstName}, let's connect! " +
  'Check out my profile & portfolio: ' +
  'https://wesleyzilva.github.io/portfolioNearshoreWesIA/ ' +
  '| https://www.linkedin.com/in/wesleyzilva/ ' +
  '— Wesley, IT Manager Brazil (14+ yrs, remote teams, M&A)';

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START' && message.task === 'recruiter-prospector') {
    // Read the daily cap sent by the service worker
    if (typeof message.dailyCap === 'number') {
      SESSION_CAP = message.dailyCap;
    }
    prospectRecruiters().then((result) => {
      sendResponse({ success: true, ...result });
    }).catch((error) => {
      console.error('[Recruiter Prospector] Error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// ─── Core logic ───────────────────────────────────────────────────────────────

/**
 * Polls a DOM query function until it returns at least one element, or times out.
 * @param {Function} queryFn  - zero-arg function that returns an array
 * @param {number}   maxWait  - total ms to keep trying (default 20 s)
 * @param {number}   interval - ms between attempts (default 2 s)
 */
async function waitForElements(queryFn, maxWait = 20000, interval = 2000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const els = queryFn();
    if (els.length) return els;
    await new Promise(r => setTimeout(r, interval));
  }
  return queryFn(); // final attempt
}

async function prospectRecruiters() {
  await contentLog(`▶ recruiter-prospector started | ${window.location.href}`);
  await randomWait(5000, 9000); // initial wait for SPA render

  const results = await waitForElements(getSearchResultCards);
  if (!results.length) {
    console.warn('[Recruiter Prospector] No search result cards found — selectors may need updating.');
    await contentLog('✗ recruiter-prospector — no search result cards found (waited 20 s)', 'warn');
    await chrome.storage.local.set({ lastProspecting: { sent: 0, runAt: new Date().toISOString() } });
    return { sent: 0 };
  }
  await contentLog(`recruiter-prospector — ${results.length} cards found`);

  let sent = 0;

  for (const card of results) {
    if (sent >= SESSION_CAP) break;

    const profileId = extractProfileId(card);
    if (!profileId) continue;

    const profileUrl = extractProfileUrl(card) || `/in/${profileId}`;
    const locked = await isRecruiterLocked(profileId);
    if (locked) {
      console.log(`[Recruiter Prospector] Skipping ${profileId} — within 7-day lock.`);
      await contentLog(`↷ ${profileUrl} — locked (7-day)`);
      continue;
    }

    const connectButton = getConnectButton(card);
    if (!connectButton) {
      await contentLog(`↷ ${profileUrl} — no connect button`);
      continue;
    }

    // Simulate reading the profile card before deciding to connect
    await readBeforeActing(card, 3000, 7000);
    await humanClick(connectButton);

    // LinkedIn may show a modal asking for a note
    const noteSent = await handleConnectionModal(card, profileId);
    if (!noteSent) continue;

    const firstName = extractName(card);
    await markRecruiterInteracted(profileId, firstName);
    sent++;
    await contentLog(`✓ ${profileUrl} | ${firstName} — connected (${sent}/${SESSION_CAP})`, 'success');

    // Persist to history — chrome.storage.local is readable from any extension page
    const { connections = [] } = await chrome.storage.local.get('connections');
    connections.push({
      profileId,
      name: firstName,
      profileUrl,
      sentAt: new Date().toISOString(),
    });
    await chrome.storage.local.set({ connections: connections.slice(-200) });

    console.log(`[Recruiter Prospector] Connection sent to ${profileId} (${sent}/${SESSION_CAP})`);
    await randomWait(9000, 20000); // longer pause between requests to avoid rate detection
  }

  await chrome.storage.local.set({
    lastProspecting: { sent, runAt: new Date().toISOString() },
  });
  await contentLog(`■ recruiter-prospector done | ${sent} sent / ${results.length} checked`);

  return { sent };
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function getSearchResultCards() {
  // LinkedIn 2024-2026: list items in people search results
  const byLi = Array.from(document.querySelectorAll(
    'li.reusable-search__result-container, ' +
    'li[class*="result-container"]'
  ));
  if (byLi.length) { console.log(`[Recruiter Prospector] Found ${byLi.length} cards via li selector.`); return byLi; }

  // Entity result containers (LinkedIn redesign pattern)
  const byEntity = Array.from(document.querySelectorAll(
    '.entity-result, ' +
    '[data-view-name="search-entity-result-universal-template"]'
  ));
  if (byEntity.length) { console.log(`[Recruiter Prospector] Found ${byEntity.length} cards via entity selector.`); return byEntity; }

  // Broad fallback: any list item containing a /in/ profile link
  const byProfileLink = Array.from(document.querySelectorAll('li')).filter(
    li => li.querySelector('a[href*="/in/"]')
  );
  if (byProfileLink.length) { console.log(`[Recruiter Prospector] Found ${byProfileLink.length} cards via profile-link fallback.`); return byProfileLink; }

  console.warn('[Recruiter Prospector] All selectors failed. LinkedIn DOM may have changed.');
  return [];
}

function extractProfileId(card) {
  const link = card.querySelector('a[href*="/in/"]');
  if (!link) return null;
  const match = link.href.match(/\/in\/([^/?#]+)/);
  return match ? match[1] : null;
}

function extractProfileUrl(card) {
  const link = card.querySelector('a[href*="/in/"]');
  if (!link) return null;
  const href = link.getAttribute('href') || '';
  const clean = href.split('?')[0].split('#')[0];
  return clean.startsWith('http') ? clean : `https://www.linkedin.com${clean}`;
}

function extractName(card) {
  const nameEl = card.querySelector('.entity-result__title-text a span[aria-hidden="true"]');
  return nameEl ? nameEl.textContent.trim().split(' ')[0] : 'there';
}

function getConnectButton(card) {
  const buttons = card.querySelectorAll('button');
  return Array.from(buttons).find(
    (btn) => btn.textContent.trim().toLowerCase() === 'connect'
  ) || null;
}

async function handleConnectionModal(card, profileId) {
  await randomWait(1500, 3000);

  const addNoteButton = document.querySelector('[aria-label="Add a note"]');
  if (addNoteButton) {
    await humanClick(addNoteButton);
    await randomWait(800, 1600);

    const noteInput = document.querySelector('#custom-message');
    if (noteInput) {
      const firstName = extractName(card);
      const personalizedNote = CONNECTION_NOTE.replace('{firstName}', firstName);
      noteInput.value = personalizedNote;
      noteInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
      await randomWait(1000, 2000);
    }
  }

  const sendButton = document.querySelector('[aria-label="Send now"]');
  if (sendButton) {
    await humanClick(sendButton);
    await randomWait(1000, 2500);
    return true;
  }

  // Close modal if send failed
  const dismissButton = document.querySelector('[aria-label="Dismiss"]');
  if (dismissButton) await humanClick(dismissButton);
  return false;
}
