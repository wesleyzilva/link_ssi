/**
 * profile-discoverer.js — Content script for linkedin.com/in/*
 *
 * BFS discovery of similar LinkedIn profiles via the Voyager API.
 * Inspired by the tree-based discovery algorithm in:
 *   naoEmeu/linkedin-leads-discover/src/discovery/tree_discovery.py
 *
 * What it does:
 *   1. Reads the profileId of the current page (/in/{publicId}/)
 *   2. Calls Voyager's "browse map" (similar profiles) endpoint for that profile
 *   3. Saves the discovered profiles to chrome.storage.local under `discoveredProfiles`
 *   4. The recruiter-prospector.js reads `discoveredProfiles` as a pre-filtered
 *      queue instead of relying only on LinkedIn's search results page
 *
 * Depth and caps (conservative — avoid triggering LinkedIn's anomaly detection):
 *   MAX_DEPTH    : 1  — only one hop from the seed profile
 *   MAX_PROFILES : 20 — hard cap per run
 *   DELAY_BETWEEN: 3–7 s human-mimicry between API calls
 *
 * Trigger:
 *   Service Worker sends { action: 'START', task: 'profile-discoverer' }
 *   Optionally includes { depth, maxProfiles } to override defaults.
 *
 * Storage key: `discoveredProfiles` — array of { profileId, name, headline, discoveredAt, source }
 *   Anti-duplication enforced via profileId. Max 200 entries (FIFO).
 *
 * NOTE — Voyager similar-profiles endpoint discovery:
 *   If VOYAGER_SIMILAR_PATH returns 404, open any LinkedIn profile while logged in,
 *   press F12 → Network → filter "voyager/api" → look for "browsemap" or "similar"
 *   in the XHR requests → copy the path pattern and update VOYAGER_SIMILAR_PATH below.
 */

// utils/human-mimicry.js, utils/db.js, and utils/voyager-fetch.js loaded before this by manifest

// ─── Activity logger ──────────────────────────────────────────────────────────

async function contentLog(msg, level = 'info') {
  const entry = { ts: new Date().toISOString(), level, script: 'profile-discoverer', msg };
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[Profile Discoverer]', msg);
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push(entry);
    await chrome.storage.local.set({ activityLog: activityLog.slice(-300) });
  } catch (e) { console.warn('[Profile Discoverer][contentLog failed]', e); }
}

// ─── Voyager similar-profiles path ───────────────────────────────────────────
// Two known variants — tried in order. Update if LinkedIn changes routing.
const VOYAGER_SIMILAR_PATHS = [
  (profileUrn) => `/identity/browsemap/profiles?q=similarProfiles&profileId=${encodeURIComponent(profileUrn)}&count=10`,
  (publicId)   => `/identity/profiles/${publicId}/browseMapV2?count=10`,
];

// ─── Caps ─────────────────────────────────────────────────────────────────────

const DEFAULT_DEPTH       = 1;
const DEFAULT_MAX_PROFILES = 20;
const STORAGE_CAP         = 200;

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START' && message.task === 'profile-discoverer') {
    const depth       = typeof message.depth       === 'number' ? message.depth       : DEFAULT_DEPTH;
    const maxProfiles = typeof message.maxProfiles === 'number' ? message.maxProfiles : DEFAULT_MAX_PROFILES;

    discoverSimilarProfiles(depth, maxProfiles)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((err) => {
        contentLog(`✗ profile-discoverer fatal: ${err.message}`, 'error');
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
});

// ─── Core BFS discovery ───────────────────────────────────────────────────────

/**
 * BFS discovery of similar profiles starting from the current page's profile.
 *
 * @param {number} depth       - How many hops from the seed profile (max 2 recommended)
 * @param {number} maxProfiles - Hard cap on total profiles to discover per run
 * @returns {Promise<{ discovered: number, skipped: number }>}
 */
async function discoverSimilarProfiles(depth, maxProfiles) {
  await contentLog(`▶ profile-discoverer started | depth:${depth} max:${maxProfiles} | ${window.location.href}`);
  await randomWait(3000, 6000);

  // Extract publicId from current URL: /in/{publicId}/
  const publicId = extractPublicId(window.location.pathname);
  if (!publicId) {
    await contentLog('✗ could not extract publicId from URL — not a profile page?', 'error');
    throw new Error('Not a LinkedIn profile page.');
  }
  await contentLog(`→ seed profile: ${publicId}`);

  // Load existing discovered profiles for deduplication
  const { discoveredProfiles = [] } = await chrome.storage.local.get('discoveredProfiles');
  const existingIds = new Set(discoveredProfiles.map(p => p.profileId));

  const newProfiles = [];
  let skipped = 0;

  // BFS queue: each entry is { publicId, level }
  const queue = [{ publicId, level: 0 }];
  const seen  = new Set([publicId]);

  while (queue.length > 0 && newProfiles.length < maxProfiles) {
    const { publicId: currentId, level } = queue.shift();
    if (level >= depth) continue;

    const similar = await fetchSimilarProfiles(currentId);
    if (!similar || similar.length === 0) continue;

    for (const profile of similar) {
      if (newProfiles.length >= maxProfiles) break;
      if (!profile.profileId) continue;

      if (seen.has(profile.profileId)) {
        skipped++;
        continue;
      }
      seen.add(profile.profileId);

      if (existingIds.has(profile.profileId)) {
        skipped++;
        await contentLog(`↷ skip (already known): ${profile.name || profile.profileId}`);
        continue;
      }

      newProfiles.push({ ...profile, discoveredAt: new Date().toISOString(), source: `similar:${currentId}` });
      await contentLog(`✓ discovered: ${profile.name || profile.profileId} | ${profile.headline || ''}`, 'success');

      // Enqueue for next hop if depth allows
      if (level + 1 < depth) {
        queue.push({ publicId: profile.profileId, level: level + 1 });
      }

      await randomWait(3000, 7000); // human-mimicry between API calls
    }
  }

  // Persist — merge with existing, cap at STORAGE_CAP (FIFO)
  const merged = [...discoveredProfiles, ...newProfiles].slice(-STORAGE_CAP);
  await chrome.storage.local.set({ discoveredProfiles: merged });

  await contentLog(`■ profile-discoverer done | discovered:${newProfiles.length} skipped:${skipped} total_stored:${merged.length}`, 'success');
  return { discovered: newProfiles.length, skipped, totalStored: merged.length };
}

