/**
 * lead-extractor.js — Content script for LinkedIn profile pages (/in/*)
 *
 * Auto-extracts contact data from profile pages the user visits:
 *  - Emails (regex scan of visible profile text + about section)
 *  - Profile owner name + headline
 *  - Indicators of recruiter/hiring intent (saved as context tag)
 *
 * Read-only. Does NOT click "Contact info" modal (would require interaction
 * tracked by LinkedIn). Only what's already visible on the rendered profile.
 *
 * Runs on document_idle. Also listens for { action:'START', task:'lead-extractor' }
 * for explicit invocation from the popup or service worker.
 */

// utils/human-mimicry.js + utils/db.js injected before this script

const EMAIL_REGEX_LE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_BLOCKLIST_LE = /@(linkedin\.com|example\.com|email\.com|domain\.com|test\.com|sentry\.io|gravatar\.com)$/i;
const RECRUITER_HINTS = /(recruiter|talent acquisition|head of talent|ta manager|hr manager|people & culture|hiring manager|technical recruiter|engineering recruiter)/i;

async function leLog(msg, level = 'info') {
  console[level === 'error' ? 'error' : 'log']('[Lead Extractor]', msg);
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push({ ts: new Date().toISOString(), level, script: 'lead-extractor', msg });
    await chrome.storage.local.set({ activityLog: activityLog.slice(-500) });
  } catch { /* ignore */ }
}

// Auto-run on profile page load (passive harvest)
(async () => {
  try {
    // Wait briefly for SPA to render
    await new Promise(r => setTimeout(r, 4000 + Math.random() * 3000));
    await scanProfile('auto');
  } catch (e) {
    leLog(`✗ auto-run error: ${e.message}`, 'error');
  }
})();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START' && message.task === 'lead-extractor') {
    const markSourceUrl = message.markSourceUrl || '';
    leLog(`▶ START (manual${markSourceUrl ? '+mark' : ''})`).then(() => scanProfile('manual'))
      .then(async (r) => {
        if (markSourceUrl) {
          try {
            const ok = await markLeadProcessed(markSourceUrl, { revisitedAt: new Date().toISOString() });
            await leLog(`✓ source lead marked processed=${ok} | ${markSourceUrl}`);
          } catch (e) {
            await leLog(`✗ markLeadProcessed error: ${e.message}`, 'error');
          }
        }
        sendResponse({ success: true, ...r });
      })
      .catch((err) => {
        leLog(`✗ fatal: ${err.message}`, 'error');
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
});

async function scanProfile(trigger) {
  const url = window.location.href.split('?')[0];
  const name = clean(
    document.querySelector('h1')?.textContent ||
    document.querySelector('.text-heading-xlarge')?.textContent || ''
  );
  const headline = clean(
    document.querySelector('.text-body-medium.break-words')?.textContent ||
    document.querySelector('div.pv-text-details__left-panel .text-body-medium')?.textContent || ''
  );

  // Restrict scan to main profile content to avoid emails from chat/feed sidebar
  const main = document.querySelector('main') || document.body;
  const text = (main.innerText || main.textContent || '');

  const matches = Array.from(new Set((text.match(EMAIL_REGEX_LE) || []).map(s => s.toLowerCase())));
  const filtered = matches.filter(e => !EMAIL_BLOCKLIST_LE.test(e));

  const isRecruiter = RECRUITER_HINTS.test(headline);
  const snippet = clean(text).slice(0, 300);

  let saved = 0;
  for (const email of filtered) {
    const wasNew = await saveLead({
      email,
      name,
      context: isRecruiter ? `profile-recruiter-${trigger}` : `profile-${trigger}`,
      snippet: `${headline} | ${snippet}`.slice(0, 300),
      sourceUrl: url,
    });
    if (wasNew) saved++;
  }

  // Even with no email, record recruiters as lead (manual follow-up)
  if (filtered.length === 0 && isRecruiter) {
    const wasNew = await saveLead({
      email: '',
      name,
      context: `profile-recruiter-no-email-${trigger}`,
      snippet: `${headline} | ${snippet}`.slice(0, 300),
      sourceUrl: url,
    });
    if (wasNew) saved++;
  }

  if (saved > 0) {
    await leLog(`✓ ${saved} lead(s) saved | ${name} | recruiter=${isRecruiter} | ${url}`, 'info');
    try { await chrome.runtime.sendMessage({ action: 'EXPORT_LOGS' }); } catch {}
  }

  return { saved, emailsFound: filtered.length, isRecruiter, url };
}

function clean(str) {
  return (str || '').replace(/\s+/g, ' ').trim();
}
