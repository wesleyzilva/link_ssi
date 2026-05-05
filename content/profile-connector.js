/**
 * profile-connector.js — Content script for linkedin.com/in/* profile pages
 *
 * Actions performed on each recruiter profile visit:
 *   1. Follow  — clicks the visible "Follow" button (if not already following)
 *   2. Connect — opens "More" → "Connect" → sends WITHOUT a note
 *
 * Rules:
 *   - Per-profile dedup via chrome.storage.local (key: profileInteractions)
 *   - Daily cap passed from service worker via START message (default: 5)
 *   - Human-mimicry: all actions use randomWait + humanClick
 *   - Logs everything to activityLog for debugging
 */

// utils/human-mimicry.js and utils/db.js are injected by the manifest before this script

// ─── Logger ───────────────────────────────────────────────────────────────────

async function contentLog(msg, level = 'info') {
  const entry = { ts: new Date().toISOString(), level, script: 'profile-connector', msg };
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[Profile Connector]', msg);
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push(entry);
    await chrome.storage.local.set({ activityLog: activityLog.slice(-500) });
  } catch (e) { console.warn('[Profile Connector][contentLog failed]', e); }
}

// ─── Caps ─────────────────────────────────────────────────────────────────────

let SESSION_CAP = 5;

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START' && message.task === 'profile-connector') {
    if (typeof message.dailyCap === 'number') SESSION_CAP = message.dailyCap;
    connectProfile()
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => {
        contentLog(`✗ profile-connector fatal error: ${error.message}`, 'error');
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

// ─── Core ─────────────────────────────────────────────────────────────────────

async function connectProfile() {
  const profileId = extractProfileIdFromUrl(window.location.href);
  if (!profileId) {
    await contentLog('⚠ could not extract profile ID from URL — aborting', 'warn');
    return { followed: false, connected: false };
  }

  await contentLog(`▶ profile-connector started | profileId=${profileId} | url=${window.location.href}`);

  // Check dedup — skip if already processed in a previous run
  const alreadyFollowed  = await hasProfileInteraction(profileId, 'follow');
  const alreadyConnected = await hasProfileInteraction(profileId, 'connect');

  if (alreadyFollowed && alreadyConnected) {
    await contentLog(`↷ ${profileId} — already followed + connected, skipping`);
    return { followed: false, connected: false };
  }

  // Wait for the profile header to render
  await randomWait(3000, 6000);
  await simulatePageReading(randomInt(5000, 10000));

  let followed  = false;
  let connected = false;

  // ── 1. FOLLOW ──────────────────────────────────────────────────────────────
  if (!alreadyFollowed) {
    try {
      followed = await followProfile();
      if (followed) {
        await saveProfileInteraction(profileId, 'follow');
        await contentLog(`✓ FOLLOW | ${profileId}`, 'success');
        await randomWait(3000, 7000);
      } else {
        await contentLog(`⚠ follow skipped — button not found or already following | ${profileId}`, 'warn');
      }
    } catch (e) {
      await contentLog(`✗ follow error | ${profileId}: ${e.message}`, 'error');
    }
  }

  // ── 2. CONNECT via More → Connect ─────────────────────────────────────────
  if (!alreadyConnected) {
    try {
      connected = await connectViaMoreMenu();
      if (connected) {
        await saveProfileInteraction(profileId, 'connect');
        await contentLog(`✓ CONNECT | ${profileId}`, 'success');
        await randomWait(5000, 12000);
      } else {
        await contentLog(`⚠ connect skipped — button not found or already connected | ${profileId}`, 'warn');
      }
    } catch (e) {
      await contentLog(`✗ connect error | ${profileId}: ${e.message}`, 'error');
    }
  }

  // Persist summary to lastProfileConnection for popup display
  try {
    await chrome.storage.local.set({
      lastProfileConnection: {
        profileId,
        url: window.location.href,
        followed,
        connected,
        runAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    await contentLog(`✗ failed to save lastProfileConnection: ${e.message}`, 'error');
  }

  await contentLog(
    `■ profile-connector DONE | followed=${followed} connected=${connected} | ${profileId}`,
    'success'
  );

  return { followed, connected };
}

// ─── Follow ───────────────────────────────────────────────────────────────────

async function followProfile() {
  // LinkedIn renders the Follow button directly in the profile actions section
  // near the background image / hero area
  const followBtn =
    document.querySelector('.pv-top-card-v2-ctas button[aria-label*="Follow"]') ||
    document.querySelector('.pvs-profile-actions button[aria-label*="Follow"]') ||
    document.querySelector('.pvs-profile-actions button[aria-label*="Seguir"]') ||
    document.querySelector('.profile-header-cta-section button[aria-label*="Follow"]') ||
    document.querySelector('.profile-header-cta-section button[aria-label*="Seguir"]') ||
    document.querySelector('section.pv-top-card button[aria-label*="Follow"]') ||
    document.querySelector('section.pv-top-card button[aria-label*="Seguir"]') ||
    Array.from(document.querySelectorAll('button')).find((b) => {
      const label = (b.getAttribute('aria-label') || b.textContent || '').trim().toLowerCase();
      return label === 'follow'  || label.startsWith('follow ') ||
             label === 'seguir'  || label.startsWith('seguir ');
    });

  if (!followBtn) return false;

  const label = (followBtn.getAttribute('aria-label') || followBtn.textContent || '').toLowerCase();
  if (label.includes('following') || label.includes('unfollow') ||
      label.includes('seguindo')  || label.includes('deixar de seguir')) {
    await contentLog('ℹ already following this profile');
    return false;
  }

  await scrollIntoViewAndPause(followBtn);
  await humanClick(followBtn);
  return true;
}

// ─── Connect via More menu ────────────────────────────────────────────────────

async function connectViaMoreMenu() {
  // First check if a direct Connect button is already visible (1st/2nd degree)
  const directConnect = getDirectConnectButton();
  if (directConnect) {
    await scrollIntoViewAndPause(directConnect);
    await humanClick(directConnect);
    return handleConnectionModalNoNote();
  }

  // 3rd degree: Connect is hidden inside the "More actions" overflow menu
  const moreBtn = getMoreActionsButton();
  if (!moreBtn) {
    await contentLog('⚠ More-actions button not found', 'warn');
    return false;
  }

  await scrollIntoViewAndPause(moreBtn);
  await humanClick(moreBtn);
  await randomWait(800, 1800);

  // Wait for the dropdown to render
  const connectInDropdown = await waitForDropdownConnect(3000);
  if (!connectInDropdown) {
    // Close the dropdown and report
    moreBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await contentLog('⚠ Connect option not found in More dropdown', 'warn');
    return false;
  }

  await humanClick(connectInDropdown);
  return handleConnectionModalNoNote();
}

function getDirectConnectButton() {
  return (
    document.querySelector('.pvs-profile-actions button[aria-label*="Connect"]') ||
    document.querySelector('.pvs-profile-actions button[aria-label*="Conectar"]') ||
    document.querySelector('.pvs-profile-actions button[aria-label*="Convidar"]') ||
    document.querySelector('.pv-top-card-v2-ctas button[aria-label*="Connect"]') ||
    document.querySelector('.pv-top-card-v2-ctas button[aria-label*="Conectar"]') ||
    document.querySelector('section.pv-top-card button[aria-label*="Connect"]') ||
    document.querySelector('section.pv-top-card button[aria-label*="Conectar"]') ||
    Array.from(document.querySelectorAll('button')).find((b) => {
      const label = (b.getAttribute('aria-label') || b.textContent || '').trim().toLowerCase();
      return label === 'connect'    || label.startsWith('connect ') ||
             label === 'conectar'   || label.startsWith('conectar ') ||
             label === 'conectar-se' ||
             /^convidar .+ para se? conectar/i.test(label);
    }) || null
  );
}

function getMoreActionsButton() {
  return (
    document.querySelector('button[aria-label="More actions"]') ||
    document.querySelector('button[aria-label="More options"]') ||
    document.querySelector('button[aria-label="Mais a\u00e7\u00f5es"]') ||
    document.querySelector('button[aria-label="Mais op\u00e7\u00f5es"]') ||
    document.querySelector('.pvs-profile-actions button[aria-label*="More"]') ||
    document.querySelector('.pvs-profile-actions button[aria-label*="Mais"]') ||
    document.querySelector('.pv-top-card-v2-ctas button[aria-label*="More"]') ||
    document.querySelector('.pv-top-card-v2-ctas button[aria-label*="Mais"]') ||
    Array.from(document.querySelectorAll('button')).find((b) => {
      const label = (b.getAttribute('aria-label') || b.textContent || '').trim().toLowerCase();
      return label === 'more'  || label === 'more actions' || label === 'more options' ||
             label === 'mais'  || label === 'mais a\u00e7\u00f5es' || label === 'mais op\u00e7\u00f5es' ||
             label === '\u2026';
    }) || null
  );
}

async function waitForDropdownConnect(maxWait = 3000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const item =
      document.querySelector('[data-view-name="profile-overflow-action"] li button[aria-label*="Connect"]')   ||
      document.querySelector('[data-view-name="profile-overflow-action"] li button[aria-label*="Conectar"]')  ||
      document.querySelector('[data-view-name="profile-overflow-action"] li button[aria-label*="Convidar"]')  ||
      document.querySelector('.artdeco-dropdown__content li button[aria-label*="Connect"]')   ||
      document.querySelector('.artdeco-dropdown__content li button[aria-label*="Conectar"]')  ||
      document.querySelector('.artdeco-dropdown__content li button[aria-label*="Convidar"]')  ||
      document.querySelector('.pv-profile-section__actions-toggle button[aria-label*="Connect"]') ||
      Array.from(document.querySelectorAll(
        '.artdeco-dropdown__content li, [data-view-name="profile-overflow-action"] li'
      )).reduce((found, li) => {
        if (found) return found;
        const btn = li.querySelector('button') || li;
        const label = (btn.getAttribute('aria-label') || btn.textContent || '').trim().toLowerCase();
        return (
          label === 'connect'    || label.startsWith('connect ') ||
          label === 'conectar'   || label.startsWith('conectar ') ||
          label === 'conectar-se' || label === 'convidar' ||
          /^invite .+ to connect/i.test(label) ||
          /^convidar .+ para se? conectar/i.test(label)
        ) ? btn : null;
      }, null);

    if (item) return item;
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

// ─── Connection modal — always send WITHOUT a note ────────────────────────────

async function handleConnectionModalNoNote() {
  const modal = await new Promise(resolve => {
    const deadline = Date.now() + 6000;
    const tick = setInterval(() => {
      const m =
        // LinkedIn 2026: "Add a note to your invitation?" dialog
        document.querySelector('[data-test-modal-id="send-invite-modal"]') ||
        document.querySelector('[data-test-modal-id="send-connections-modal"]') ||
        document.querySelector('div[aria-label*="Add a note"]') ||
        document.querySelector('div[aria-label*="invitation"]') ||
        // Classic selectors
        document.querySelector('.send-invite') ||
        document.querySelector('[data-test-modal]') ||
        document.querySelector('.artdeco-modal[role="dialog"]') ||
        document.querySelector('div[role="dialog"]');
      if (m || Date.now() >= deadline) { clearInterval(tick); resolve(m || null); }
    }, 300);
  });

  if (!modal) {
    // No modal means LinkedIn sent directly (1st/2nd degree or already connected)
    await contentLog('📤 connection sent directly — no modal');
    return true;
  }

  await contentLog('📋 connection modal appeared — sending without note');

  // Priority: "Send without a note" — EN + PT-BR variants
  const sendWithoutNote =
    modal.querySelector('[aria-label="Send without a note"]') ||
    modal.querySelector('[aria-label="Enviar sem nota"]') ||
    modal.querySelector('[aria-label="Enviar sem notas"]') ||
    modal.querySelector('[data-control-name="connect.send_without_note"]') ||
    modal.querySelector('button[data-control-name*="without"]') ||
    Array.from(modal.querySelectorAll('button')).find(
      b => /send without/i.test(b.textContent) ||
           /sem nota/i.test(b.textContent)       ||
           /without a note/i.test(b.getAttribute('aria-label') || '') ||
           /sem nota/i.test(b.getAttribute('aria-label') || '')
    );

  if (sendWithoutNote) {
    await humanClick(sendWithoutNote);
    await randomWait(1000, 2500);
    await contentLog('✓ sent without note');
    return true;
  }

  // Fallback: generic send button — EN + PT-BR
  const sendBtn =
    modal.querySelector('[aria-label="Send now"]') ||
    modal.querySelector('[aria-label="Enviar agora"]') ||
    modal.querySelector('[aria-label="Send invitation"]') ||
    modal.querySelector('[aria-label="Enviar convite"]') ||
    modal.querySelector('button[data-control-name="send-invite-cta-btn"]') ||
    Array.from(modal.querySelectorAll('button')).find(
      b => !b.disabled && (/^send/i.test(b.textContent.trim()) || /^enviar/i.test(b.textContent.trim()))
    );

  if (sendBtn) {
    await humanClick(sendBtn);
    await randomWait(1000, 2500);
    await contentLog('✓ sent via generic send button');
    return true;
  }

  await contentLog(`⚠ no send button found — dumping modal: ${modal.innerHTML.slice(0, 400)}`, 'warn');
  const dismissBtn =
    modal.querySelector('[aria-label="Dismiss"]') ||
    modal.querySelector('.artdeco-modal__dismiss');
  if (dismissBtn) await humanClick(dismissBtn);
  return false;
}

// ─── Dedup helpers ────────────────────────────────────────────────────────────

async function hasProfileInteraction(profileId, action) {
  try {
    const { profileInteractions = [] } = await chrome.storage.local.get('profileInteractions');
    return profileInteractions.some(r => r.profileId === profileId && r.action === action);
  } catch { return false; }
}

async function saveProfileInteraction(profileId, action) {
  try {
    const { profileInteractions = [] } = await chrome.storage.local.get('profileInteractions');
    profileInteractions.push({
      profileId,
      action,
      url: window.location.href,
      savedAt: new Date().toISOString(),
    });
    await chrome.storage.local.set({ profileInteractions: profileInteractions.slice(-500) });
  } catch (e) {
    console.warn('[Profile Connector][saveProfileInteraction failed]', e);
  }
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

function extractProfileIdFromUrl(url) {
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/);
  return match ? match[1] : null;
}
