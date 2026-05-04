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
  const entry = { ts: new Date().toISOString(), level, script: 'recruiter-prospector', msg };
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[Recruiter Prospector]', msg);
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push(entry);
    await chrome.storage.local.set({ activityLog: activityLog.slice(-300) });
  } catch (e) { console.warn('[contentLog]', e); }
}

/**
 * Daily cap is passed from the Service Worker via the START message.
 * Fallback to 9 (minimum of the 7-day cycle) if not provided.
 */
let SESSION_CAP = 9;
let VIEW_ONLY_MODE = false; // true when dailyCap=0 — browse profiles for SSI "Localizar as pessoas certas", no connections sent

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
      VIEW_ONLY_MODE = SESSION_CAP === 0;
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
    if (!VIEW_ONLY_MODE && sent >= SESSION_CAP) break;

    const profileId = extractProfileId(card);
    if (!profileId) continue;

    const profileUrl = extractProfileUrl(card) || `/in/${profileId}`;

    // VIEW_ONLY_MODE: scroll each card — signals "Find Right People" to LinkedIn SSI
    if (VIEW_ONLY_MODE) {
      await scrollIntoViewAndPause(card);
      await randomWait(2000, 4500);
      await logProfileLink(profileUrl, profileId, '');
      await contentLog(`👁 ${profileUrl} — viewed (SSI: localizar as pessoas certas)`);
      continue;
    }

    // Log every profile we encounter (for later human review)
    const firstName = extractName(card);
    await logProfileLink(profileUrl, profileId, firstName);

    const locked = await isRecruiterLocked(profileId);
    if (locked) {
      // Scroll into view even when locked — SSI counts profile impressions from search
      await scrollIntoViewAndPause(card);
      await randomWait(1500, 3000);
      console.log(`[Recruiter Prospector] Skipping ${profileId} — within 7-day lock.`);
      await contentLog(`↷ ${profileUrl} — locked (7-day, viewed)`);
      continue;
    }

    let connectButton = getConnectButton(card);
    let viaMoreMenu = false;

    if (!connectButton) {
      // 3rd-degree profiles hide Connect inside the "More actions" overflow menu
      await scrollIntoViewAndPause(card);
      await readBeforeActing(card, 2000, 5000);
      connectButton = await getConnectButtonViaMore(card);
      viaMoreMenu = true;
    }

    if (!connectButton) {
      await randomWait(1000, 2500);
      await contentLog(`↷ ${profileUrl} — no connect button (viewed)`);
      continue;
    }

    // Simulate reading the profile card before deciding to connect (skip if already done above)
    if (!viaMoreMenu) {
      await readBeforeActing(card, 3000, 7000);
      await humanClick(connectButton);
    } else {
      // More menu is already open and connectButton is the dropdown item — just click it
      await humanClick(connectButton);
    }

    // Send connection WITHOUT a note — avoids modal friction and feels more organic
    const connected = await handleConnectionModalNoNote();
    if (!connected) {
      await contentLog(`⚠ connection modal handled but send failed | ${profileUrl}`, 'warn');
      continue;
    }

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
  await contentLog(`■ recruiter-prospector DONE | ${sent} sent / ${results.length} checked`, 'success');

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

  // Strategy 4 (LinkedIn 2025): div-based result containers (LinkedIn migrated away from li in some views)
  const byDivResult = Array.from(document.querySelectorAll(
    'div.search-result, div[class*="search-result"], ' +
    'div.reusable-search__result-container'
  )).filter(el => el.querySelector('a[href*="/in/"]'));
  if (byDivResult.length) { console.log(`[Recruiter Prospector] Found ${byDivResult.length} cards via div-result fallback.`); return byDivResult; }

  // Strategy 5: absolute broadest — any div or li anywhere on the page with a profile link,
  // de-duplicated to one container per unique profile
  const allWithLink = Array.from(document.querySelectorAll('div, li')).filter(
    el => el.querySelector('a[href*="/in/"]')
  );
  const seenIds = new Set();
  const deduped = allWithLink.filter(el => {
    const link = el.querySelector('a[href*="/in/"]');
    const key = link ? link.href.split('?')[0] : null;
    if (!key || seenIds.has(key)) return false;
    seenIds.add(key);
    return true;
  });
  if (deduped.length) { console.log(`[Recruiter Prospector] Found ${deduped.length} cards via broadest fallback.`); return deduped; }

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
  return Array.from(card.querySelectorAll('button')).find(b => {
    const text  = b.textContent.trim().toLowerCase();
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    return text === 'connect' ||
           /^connect$/i.test(label) ||
           /^invite .+ to connect/i.test(label);
  }) || null;
}