/**
 * Calls the Voyager "similar profiles" endpoint for a given publicId.
 * Tries both known path variants; returns null if both fail.
 *
 * @param {string} publicId
 * @returns {Promise<Array<{ profileId, name, headline, profileUrl }> | null>}
 */
async function fetchSimilarProfiles(publicId) {
  // Build the paths — first variant uses a URN, second uses publicId directly
  const profileUrn = `urn:li:member:${publicId}`; // approximate — actual urn may differ
  const paths = [
    VOYAGER_SIMILAR_PATHS[0](profileUrn),
    VOYAGER_SIMILAR_PATHS[1](publicId),
  ];

  for (const path of paths) {
    try {
      const data = await voyagerFetch(path);
      const profiles = parseSimilarProfilesResponse(data, publicId);
      if (profiles !== null) {
        await contentLog(`→ voyager similar: ${profiles.length} results via ${path}`);
        return profiles;
      }
    } catch (e) {
      await contentLog(`⚠ similar-profiles path failed (${path}): ${e.message}`, 'warn');
    }
  }

  // DOM fallback: read "People Also Viewed" sidebar
  return parseSimilarProfilesFromDOM();
}

/**
 * Parses the Voyager response for similar profiles.
 * Handles both known response shapes. Returns null if unrecognised.
 *
 * Shape A — browsemap: { included: [ { $type: '...Profile', publicIdentifier, firstName, lastName, headline }, ... ] }
 * Shape B — browseMapV2: { elements: [ { profile: { publicIdentifier, ... } }, ... ] }
 */
function parseSimilarProfilesResponse(data, sourcepublicId) {
  // Shape A: included array (normalised+json envelope)
  if (Array.isArray(data?.included)) {
    const profiles = data.included
      .filter(e => e.publicIdentifier && e.publicIdentifier !== sourcepublicId)
      .map(e => ({
        profileId:  e.publicIdentifier,
        name:       [e.firstName, e.lastName].filter(Boolean).join(' ') || null,
        headline:   e.headline?.text || e.headline || null,
        profileUrl: `https://www.linkedin.com/in/${e.publicIdentifier}/`,
      }));
    if (profiles.length > 0) return profiles;
  }

  // Shape B: elements array
  if (Array.isArray(data?.elements)) {
    const profiles = data.elements
      .map(e => e.profile || e)
      .filter(p => p.publicIdentifier && p.publicIdentifier !== sourcepublicId)
      .map(p => ({
        profileId:  p.publicIdentifier,
        name:       [p.firstName, p.lastName].filter(Boolean).join(' ') || null,
        headline:   p.headline?.text || p.headline || null,
        profileUrl: `https://www.linkedin.com/in/${p.publicIdentifier}/`,
      }));
    if (profiles.length > 0) return profiles;
  }

  // Log the top-level keys so we can identify the actual shape in DevTools
  console.warn('[Profile Discoverer] parseSimilarProfilesResponse — unrecognised shape. Top-level keys:', Object.keys(data || {}));
  return null;
}

/**
 * DOM fallback: reads "People Also Viewed" sidebar links.
 * Used when both Voyager paths return 404 or unrecognised JSON.
 * Selectors may break if LinkedIn redesigns the sidebar.
 */
function parseSimilarProfilesFromDOM() {
  const container = document.querySelector(
    '[data-view-name="profile-card-browsemap"], .browsemap-section, aside[class*="similar"]'
  );
  if (!container) return [];

  const links = Array.from(container.querySelectorAll('a[href*="/in/"]'));
  const profiles = [];

  for (const link of links) {
    const match = link.href.match(/\/in\/([^/?#]+)/);
    if (!match) continue;
    const profileId = match[1];

    const nameEl    = link.querySelector('.actor-name, [class*="name"], [class*="title"]');
    const headlineEl = link.closest('li, article')?.querySelector('[class*="subtitle"], [class*="headline"]');

    profiles.push({
      profileId,
      name:       nameEl?.textContent?.trim() || null,
      headline:   headlineEl?.textContent?.trim() || null,
      profileUrl: `https://www.linkedin.com/in/${profileId}/`,
    });
  }

  if (profiles.length > 0) {
    console.log(`[Profile Discoverer] DOM fallback: ${profiles.length} profiles from sidebar`);
  }
  return profiles;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractPublicId(pathname) {
  const match = pathname.match(/^\/in\/([^/?#]+)/);
  return match ? match[1] : null;
}
