/**
 * connection-tracker.js — Content script for linkedin.com/mynetwork/invitation-manager/sent/
 *
 * Detects which sent connection requests have been accepted by comparing the
 * pending-invitation list on LinkedIn against our stored `connections` array.
 *
 * Logic:
 *   - Load /mynetwork/invitation-manager/sent/ → scrape profile IDs of STILL-PENDING invitations
 *   - Any connection in storage that is NOT in the pending list → accepted (or withdrawn by us)
 *   - Mark accepted connections with acceptedAt timestamp
 *   - Store newly accepted connections in `acceptedConnections` for follow-up-sender to process
 *
 * After completion: sends EXPORT_LOGS to service worker so CSVs are up to date.
 */

// utils/human-mimicry.js is loaded before this script by the manifest

async function contentLog(msg, level = 'info') {
  const entry = { ts: new Date().toISOString(), level, script: 'connection-tracker', msg };
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[Connection Tracker]', msg);
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push(entry);
    await chrome.storage.local.set({ activityLog: activityLog.slice(-500) });
  } catch (e) { console.warn('[Connection Tracker][contentLog failed]', e); }
}

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START' && message.task === 'connection-tracker') {
    trackConnections()
      .then(result => sendResponse({ success: true, ...result }))
      .catch(err => {
        contentLog(`✗ connection-tracker fatal: ${err.message}`, 'error');
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
});

// ─── Core ─────────────────────────────────────────────────────────────────────

async function trackConnections() {
  await contentLog(`▶ connection-tracker started | ${window.location.href}`);
  await randomWait(4000, 7000);

  // Scroll through the pending invitations page to load all items
  await simulatePageReading(5000);

  const pendingIds = getPendingInvitationIds();
  await contentLog(`📋 pending invitations on page: ${pendingIds.size}`);

  const { connections = [], acceptedConnections = [] } = await chrome.storage.local.get([
    'connections', 'acceptedConnections',
  ]);

  // Filter: connections we sent, that are NOT still pending = accepted
  const alreadyAcceptedIds = new Set(acceptedConnections.map(a => a.profileId));
  const newlyAccepted = [];

  for (const conn of connections) {
    if (alreadyAcceptedIds.has(conn.profileId)) continue; // already tracked
    if (pendingIds.has(conn.profileId)) continue;          // still pending

    // Not in pending and not yet tracked → accepted
    // Only count connections sent more than 2h ago (avoids false positives)
    const sentMs = conn.sentAt ? Date.now() - new Date(conn.sentAt).getTime() : 0;
    if (sentMs < 2 * 60 * 60 * 1000) continue;

    newlyAccepted.push({
      profileId: conn.profileId,
      name: conn.name || '',
      profileUrl: conn.profileUrl || `https://www.linkedin.com/in/${conn.profileId}/`,
      sentAt: conn.sentAt,
      acceptedAt: new Date().toISOString(),
      followUpSent: false,
    });
    await contentLog(`✓ ACCEPTED | ${conn.name || conn.profileId} | ${conn.profileUrl || ''}`, 'success');
  }

  const updatedAccepted = [...acceptedConnections, ...newlyAccepted].slice(-500);
  await chrome.storage.local.set({ acceptedConnections: updatedAccepted });

  // Acceptance rate metrics
  const totalSent = connections.length;
  const totalAccepted = updatedAccepted.length;
  const rate = totalSent > 0 ? Math.round((totalAccepted / totalSent) * 100) : 0;

  const summary = {
    newlyAccepted: newlyAccepted.length,
    totalAccepted,
    totalSent,
    acceptanceRate: `${rate}%`,
    runAt: new Date().toISOString(),
  };

  await chrome.storage.local.set({ lastConnectionTracking: summary });
  await contentLog(
    `■ connection-tracker DONE | +${newlyAccepted.length} accepted | total: ${totalAccepted}/${totalSent} (${rate}%)`,
    'success'
  );

  // Trigger CSV export
  try {
    await chrome.runtime.sendMessage({ action: 'EXPORT_LOGS' });
  } catch (e) { /* service worker may be sleeping */ }

  return summary;
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function getPendingInvitationIds() {
  const ids = new Set();

  // Strategy 1: invitation cards on /mynetwork/invitation-manager/sent/
  const cards = Array.from(document.querySelectorAll(
    '.invitation-card, ' +
    '[data-view-name="invitation-card"], ' +
    '.mn-invitation-card, ' +
    'li.invitations-list__item'
  ));

  // Strategy 2: any list item with a /in/ profile link on this page
  const byLink = cards.length ? cards : Array.from(document.querySelectorAll('li, .artdeco-list__item')).filter(
    el => el.querySelector('a[href*="/in/"]')
  );

  for (const card of byLink) {
    const link = card.querySelector('a[href*="/in/"]');
    if (!link) continue;
    const match = link.href.match(/\/in\/([^/?#]+)/);
    if (match) ids.add(match[1]);
  }

  // Strategy 3: data-member-id attributes
  document.querySelectorAll('[data-member-id]').forEach(el => {
    ids.add(el.getAttribute('data-member-id'));
  });

  return ids;
}
