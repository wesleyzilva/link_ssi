/**
 * db.js — chrome.storage.local adapter (no IndexedDB)
 *
 * All persistence lives in chrome.storage.local so that every page in the
 * extension (popup, history, content scripts) reads and writes the same data
 * without origin-scoping problems.
 *
 * Storage keys:
 *   ssiScores          : SSI snapshots array  (max 90 entries → ~3 months daily)
 *   processedPosts     : { [postId]: isoString }  — like dedup
 *   processedRecruiters: { [profileId]: { name, lastInteraction: isoString } }
 *
 * The history page already owns:
 *   connections, postInteractions, relationships, activityLog
 */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// ─── SSI Scores ───────────────────────────────────────────────────────────────

/**
 * Appends one daily SSI snapshot. Keeps the last 90 records.
 */
async function saveSSIScore(scores) {
  const { ssiScores = [] } = await chrome.storage.local.get('ssiScores');
  ssiScores.push({
    date: new Date().toISOString().split('T')[0],
    capturedAt: new Date().toISOString(),
    ...scores,
  });
  await chrome.storage.local.set({ ssiScores: ssiScores.slice(-90) });
}

/**
 * Returns the last N SSI snapshots sorted by date ascending.
 */
async function getSSIHistory(limit = 30) {
  const { ssiScores = [] } = await chrome.storage.local.get('ssiScores');
  return ssiScores.slice(-limit);
}

// ─── Post deduplication (like guard) ─────────────────────────────────────────

/**
 * Returns true if this post was already LIKED in a previous session.
 * Comment dedup is handled separately via postInteractions in the content script.
 */
async function hasInteractedWithPost(postId) {
  const { processedPosts = {} } = await chrome.storage.local.get('processedPosts');
  return Object.prototype.hasOwnProperty.call(processedPosts, postId);
}

/**
 * Records a like interaction for this post.
 */
async function markPostAsInteracted(postId) {
  const { processedPosts = {} } = await chrome.storage.local.get('processedPosts');
  processedPosts[postId] = new Date().toISOString();
  // Cap the object at 500 entries to prevent unbounded growth
  const keys = Object.keys(processedPosts);
  if (keys.length > 500) {
    const toRemove = keys.slice(0, keys.length - 500);
    toRemove.forEach(k => delete processedPosts[k]);
  }
  await chrome.storage.local.set({ processedPosts });
}

// ─── Recruiter 7-day lock ─────────────────────────────────────────────────────

/**
 * Returns true if the recruiter was contacted within the last 7 days.
 */
async function isRecruiterLocked(profileId) {
  const { processedRecruiters = {} } = await chrome.storage.local.get('processedRecruiters');
  const record = processedRecruiters[profileId];
  if (!record) return false;
  return (Date.now() - new Date(record.lastInteraction).getTime()) < SEVEN_DAYS_MS;
}

/**
 * Records (or refreshes) the 7-day lock for this recruiter.
 */
async function markRecruiterInteracted(profileId, name = '') {
  const { processedRecruiters = {} } = await chrome.storage.local.get('processedRecruiters');
  processedRecruiters[profileId] = { name, lastInteraction: new Date().toISOString() };
  await chrome.storage.local.set({ processedRecruiters });
}

/**
 * Returns all recruiter lock records for dashboard display.
 */
async function getAllRecruiters() {
  const { processedRecruiters = {} } = await chrome.storage.local.get('processedRecruiters');
  return Object.entries(processedRecruiters).map(([profileId, v]) => ({ profileId, ...v }));
}