/**
 * Opens the "More actions" overflow menu in a search result card and returns
 * the Connect button found inside the dropdown. Returns null if not found.
 * Closes the dropdown via Escape if Connect is absent.
 */
async function getConnectButtonViaMore(card) {
  const moreBtn =
    card.querySelector('button[aria-label*="More actions"]') ||
    card.querySelector('button[aria-label*="More options"]') ||
    Array.from(card.querySelectorAll('button')).find(b => {
      const label = (b.getAttribute('aria-label') || b.textContent || '').trim().toLowerCase();
      return label === 'more' || label === 'more actions' || label === 'more options';
    });

  if (!moreBtn) return null;

  await humanClick(moreBtn);
  await randomWait(600, 1400);

  // Poll up to 3s for the dropdown Connect item to appear
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const item =
      document.querySelector('.artdeco-dropdown__content li button[aria-label*="Connect"]') ||
      document.querySelector('.artdeco-dropdown__content li button[aria-label*="Invite"]') ||
      Array.from(document.querySelectorAll(
        '.artdeco-dropdown__content li, .artdeco-dropdown li'
      )).reduce((found, li) => {
        if (found) return found;
        const btn = li.querySelector('button') || li;
        const label = (btn.getAttribute('aria-label') || btn.textContent || '').trim().toLowerCase();
        return (label === 'connect' || label.startsWith('connect ') || /^invite .+ to connect/i.test(label))
          ? btn : null;
      }, null);
    if (item) return item;
    await new Promise(r => setTimeout(r, 300));
  }

  // Connect not in dropdown — close it and report
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return null;
}

async function handleConnectionModal(card, profileId) {
  // Poll for the invite modal to appear (up to 5 s)
  const modal = await new Promise(resolve => {
    const deadline = Date.now() + 5000;
    const tick = setInterval(() => {
      const m =
        document.querySelector('div[data-test-modal-id="send-invite-modal"]') ||
        document.querySelector('.send-invite') ||
        document.querySelector('[data-test-modal]') ||
        document.querySelector('.artdeco-modal[role="dialog"]');
      if (m || Date.now() >= deadline) { clearInterval(tick); resolve(m || null); }
    }, 300);
  });

  if (!modal) {
    // No modal — LinkedIn sent the request directly (no note required)
    return true;
  }

  // Try to click the "Add a note" button inside the modal
  const addNoteBtn =
    modal.querySelector('[aria-label="Add a note"]') ||
    modal.querySelector('button[data-control-name="add-note"]') ||
    Array.from(modal.querySelectorAll('button')).find(
      b => /add\s*a?\s*note/i.test(b.textContent)
    );

  if (addNoteBtn) {
    await humanClick(addNoteBtn);
    await randomWait(800, 1600);

    const noteInput =
      document.querySelector('#custom-message') ||
      document.querySelector('#connect-cta-form__message') ||
      document.querySelector('textarea[name="message"]') ||
      document.querySelector('.connect-button-send-invite__custom-message') ||
      document.querySelector('.artdeco-modal textarea');

    if (noteInput) {
      const firstName = extractName(card);
      const personalizedNote = CONNECTION_NOTE.replace('{firstName}', firstName);
      noteInput.focus();
      // Use execCommand so the character counter and submit-enable logic fires
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, personalizedNote);
      noteInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
      await randomWait(1000, 2000);
    }
  }

  // Find the send / submit button
  const sendButton =
    document.querySelector('[aria-label="Send now"]') ||
    document.querySelector('[aria-label="Send invitation"]') ||
    document.querySelector('button[data-control-name="send-invite-cta-btn"]') ||
    Array.from(document.querySelectorAll('.artdeco-modal button')).find(
      b => !b.disabled && /send/i.test(b.textContent.trim())
    );

  if (sendButton) {
    await humanClick(sendButton);
    await randomWait(1000, 2500);
    return true;
  }

  // Last resort: "Send without a note" so the connection is still attempted
  const sendWithoutNote =
    document.querySelector('[aria-label="Send without a note"]') ||
    Array.from(document.querySelectorAll('button')).find(
      b => /send without/i.test(b.textContent)
    );
  if (sendWithoutNote) {
    await humanClick(sendWithoutNote);
    await randomWait(1000, 2000);
    return true;
  }

  // Could not send — close the modal and skip
  const dismissButton =
    document.querySelector('[aria-label="Dismiss"]') ||
    document.querySelector('.artdeco-modal__dismiss') ||
    document.querySelector('button[data-control-name="overlay.close"]');
  if (dismissButton) await humanClick(dismissButton);
  return false;
}

