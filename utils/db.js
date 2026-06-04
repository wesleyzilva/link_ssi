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

// ─── Jobs (PM / Delivery / Agile) ─────────────────────────────────────────────

async function hasJob(jobId) {
  const { jobs = [] } = await chrome.storage.local.get('jobs');
  return jobs.some(j => j.jobId === jobId);
}

async function saveJob(job) {
  const { jobs = [] } = await chrome.storage.local.get('jobs');
  if (jobs.some(j => j.jobId === job.jobId)) return false;
  jobs.push({ capturedAt: new Date().toISOString(), processed: false, ...job });
  await chrome.storage.local.set({ jobs: jobs.slice(-1000) });
  return true;
}

async function getJobs() {
  const { jobs = [] } = await chrome.storage.local.get('jobs');
  return jobs;
}

/**
 * Returns up to `limit` jobs that have not been opened/detail-extracted yet,
 * oldest-first so the rotation cycles through everything fairly.
 */
async function getUnprocessedJobs(limit = 5) {
  const { jobs = [] } = await chrome.storage.local.get('jobs');
  return jobs
    .filter(j => !j.processed)
    .sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt))
    .slice(0, limit);
}

/**
 * Merges details (recruiter, emails, description, externalApplyUrl, ...)
 * into the job record and flips processed=true.
 */
async function markJobProcessed(jobId, details = {}) {
  const { jobs = [] } = await chrome.storage.local.get('jobs');
  let changed = false;
  const next = jobs.map(j => {
    if (j.jobId !== jobId) return j;
    changed = true;
    return { ...j, ...details, processed: true, processedAt: new Date().toISOString() };
  });
  if (changed) await chrome.storage.local.set({ jobs: next });
  return changed;
}

// ─── Leads (emails + hiring CTAs found in posts/profiles) ────────────────────

async function saveLead(lead) {
  const { leads = [] } = await chrome.storage.local.get('leads');
  // Dedup by (email || sourceUrl)
  const key = (lead.email || '').toLowerCase() + '|' + (lead.sourceUrl || '');
  if (leads.some(l => ((l.email || '').toLowerCase() + '|' + (l.sourceUrl || '')) === key)) return false;
  leads.push({ capturedAt: new Date().toISOString(), processed: false, ...lead });
  await chrome.storage.local.set({ leads: leads.slice(-1000) });
  return true;
}

async function getLeads() {
  const { leads = [] } = await chrome.storage.local.get('leads');
  return leads;
}

/**
 * Returns up to `limit` leads that have a LinkedIn profile URL and have not
 * been profile-visited yet. Oldest-first.
 */
async function getUnprocessedLeads(limit = 5) {
  const { leads = [] } = await chrome.storage.local.get('leads');
  return leads
    .filter(l => !l.processed && /linkedin\.com\/in\//.test(l.sourceUrl || ''))
    .sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt))
    .slice(0, limit);
}

async function markLeadProcessed(sourceUrl, details = {}) {
  if (!sourceUrl) return false;
  const norm = sourceUrl.split('?')[0];
  const { leads = [] } = await chrome.storage.local.get('leads');
  let changed = false;
  const next = leads.map(l => {
    if ((l.sourceUrl || '').split('?')[0] !== norm) return l;
    changed = true;
    return { ...l, ...details, processed: true, processedAt: new Date().toISOString() };
  });
  if (changed) await chrome.storage.local.set({ leads: next });
  return changed;
}
