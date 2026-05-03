/**
 * logger.js — Shared activity log utility.
 *
 * Appends timestamped entries to chrome.storage.local['activityLog'].
 * Works from both the Service Worker and content script contexts.
 * Cap: keeps the last 60 entries; older entries are discarded automatically.
 */

const MAX_ENTRIES = 300;

/**
 * Appends a log entry visible in the popup's Activity Log panel.
 *
 * @param {string} message
 * @param {'info'|'warn'|'error'|'success'} level
 */
export async function log(message, level = 'info') {
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    const entry = { ts: new Date().toISOString(), level, msg: message };
    const updated = [...activityLog, entry].slice(-MAX_ENTRIES);
    await chrome.storage.local.set({ activityLog: updated });
    // Also surface to console for DevTools debugging
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
      `[SSI Optimizer] ${message}`
    );
  } catch {
    console.warn('[Logger] Could not write to storage:', message);
  }
}

/**
 * Clears the entire activity log (called from popup "Clear" button).
 */
export async function clearLog() {
  await chrome.storage.local.set({ activityLog: [] });
}
