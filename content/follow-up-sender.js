/**
 * follow-up-sender.js — Content script for linkedin.com/messaging/
 *
 * Sends a short introduction message to connections who:
 *   1. Accepted our request (tracked in `acceptedConnections`)
 *   2. Were accepted ≥24h ago
 *   3. Have NOT yet received a follow-up (followUpSent: false)
 *
 * Session cap: 5 follow-up messages per run (avoid messaging spam flags).
 * Human-mimicry delays applied to all interactions.
 *
 * Follow-up message strategy:
 *   - Short, contextual, not spammy
 *   - Mentions who we are in one line
 *   - Portfolio URL for reference
 *   - No pitching — just a warm intro
 */

// utils/human-mimicry.js is loaded before this script by the manifest

const FOLLOWUP_CAP = 5;
const FOLLOWUP_DELAY_HOURS = 24;
const PORTFOLIO_URL = 'https://wesleyzilva.github.io/portfolioNearshoreWesIA/';

const FOLLOWUP_TEMPLATES = [
  `Hi {firstName}! Thanks for connecting. I'm Wesley — IT Manager from Brazil, 14+ years leading nearshore engineering teams. Happy to share context on how I work if it's ever relevant for your search. Portfolio: ${PORTFOLIO_URL}`,
  `Hi {firstName}, thanks for the connection! I'm Wesley — IT Manager with 14+ yrs delivering remote engineering teams from Brazil (US, EU, APAC clients). If you have any nearshore IT roles, I'd love to connect on them: ${PORTFOLIO_URL}`,
  `Hi {firstName}! Good to connect. I'm Wesley, an IT Manager based in Brazil specialising in nearshore delivery for US and EU clients. Here's more context on my background if helpful: ${PORTFOLIO_URL}`,
  `Hi {firstName}, thanks for accepting! Wesley here — IT Manager from São Paulo, 14+ yrs leading data engineering and DevSecOps teams for international clients. Portfolio for reference: ${PORTFOLIO_URL}`,
];

async function contentLog(msg, level = 'info') {
  const entry = { ts: new Date().toISOString(), level, script: 'follow-up-sender', msg };
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[Follow-up Sender]', msg);
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push(entry);
    await chrome.storage.local.set({ activityLog: activityLog.slice(-500) });
  } catch (e) { console.warn('[Follow-up Sender][contentLog failed]', e); }
}

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START' && message.task === 'follow-up-sender') {
    sendFollowUps()
      .then(result => sendResponse({ success: true, ...result }))
      .catch(err => {
        contentLog(`✗ follow-up-sender fatal: ${err.message}`, 'error');
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
});

// ─── Core ─────────────────────────────────────────────────────────────────────

async function sendFollowUps() {
  await contentLog(`▶ follow-up-sender started | ${window.location.href}`);
  await randomWait(4000, 8000);

  const { acceptedConnections = [] } = await chrome.storage.local.get('acceptedConnections');
  const nowMs = Date.now();
  const delayMs = FOLLOWUP_DELAY_HOURS * 60 * 60 * 1000;

  // Candidates: accepted, not yet followed up, accepted ≥24h ago
  const candidates = acceptedConnections.filter(c =>
    !c.followUpSent &&
    c.acceptedAt &&
    (nowMs - new Date(c.acceptedAt).getTime()) >= delayMs
  );

  await contentLog(`📬 follow-up candidates: ${candidates.length}`);

  if (!candidates.length) {
    await contentLog('■ follow-up-sender DONE | no candidates ready');
    return { sent: 0 };
  }

  let sent = 0;
  const updatedConnections = [...acceptedConnections];

  for (const candidate of candidates) {
    if (sent >= FOLLOWUP_CAP) break;

    const firstName = (candidate.name || '').split(' ')[0] || 'there';
    const template = FOLLOWUP_TEMPLATES[Math.floor(Math.random() * FOLLOWUP_TEMPLATES.length)];
    const message = template.replace('{firstName}', firstName);

    try {
      const ok = await openConversationAndSend(candidate.profileUrl, message);
      if (ok) {
        sent++;
        // Mark as followed up
        const idx = updatedConnections.findIndex(c => c.profileId === candidate.profileId);
        if (idx !== -1) {
          updatedConnections[idx] = { ...updatedConnections[idx], followUpSent: true, followUpAt: new Date().toISOString() };
        }
        await contentLog(`✓ FOLLOW-UP sent | ${candidate.name || candidate.profileId} (${sent}/${FOLLOWUP_CAP})`, 'success');
        await randomWait(20000, 40000); // long pause between DMs to avoid spam detection
      } else {
        await contentLog(`⚠ follow-up failed | ${candidate.profileUrl}`, 'warn');
      }
    } catch (e) {
      await contentLog(`✗ follow-up error | ${candidate.profileUrl}: ${e.message}`, 'error');
    }
  }

  await chrome.storage.local.set({ acceptedConnections: updatedConnections });
  await chrome.storage.local.set({ lastFollowUp: { sent, runAt: new Date().toISOString() } });

  await contentLog(`■ follow-up-sender DONE | ${sent} sent`, 'success');

  try { await chrome.runtime.sendMessage({ action: 'EXPORT_LOGS' }); } catch (_e) { /* ok */ }

  return { sent };
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

/**
 * Opens a new conversation via LinkedIn messaging URL and sends the message.
 * LinkedIn messaging URL format: /messaging/compose/?recipient=PROFILE_ID
 */
async function openConversationAndSend(profileUrl, message) {
  // Extract profileId from URL to build a compose link
  const match = (profileUrl || '').match(/\/in\/([^/?#]+)/);
  if (!match) {
    await contentLog('⚠ cannot extract profileId from URL — skipping', 'warn');
    return false;
  }

  const profileId = match[1];

  // Navigate to the compose URL — opens a new conversation thread
  window.location.href = `https://www.linkedin.com/messaging/compose/?recipient=${profileId}`;

  // Wait for the messaging compose box to appear
  const box = await waitForElement(
    () => document.querySelector(
      '.msg-form__contenteditable[contenteditable="true"], ' +
      '[contenteditable="true"][data-placeholder*="essage"], ' +
      '.msg-form__message-texteditor [contenteditable="true"]'
    ),
    20000
  );

  if (!box) {
    await contentLog('⚠ messaging compose box not found after navigation', 'warn');
    return false;
  }

  // Simulate reading the page before typing
  await randomWait(3000, 6000);

  box.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, message);
  box.dispatchEvent(new InputEvent('input', { bubbles: true }));

  await randomWait(4000, 8000); // simulate re-reading before send

  const sendBtn =
    document.querySelector('.msg-form__send-button') ||
    document.querySelector('button[data-control-name="send-message"]') ||
    Array.from(document.querySelectorAll('button')).find(
      b => /^send$/i.test(b.textContent.trim())
    );

  if (!sendBtn || sendBtn.disabled) {
    await contentLog('⚠ send button not found or disabled', 'warn');
    return false;
  }

  await humanClick(sendBtn);
  await randomWait(2000, 4000);
  return true;
}

async function waitForElement(queryFn, maxWait = 20000, interval = 1500) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const el = queryFn();
    if (el) return el;
    await new Promise(r => setTimeout(r, interval));
  }
  return null;
}
