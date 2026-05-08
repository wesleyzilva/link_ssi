/**
 * profile-messenger.js — Sends an intro message via LinkedIn Messaging compose.
 *
 * Triggered by the service worker when processing the messageQueue:
 *   1. SW extracts profileId from the /in/ URL
 *   2. SW opens a tab at linkedin.com/messaging/compose/?recipient={profileId}
 *   3. SW sends { action: 'START', task: 'profile-messenger', messageBody?, subject? }
 *   4. This script fills the subject line (InMail only, when present) and
 *      the compose body, then clicks Send.
 *   5. sendResponse({ success: true }) → SW auto-closes the tab
 *
 * If no messageBody is provided, falls back to the default INTRO_MESSAGE.
 */

// utils/human-mimicry.js is loaded before this script by the manifest

const INTRO_MESSAGE =
  'Hi! I\'m Wesley Silva, an Agile Project Manager from Brazil specialising in nearshore ' +
  'digital product delivery. I help teams reach high performance through structured maturity ' +
  'frameworks and AI-integrated workspaces. Feel free to browse my portfolio — and do reach ' +
  'out if there is any potential synergy.\n' +
  '+55 16 997212966 https://wesleyzilva.github.io/portfolioNearshoreWesIA/';

// ─── Logger ───────────────────────────────────────────────────────────────────

async function contentLog(msg, level = 'info') {
  const entry = { ts: new Date().toISOString(), level, script: 'profile-messenger', msg };
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[Profile Messenger]', msg);
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push(entry);
    await chrome.storage.local.set({ activityLog: activityLog.slice(-500) });
  } catch (e) { console.warn('[Profile Messenger][contentLog failed]', e); }
}

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START' && message.task === 'profile-messenger') {
    const body    = message.messageBody || null;
    const subject = message.subject    || null;
    sendIntroMessage(body, subject)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(err => {
        contentLog(`✗ fatal: ${err.message}`, 'error');
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
});

// ─── Core ─────────────────────────────────────────────────────────────────────

async function sendIntroMessage(messageBody = null, subject = null) {
  const textToSend = messageBody || INTRO_MESSAGE;
  await contentLog(`▶ profile-messenger started | ${window.location.href}`);
  await randomWait(4000, 8000);

  // ── Subject line (InMail only — skip gracefully for regular messages) ────────
  if (subject) {
    const subjectInput =
      document.querySelector('input[name="subject"]') ||
      document.querySelector('input[placeholder*="ubject"]') ||
      document.querySelector('input[placeholder*="ssunto"]') ||
      document.querySelector('.msg-form__subject-line input') ||
      document.querySelector('.artdeco-text-input--input[name="subject"]');

    if (subjectInput) {
      subjectInput.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, subject);
      subjectInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
      await randomWait(1000, 2000);
      await contentLog(`✓ subject filled: ${subject}`);
    }
  }

  // Wait for the LinkedIn messaging compose box to render
  const box = await waitForComposeBox(20000);
  if (!box) {
    await contentLog('✗ compose box not found — profile may not accept messages', 'warn');
    return { sent: false, reason: 'no-compose-box' };
  }

  await contentLog('✍ compose box found — inserting message…');
  await randomWait(2000, 4000); // simulate reading before typing

  box.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, textToSend);
  box.dispatchEvent(new InputEvent('input', { bubbles: true }));

  await randomWait(3000, 6000); // simulate re-reading before sending

  // Find the Send button
  const sendBtn =
    document.querySelector('.msg-form__send-button:not([disabled])') ||
    document.querySelector('button[data-control-name="send-message"]:not([disabled])') ||
    Array.from(document.querySelectorAll('button')).find(b => {
      if (b.disabled) return false;
      const txt = b.textContent.trim().toLowerCase();
      const lbl = (b.getAttribute('aria-label') || '').trim().toLowerCase();
      return txt === 'send' || txt === 'enviar' ||
             /^send$/.test(lbl) || /^enviar$/.test(lbl);
    });

  if (!sendBtn) {
    await contentLog('⚠ send button not found — trying Ctrl+Enter', 'warn');
    box.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', ctrlKey: true, bubbles: true,
    }));
    await randomWait(2000, 4000);
    await contentLog(`✓ message sent via Ctrl+Enter | ${window.location.href}`, 'success');
    return { sent: true };
  }

  await humanClick(sendBtn);
  await randomWait(2000, 4000);
  await contentLog(`✓ message sent | ${window.location.href}`, 'success');
  return { sent: true };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function waitForComposeBox(maxWait = 20000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const box =
      document.querySelector('.msg-form__contenteditable[contenteditable="true"]') ||
      document.querySelector('[contenteditable="true"][data-placeholder*="essage"]') ||
      document.querySelector('[contenteditable="true"][data-placeholder*="ensagem"]') ||
      document.querySelector('.msg-form__message-texteditor [contenteditable="true"]') ||
      document.querySelector('[role="textbox"][contenteditable="true"]');
    if (box) return box;
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}
