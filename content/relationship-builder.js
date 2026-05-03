/**
 * relationship-builder.js — Content script for linkedin.com/mynetwork/
 *
 * Engages with pending network events to boost the SSI "Build Relationships" pillar:
 *   - Congratulates connections on work anniversaries and new roles
 *   - Responds to connection acceptance notifications
 *
 * Session cap: 10 relationship touches per run.
 * Human-mimicry delays applied between all interactions.
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

const SESSION_CAP = 10;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const BIRTHDAY_MESSAGES = [
  "Happy birthday! Hope you're having a great day. 🎂",
  "Many happy returns! Wishing you a wonderful birthday.",
  "Happy birthday! Great having you in my professional network.",
  "Wishing you a fantastic birthday and an even better year ahead! 🎉",
];

const ANNIVERSARY_MESSAGES = [
  "Congratulations on the milestone! Wishing you continued success.",
  "Happy work anniversary! Great to have you in my network.",
  "Congratulations on another year — looking forward to following your journey!",
];

const NEW_JOB_MESSAGES = [
  "Congratulations on the new role! Exciting times ahead.",
  "Great news on the new position — wishing you a strong start!",
  "Congratulations! New roles bring great opportunities. All the best.",
];

// ─── Message listener ─────────────────────────────────────────────────────────

let PAGE_TYPE = null; // 'birthday' | 'anniversary' | null (auto-detect)

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START' && message.task === 'relationship-builder') {
    if (message.pageType) PAGE_TYPE = message.pageType;
    buildRelationships().then((result) => {
      sendResponse({ success: true, ...result });
    }).catch((error) => {
      console.error('[Relationship Builder] Error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// ─── Core logic ───────────────────────────────────────────────────────────────

async function buildRelationships() {
  await contentLog(`▶ relationship-builder started | ${window.location.href}`);
  await randomWait(3000, 6000);

  let touched = 0;
  const cards = getNetworkCards();

  for (const card of cards) {
    if (touched >= SESSION_CAP) break;

    const type = detectCardType(card);
    if (!type) continue;

    const profileId  = extractProfileId(card);
    const profileUrl = extractProfileUrl(card);

    // 7-day dedup — skip if we already congratulated this person recently
    const name = extractName(card);
    if (profileId && await isRecentlyTouched(profileId)) {
      console.log(`[Relationship Builder] Skipping ${name || profileId} — touched within 7 days.`);
      await contentLog(`↷ ${profileUrl || profileId} | ${name} — recently touched (7-day)`);
      continue;
    }

    await scrollIntoViewAndPause(card);
    await randomWait(1500, 4000);

    const messages =
      type === 'anniversary' ? ANNIVERSARY_MESSAGES :
      type === 'birthday'    ? BIRTHDAY_MESSAGES    :
                               NEW_JOB_MESSAGES;
    const chosen   = messages[Math.floor(Math.random() * messages.length)];
    const success  = await sendMessage(card, [chosen]);

    if (success) {
      touched++;
      await contentLog(`✓ ${profileUrl || profileId} | ${name} — ${type} (${touched}/${SESSION_CAP})`, 'success');
      console.log(`[Relationship Builder] Engaged with ${type} card for ${name} (${touched}/${SESSION_CAP})`);

      // Persist to history — name already extracted above
      const { relationships = [] } = await chrome.storage.local.get('relationships');
      relationships.push({
        profileId: profileId || `unknown-${Date.now()}`,
        name,
        profileUrl,
        eventType: type,
        messageSent: chosen,
        touchedAt: new Date().toISOString(),
      });
      await chrome.storage.local.set({ relationships: relationships.slice(-200) });

      await randomWait(6000, 12000);
    }
  }

  await chrome.storage.local.set({
    lastRelationshipBuild: { touched, runAt: new Date().toISOString() },
  });
  await contentLog(`■ relationship-builder done | ${touched} touched`);

  return { touched };
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function getNetworkCards() {
  // Strategy 1: dedicated birthday/anniversary catch-up pages
  const catchUp = Array.from(document.querySelectorAll(
    '.catch-up-card, ' +
    '[data-view-name="catch-up-entity-card"]'
  ));
  if (catchUp.length) { console.log(`[Relationship Builder] Found ${catchUp.length} cards via catch-up selectors.`); return catchUp; }

  // Strategy 2: notification-style items on catch-up/all/
  const notifItems = Array.from(document.querySelectorAll(
    '.notification-item, ' +
    '[data-view-name="notification-item"]'
  ));
  if (notifItems.length) { console.log(`[Relationship Builder] Found ${notifItems.length} cards via notification items.`); return notifItems; }

  // Strategy 3: standard mynetwork page cards
  const standard = Array.from(document.querySelectorAll('.mn-pymk-list__card, .mn-community-summary'));
  if (standard.length) { console.log(`[Relationship Builder] Found ${standard.length} cards via standard selectors.`); return standard; }

  // Strategy 4: any artdeco card on a mynetwork/* page that has a profile link
  const byLink = Array.from(document.querySelectorAll('.artdeco-card')).filter(
    el => el.querySelector('a[href*="/in/"]')
  );
  if (byLink.length) { console.log(`[Relationship Builder] Found ${byLink.length} cards via artdeco+profile-link fallback.`); return byLink; }

  console.warn('[Relationship Builder] All selectors failed. Page URL:', location.href);
  return [];
}

function detectCardType(card) {
  // If the service worker told us which page we're on, trust it
  if (PAGE_TYPE === 'birthday')     return 'birthday';
  if (PAGE_TYPE === 'anniversary')  return 'anniversary';
  // Fallback: infer from card text (catch-up/all/ or manual trigger)
  const text = card.textContent.toLowerCase();
  if (text.includes('birthday') || text.includes('born') || text.includes('happy birthday')) return 'birthday';
  if (text.includes('anniversary') || text.includes('years at')) return 'anniversary';
  if (text.includes('new job') || text.includes('started') || text.includes('joined')) return 'new_job';
  return null;
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
  // Catch-up page specific selectors (birthday / anniversary cards)
  const catchUpEl =
    card.querySelector('.catch-up-card__actor-name') ||
    card.querySelector('.catch-up-identity__name') ||
    card.querySelector('[data-anonymize="person-name"]') ||
    card.querySelector('.entity-result__title-text') ||
    card.querySelector('.update-components-actor__name') ||
    card.querySelector('.update-components-actor__meta-link span[aria-hidden="true"]');
  if (catchUpEl) return catchUpEl.textContent.trim();

  // Generic mynetwork page
  const genericEl = card.querySelector('.mn-connection-card__name, .actor-name, span[aria-hidden="true"]');
  return genericEl ? genericEl.textContent.trim() : 'there';
}

/**
 * Returns true if this profileId already has a record within the last 7 days.
 */