// ─── No-note connection handler ───────────────────────────────────────────────
/**
 * Handles the post-click connection modal by always sending WITHOUT a note.
 * This avoids the message-compose step and feels less bot-like in terms of
 * volume (LinkedIn flags accounts that always send identical notes).
 * Logs everything for debugging.
 */
async function handleConnectionModalNoNote() {
  // Wait up to 5s for any modal to appear
  const modal = await new Promise(resolve => {
    const deadline = Date.now() + 5000;
    const tick = setInterval(() => {
      const m =
        document.querySelector('div[data-test-modal-id="send-invite-modal"]') ||
        document.querySelector('.send-invite') ||
        document.querySelector('[data-test-modal]') ||
        document.querySelector('.artdeco-modal[role="dialog"]');
      if (m || Date.now() >= deadline) { clearInterval(tick); resolve(m || null); }
    }, 300);
  });

  if (!modal) {
    // LinkedIn sent directly — no modal (already connected or 1st degree)
    await contentLog('📤 connection sent directly — no modal appeared');
    return true;
  }

  await contentLog('📋 connection modal appeared — looking for send-without-note button');

  // Priority: "Send without a note" button
  const sendWithoutNote =
    modal.querySelector('[aria-label="Send without a note"]') ||
    Array.from(modal.querySelectorAll('button')).find(
      b => /send without/i.test(b.textContent) || /send$/i.test(b.textContent.trim())
    );

  if (sendWithoutNote) {
    await humanClick(sendWithoutNote);
    await randomWait(1000, 2500);
    await contentLog('✓ sent without note');
    return true;
  }

  // Fallback: generic send/submit button
  const sendBtn =
    modal.querySelector('[aria-label="Send now"]') ||
    modal.querySelector('[aria-label="Send invitation"]') ||
    modal.querySelector('button[data-control-name="send-invite-cta-btn"]') ||
    Array.from(modal.querySelectorAll('button')).find(
      b => !b.disabled && /^send/i.test(b.textContent.trim())
    );

  if (sendBtn) {
    await humanClick(sendBtn);
    await randomWait(1000, 2500);
    await contentLog('✓ sent via generic send button');
    return true;
  }

  // Could not find any send button — dismiss and log for debugging
  await contentLog('⚠ no send/dismiss button found in modal — dumping modal HTML to log', 'warn');
  await contentLog(`[modal-html] ${modal.innerHTML.slice(0, 600)}`, 'warn');

  const dismissBtn =
    modal.querySelector('[aria-label="Dismiss"]') ||
    modal.querySelector('.artdeco-modal__dismiss') ||
    modal.querySelector('button[data-control-name="overlay.close"]');
  if (dismissBtn) await humanClick(dismissBtn);
  return false;
}

// ─── Profile link logger ──────────────────────────────────────────────────────
async function logProfileLink(profileUrl, profileId, name) {
  try {
    const entry = { ts: new Date().toISOString(), url: profileUrl, profileId, name, context: 'recruiter-search' };
    const { discoveredLinks = [] } = await chrome.storage.local.get('discoveredLinks');
    discoveredLinks.push(entry);
    await chrome.storage.local.set({ discoveredLinks: discoveredLinks.slice(-1000) });
  } catch (e) { console.warn('[Recruiter Prospector][logProfileLink failed]', e); }
}
