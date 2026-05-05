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
// SEVEN_DAYS_MS is already declared as a global by utils/db.js (loaded first in manifest)

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

/**
 * Polls a DOM query function until it returns at least one element, or times out.
 */
async function waitForElements(queryFn, maxWait = 25000, interval = 2000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const els = queryFn();
    if (els.length) return els;
    await new Promise(r => setTimeout(r, interval));
  }
  return queryFn();
}

async function buildRelationships() {
  await contentLog(`▶ relationship-builder started | ${window.location.href}`);
  await randomWait(3000, 6000);

  let touched = 0;
  const cards = await waitForElements(getNetworkCards, 25000);

  if (!cards.length) {
    const btns = Array.from(document.querySelectorAll('button')).slice(0, 8)
      .map(b => `"${b.textContent.trim().slice(0, 30)}" aria="${(b.getAttribute('aria-label') || '').slice(0, 50)}"`)
      .join(' | ');
    await contentLog(`[Diag] 0 cards found | page:${PAGE_TYPE} title:"${document.title.slice(0, 60)}" | btns: ${btns}`, 'warn');
  }

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
    // LinkedIn 2026 lazy-renders the action buttons (Celebrar / Parabenizar / etc.)
    // only after the card enters the viewport AND receives a hover event.
    card.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    card.dispatchEvent(new MouseEvent('mouseover',  { bubbles: true, cancelable: true }));
    await waitForActionButton(card, 5000);
    await randomWait(1000, 2500);

    const messages =
      type === 'anniversary' ? ANNIVERSARY_MESSAGES :
      type === 'birthday'    ? BIRTHDAY_MESSAGES    :
                               NEW_JOB_MESSAGES;
    const chosen   = messages[Math.floor(Math.random() * messages.length)];
    const success  = await sendMessage(card, [chosen]);

    if (!success) {
      await contentLog(`[Diag] sendMessage failed | ${profileUrl || profileId} | ${name} — ${type}`, 'warn');
    }

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

/**
 * Polls up to maxWait ms for the card to expose at least one NON-reaction button.
 * LinkedIn 2026 lazy-renders action buttons (Celebrar / Parabenizar / etc.) after hover.
 * The "Open reactions menu" Like button is always present but we need the action button.
 */
async function waitForActionButton(card, maxWait = 5000) {
  const SKIP_LABELS = ['open reactions menu', 'like', 'curtir', 'reagir', 'comment', 'share', 'send'];
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    // Check inside card first, then document-wide (LinkedIn 2026 overlay pattern)
    const sources = [
      ...Array.from(card.querySelectorAll('button')),
      ...Array.from(document.querySelectorAll('button')).filter(b => {
        const rect = b.getBoundingClientRect();
        return rect.top > 80 && rect.width > 0 && rect.height > 0 && !b.disabled;
      }),
    ];
    const hasAction = sources.some(b => {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      const text  = b.textContent.trim().toLowerCase();
      return !SKIP_LABELS.some(r => label.includes(r) || text.includes(r)) &&
             (label.length > 0 || text.length > 0);
    });
    if (hasAction) return;
    await new Promise(r => setTimeout(r, 300));
  }
}

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

  // Strategy 5: scaffold finite-scroll list items (LinkedIn 2025 infinite-scroll layout)
  const byScaffold = Array.from(document.querySelectorAll(
    '.scaffold-finite-scroll__content li, ' +
    'ul.pvs-list li, ' +
    '[data-view-name*="catch-up"]'
  )).filter(el => el.querySelector('a[href*="/in/"]'));
  if (byScaffold.length) { console.log(`[Relationship Builder] Found ${byScaffold.length} cards via scaffold fallback.`); return byScaffold; }

  // Strategy 6: broadest possible — any li or div on the page with a profile link
  const byAny = Array.from(document.querySelectorAll('li, div[class]')).filter(
    el => el.querySelector('a[href*="/in/"]') && !el.closest('[data-ssi-found]')
  );
  // De-duplicate: keep only the innermost unique containers
  const seen = new Set();
  const deduped = byAny.filter(el => {
    const link = el.querySelector('a[href*="/in/"]');
    const key = link ? link.href : null;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (deduped.length) { console.log(`[Relationship Builder] Found ${deduped.length} cards via broadest fallback.`); return deduped; }

  console.warn('[Relationship Builder] All selectors failed. Page URL:', location.href);
  return [];
}

function detectCardType(card) {
  // If the service worker told us which page we're on, trust it
  if (PAGE_TYPE === 'birthday')     return 'birthday';
  if (PAGE_TYPE === 'anniversary')  return 'anniversary';
  if (PAGE_TYPE === 'new_job')      return 'new_job';
  // Fallback: infer from card text (catch-up/all/ or manual trigger)
  const text = card.textContent.toLowerCase();
  if (text.includes('birthday') || text.includes('born') || text.includes('happy birthday')) return 'birthday';
  if (text.includes('anniversary') || text.includes('years at')) return 'anniversary';
  if (text.includes('new job') || text.includes('new role') || text.includes('started') || text.includes('joined') || text.includes('promoted')) return 'new_job';
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
  // Catch-up page specific selectors (birthday / anniversary / new-job cards)
  const catchUpEl =
    card.querySelector('.catch-up-card__actor-name') ||
    card.querySelector('.catch-up-identity__name') ||
    card.querySelector('[data-anonymize="person-name"]') ||
    card.querySelector('.entity-result__title-text') ||
    card.querySelector('.update-components-actor__name') ||
    card.querySelector('.update-components-actor__meta-link span[aria-hidden="true"]') ||
    // 2025-2026 LinkedIn PT-BR catch-up redesign selectors
    card.querySelector('.ntpc-catch-up-card__actor-name') ||
    card.querySelector('[data-view-name*="catch-up"] .actor-name') ||
    card.querySelector('.artdeco-entity-lockup__title') ||
    card.querySelector('.artdeco-entity-lockup__title span[aria-hidden="true"]') ||
    card.querySelector('span[data-test-id*="name"]') ||
    card.querySelector('a[data-test-id*="profile"] span[aria-hidden="true"]') ||
    card.querySelector('.full-name') ||
    // last-resort: first bold/strong text inside the card
    card.querySelector('strong, b');
  if (catchUpEl) return catchUpEl.textContent.trim().split('\n')[0].trim();

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
  // LinkedIn catch-up page buttons — EN + PT-BR variants
  //
  // Birthday  EN:  "Say happy birthday", "Wish [Name] a happy birthday"
  //           PT:  "Dizer parabéns", "Dizer parabéns a [Nome]", "Parabenizar [Nome]"
  //                "Celebrar", "Dizer que está pensando em você"
  // Anniv.    EN:  "Congratulate [Name]", "Message"
  //           PT:  "Parabenizar [Nome]", "Mensagem", "Parabéns"
  // New job   EN:  "Say congrats", "Congratulate [Name]", "Message"
  //           PT:  "Dar os parabéns", "Parabenizar [Nome]", "Mensagem"

  // aria-label substring matches (case-insensitive via *=)
  const ARIA_SUBS = [
    // EN
    'birthday', 'Wish', 'Say happy', 'Message', 'Congratulate', 'Say congrats',
    'new role', 'new job', 'new position', 'Celebrate',
    // PT-BR
    'parabéns', 'Parabenizar', 'Felicitar', 'Mensagem',
    'aniversário', 'novo emprego', 'nova função', 'nova posição',
    'Dar os parab', 'Dizer parab', 'Enviar mensagem', 'Celebrar',
    'pensando em você', 'pensando em voce',
  ];

  const TEXT_RE = /^(Message|Wish|Say happy birthday|Say congrats|Congratulate|Celebrate|Mensagem|Parabenizar|Felicitar|Celebrar|Parabéns|Dizer parab[eé]ns|Dar os parab[eé]ns|Enviar mensagem|Dizer que est[aá] pensando)$/i;

  const messageButton =
    ARIA_SUBS.reduce((found, pat) =>
      found || card.querySelector(`button[aria-label*="${pat}"]`), null) ||
    Array.from(card.querySelectorAll('button')).find(b => TEXT_RE.test(b.textContent.trim())) ||
    // LinkedIn 2026: action buttons rendered in floating overlay OUTSIDE the card's DOM tree.
    // After hover, scan the full document. Restrict to visible, non-nav buttons only.
    ARIA_SUBS.reduce((found, pat) =>
      found || document.querySelector(`button[aria-label*="${pat}"]:not([disabled])`), null) ||
    Array.from(document.querySelectorAll('button')).find(b => {
      if (b.disabled) return false;
      const rect = b.getBoundingClientRect();
      if (rect.top < 80 || rect.width === 0) return false; // skip navbar
      return TEXT_RE.test(b.textContent.trim());
    });

  if (!messageButton) {
    const btns = Array.from(card.querySelectorAll('button'))
      .map(b => `"${b.textContent.trim().slice(0, 30)}" aria="${(b.getAttribute('aria-label') || '').slice(0, 60)}"`)
      .join(' | ');
    // Log to CSV so we can identify exact PT-BR button labels in the activity history
    await contentLog(`[Diag] no msg btn | card btns: ${btns || '(none)'}`, 'warn');
    return false;
  }

  await humanClick(messageButton);
  await randomWait(2000, 4000);

  // LinkedIn birthday/catch-up widget may differ from the inbox form
  const messageBox =
    document.querySelector('.msg-form__contenteditable[contenteditable="true"]') ||
    document.querySelector('[contenteditable="true"][data-placeholder*="message" i]') ||
    document.querySelector('[contenteditable="true"][data-placeholder*="mensagem" i]') ||
    document.querySelector('[contenteditable="true"][data-placeholder*="Write" i]') ||
    document.querySelector('[contenteditable="true"][data-placeholder*="Escreva" i]') ||
    document.querySelector('[contenteditable="true"][data-placeholder*="Escrever" i]') ||
    document.querySelector('.msg-form__message-texteditor [contenteditable="true"]') ||
    document.querySelector('[role="textbox"][contenteditable="true"]');

  if (!messageBox) {
    await contentLog('[Diag] message box not found after clicking msg button', 'warn');
    return false;
  }

  const message = messages[Math.floor(Math.random() * messages.length)];
  messageBox.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, message);
  messageBox.dispatchEvent(new InputEvent('input', { bubbles: true }));
  await randomWait(2000, 4000);

  const sendButton =
    document.querySelector('.msg-form__send-button') ||
    document.querySelector('button[data-control-name="send-message"]') ||
    document.querySelector('button[aria-label*="Send" i]') ||
    document.querySelector('button[aria-label*="Enviar" i]') ||
    document.querySelector('button[aria-label*="Submeter" i]') ||
    Array.from(document.querySelectorAll('button')).find(
      b => /^(send|enviar|submeter|postar)$/i.test(b.textContent.trim())
    );

  if (!sendButton) {
    await contentLog('[Diag] send button not found after composing message', 'warn');
    return false;
  }

  await humanClick(sendButton);
  await randomWait(1000, 2500);

  // Close the message panel if open
  const closeButton =
    document.querySelector('button[data-control-name="overlay.close_conversation_window"]') ||
    document.querySelector('button[aria-label*="Fechar" i]') ||
    document.querySelector('button[aria-label*="Close" i]');
  if (closeButton) await humanClick(closeButton);

  return true;
}