async function isRecentlyTouched(profileId) {
  const { relationships = [] } = await chrome.storage.local.get('relationships');
  return relationships.some(
    r => r.profileId === profileId && (Date.now() - new Date(r.touchedAt).getTime()) < SEVEN_DAYS_MS
  );
}

async function sendMessage(card, messages) {
  // On the catch-up page LinkedIn uses "Say happy birthday" or "Wish" buttons
  // On the standard mynetwork page it uses "Message"
  const messageButton =
    card.querySelector('button[aria-label*="Message"]') ||
    card.querySelector('button[aria-label*="birthday"]') ||
    card.querySelector('button[aria-label*="Wish"]') ||
    Array.from(card.querySelectorAll('button')).find(
      b => /^(Message|Wish|Say happy birthday)$/i.test(b.textContent.trim())
    );
  if (!messageButton) return false;

  await humanClick(messageButton);
  await randomWait(2000, 4000);

  const messageBox = document.querySelector('.msg-form__contenteditable[contenteditable="true"]');
  if (!messageBox) return false;

  const message = messages[Math.floor(Math.random() * messages.length)];
  messageBox.focus();
  messageBox.textContent = message;
  messageBox.dispatchEvent(new InputEvent('input', { bubbles: true }));
  await randomWait(2000, 4000);

  const sendButton = document.querySelector('.msg-form__send-button');
  if (!sendButton) return false;

  await humanClick(sendButton);
  await randomWait(1000, 2500);

  // Close the message panel
  const closeButton = document.querySelector('button[data-control-name="overlay.close_conversation_window"]');
  if (closeButton) await humanClick(closeButton);

  return true;
}
