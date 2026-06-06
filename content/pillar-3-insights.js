/**
 * pillar-3-insights.js — SSI Pillar 3: Interagir oferecendo insights
 *
 * Flow per post:
 *   1. Find post card
 *   2. Skip if already liked (aria-pressed="true" on Like button OR in dedup storage)
 *   3. Like the post
 *   4. Comment with COMMENT_TEXT
 *   5. Mark postId in dedup storage (30-day TTL)
 *
 * Cap: 4 posts per run
 * Dedup key: "engagedPosts" in chrome.storage.local
 *
 * Fixed comment:
 *   "Let´s connect and delivery ! https://wesleyzilva.github.io/portfolioNearshoreWesIA/"
 *
 * Manifest matches:
 *   https://www.linkedin.com/feed/hashtag/*
 *   https://www.linkedin.com/search/results/content/*
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const P3_SCRIPT     = 'pillar-3-insights';
const P3_CAP        = 4;
const P3_DEDUP_DAYS = 30;

const COMMENT_TEXT = 'Let\u00b4s connect and delivery ! https://wesleyzilva.github.io/portfolioNearshoreWesIA/';

// ─── Logger ───────────────────────────────────────────────────────────────────

async function p3Log(msg, level = 'info') {
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](`[P3] ${msg}`);
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push({ ts: new Date().toISOString(), level, script: P3_SCRIPT, msg });
    await chrome.storage.local.set({ activityLog: activityLog.slice(-500) });
  } catch (e) { console.warn('[P3][log]', e); }
}

// ─── Deduplication ────────────────────────────────────────────────────────────

async function hasEngaged(postId) {
  const { engagedPosts = [] } = await chrome.storage.local.get('engagedPosts');
  const cutoff = Date.now() - P3_DEDUP_DAYS * 24 * 60 * 60 * 1000;
  return engagedPosts.some(e => e.id === postId && new Date(e.ts).getTime() > cutoff);
}

async function markEngaged(postId) {
  const { engagedPosts = [] } = await chrome.storage.local.get('engagedPosts');
  engagedPosts.push({ id: postId, ts: new Date().toISOString() });
  await chrome.storage.local.set({ engagedPosts: engagedPosts.slice(-2000) });
}

// ─── Post helpers ─────────────────────────────────────────────────────────────

function getPostId(post) {
  const urn = post.getAttribute('data-occludable-entity-urn') ||
              post.closest('[data-occludable-entity-urn]')?.getAttribute('data-occludable-entity-urn');
  if (urn) return urn;

  const link = post.querySelector('a[href*="/posts/"], a[href*="/feed/update/"]');
  if (link) {
    const m = link.href.match(/urn:li:activity:\d+|ugcPost:\d+/);
    return m ? m[0] : link.href;
  }
  return null;
}

/**
 * Returns true if the Like button on this post card is already in pressed state.
 * Covers: aria-pressed="true", aria-label containing "Unlike", and class-based indicators.
 */
function isAlreadyLiked(post) {
  const likeSelectors = [
    'button[aria-label*="Unlike"]',
    'button[aria-label*="unlike"]',
    'button[aria-pressed="true"][aria-label*="ike"]',
    '.react-button__trigger--active',
  ];
  return likeSelectors.some(sel => !!post.querySelector(sel));
}

// ─── Like action ──────────────────────────────────────────────────────────────

async function likePost(post) {
  const likeSelectors = [
    'button[aria-label*="Like"][aria-pressed="false"]',
    'button[aria-label*="Like"]:not([aria-pressed="true"])',
    'button[aria-label="Like"]',
    '[data-control-name="react_button"]',
  ];

  let btn = null;
  for (const sel of likeSelectors) {
    btn = post.querySelector(sel);
    if (btn) break;
  }

  if (!btn) {
    await p3Log('⚠ like button not found', 'warn');
    return false;
  }

  await scrollIntoViewAndPause(btn);
  await humanClick(btn);
  await randomWait(1000, 2000);
  return true;
}

// ─── Comment action ───────────────────────────────────────────────────────────

async function postComment(post, commentText) {
  // Step 1: click Comment button
  const commentBtnSelectors = [
    'button[aria-label*="Comment"]',
    'button[aria-label*="comment"]',
    '[data-control-name="comment"]',
  ];

  let commentBtn = null;
  for (const sel of commentBtnSelectors) {
    commentBtn = post.querySelector(sel);
    if (commentBtn) break;
  }

  if (!commentBtn) {
    await p3Log('⚠ comment button not found', 'warn');
    return false;
  }

  await scrollIntoViewAndPause(commentBtn);
  await humanClick(commentBtn);
  await randomWait(1500, 2500);

  // Step 2: find editor
  const editorSelectors = [
    '.ql-editor[contenteditable="true"]',
    '[contenteditable="true"][data-placeholder]',
    '.comments-comment-box__form [contenteditable="true"]',
    '.editor-content[contenteditable="true"]',
  ];

  let editor = null;
  for (let i = 0; i < 8; i++) {
    for (const sel of editorSelectors) {
      editor = document.querySelector(sel);
      if (editor) break;
    }
    if (editor) break;
    await randomWait(500, 1000);
  }

  if (!editor) {
    await p3Log('⚠ comment editor did not appear', 'warn');
    return false;
  }

  // Step 3: focus + type
  await scrollIntoViewAndPause(editor);
  await humanClick(editor);
  await randomWait(800, 1200);
  await humanType(editor, commentText);
  await randomWait(1000, 2000);

  // Step 4: Ctrl+Enter to submit
  editor.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', code: 'Enter', ctrlKey: true, bubbles: true,
  }));
  await randomWait(800, 1500);

  // Fallback submit button if editor is still open
  if (document.querySelector('.ql-editor[contenteditable="true"]')) {
    const submitSelectors = [
      'button[type="submit"]',
      'button.comments-comment-box__submit-button',
      'button[aria-label="Post comment"]',
      'button[aria-label="Add comment"]',
    ];
    for (const sel of submitSelectors) {
      const btn = document.querySelector(sel);
      if (btn) { await humanClick(btn); await randomWait(1000, 1800); break; }
    }
  }

  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runPillar3Insights() {
  await p3Log('▶ starting | ' + window.location.href);

  let engaged = 0;

  const postSelectors = [
    '[data-occludable-entity-urn]',
    '.feed-shared-update-v2',
    '.occludable-update',
    '.artdeco-card.mb2',
  ];

  let posts = [];
  for (const sel of postSelectors) {
    const found = Array.from(document.querySelectorAll(sel));
    if (found.length > 0) { posts = found; await p3Log(`📋 ${found.length} posts via "${sel}"`); break; }
  }

  if (posts.length === 0) {
    await p3Log('⚠ no post cards found', 'warn');
    chrome.runtime.sendMessage({ action: 'DONE', task: P3_SCRIPT, engaged: 0 });
    return;
  }

  for (const post of posts) {
    if (engaged >= P3_CAP) { await p3Log(`🏁 cap reached (${P3_CAP})`); break; }

    const postId = getPostId(post);
    if (!postId) { await p3Log('↷ no stable ID, skipping'); continue; }

    // Skip if already liked (DOM state) or already engaged (dedup storage)
    if (isAlreadyLiked(post)) {
      await p3Log(`↷ already liked | ${postId.slice(-20)}`);
      continue;
    }
    if (await hasEngaged(postId)) {
      await p3Log(`↷ already engaged | ${postId.slice(-20)}`);
      continue;
    }

    await p3Log(`👍💬 engaging | id: ${postId.slice(-20)}`);
    await randomWait(2000, 4000);

    // Like first
    const liked = await likePost(post);
    if (!liked) { await p3Log(`❌ like failed | ${postId.slice(-20)}`, 'error'); continue; }
    await p3Log(`👍 liked | ${postId.slice(-20)}`);
    await randomWait(2000, 4000);

    // Then comment
    const commented = await postComment(post, COMMENT_TEXT);
    if (!commented) { await p3Log(`❌ comment failed | ${postId.slice(-20)}`, 'error'); continue; }
    await p3Log(`💬 commented | ${postId.slice(-20)}`);

    await markEngaged(postId);
    engaged++;
    await p3Log(`✅ done (${engaged}/${P3_CAP})`);

    if (engaged < P3_CAP) await randomWait(8000, 15000);
  }

  await p3Log(`✔ finished | ${engaged} post(s) engaged`);
  chrome.runtime.sendMessage({ action: 'DONE', task: P3_SCRIPT, engaged });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

(async () => {
  await randomWait(2500, 4500);
  await runPillar3Insights();
})();
 *
 * Why: LinkedIn weights written comments 5–10× higher than likes for
 * the "Engage with insights" pillar. Each contextual comment also surfaces
 * Wesley's name on the post author's feed — a compound visibility benefit.
 *
 * Comment text (fixed for v1.0 testing):
 *   "Let´s connect and delivery ! https://wesleyzilva.github.io/portfolioNearshoreWesIA/"
 *
 * Strategy:
 *   HIGH   (0–15 comments)  → always comment
 *   MEDIUM (16–40 comments) → comment
 *   SKIP   (41+ comments)   → viral post, comment is lost in noise
 *   DEDUP  (seen in 30 days) → skip
 *
 * Cap: 4 comments per run · 2 runs/day · 8 comments/day total
 * Dedup: postId stored in chrome.storage.local key "commentedPosts" (30-day TTL)
 *
 * Triggered by: service-worker.js opens one of PILLAR3_SEARCH_URLS or /feed/hashtag/* tab
 *               OR tested manually by navigating to any matched URL.
 *
 * Dependencies (injected by manifest before this script):
 *   utils/human-mimicry.js  → randomWait(), scrollIntoViewAndPause(), humanClick(), humanType()
 *   utils/db.js             → (optional helper, not required here)
 *
 * Manifest matches:
 *   https://www.linkedin.com/feed/hashtag/*
 *   https://www.linkedin.com/search/results/content/*
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const P3_SCRIPT = 'pillar-3-insights';
const P3_CAP    = 4;          // max comments per run
const P3_DEDUP_DAYS = 30;     // ignore posts commented within this many days

/** HIGH priority: 0–15 existing comments */
const HIGH_COMMENT_MAX  = 15;
/** MEDIUM priority: 16–40 existing comments */
const MEDIUM_COMMENT_MAX = 40;

/**
 * Fixed comment text for v1.0 testing.
 * Validates that the full comment-flow mechanic works end-to-end
 * before introducing dynamic templates.
 */
const COMMENT_TEXT = 'Let\u00b4s connect and delivery ! https://wesleyzilva.github.io/portfolioNearshoreWesIA/';

// ─── Logger ───────────────────────────────────────────────────────────────────

async function p3Log(msg, level = 'info') {
  const entry = { ts: new Date().toISOString(), level, script: P3_SCRIPT, msg };
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](`[P3-Insights] ${msg}`);
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push(entry);
    await chrome.storage.local.set({ activityLog: activityLog.slice(-500) });
  } catch (e) {
    console.warn('[P3-Insights][log failed]', e);
  }
}

// ─── Deduplication ────────────────────────────────────────────────────────────

/**
 * Checks if a post has already been commented on within the dedup window.
 * @param {string} postId
 * @returns {Promise<boolean>}
 */
async function hasCommented(postId) {
  const { commentedPosts = [] } = await chrome.storage.local.get('commentedPosts');
  const cutoff = Date.now() - P3_DEDUP_DAYS * 24 * 60 * 60 * 1000;
  return commentedPosts.some(e => e.id === postId && new Date(e.ts).getTime() > cutoff);
}

/**
 * Marks a post as commented.
 * @param {string} postId
 */
async function markCommented(postId) {
  const { commentedPosts = [] } = await chrome.storage.local.get('commentedPosts');
  commentedPosts.push({ id: postId, ts: new Date().toISOString() });
  // FIFO cap: keep last 2000 entries
  await chrome.storage.local.set({ commentedPosts: commentedPosts.slice(-2000) });
}

// ─── Post helpers ─────────────────────────────────────────────────────────────

/**
 * Extracts a stable post ID from the post's entity URN attribute.
 * Falls back to the post's link href, then null.
 *
 * Works on both:
 *   - /feed/hashtag/* (attribute: data-occludable-entity-urn)
 *   - /search/results/content/* (same attribute, or link href fallback)
 *
 * @param {Element} post
 * @returns {string|null}
 */
function getPostId(post) {
  const urn = post.getAttribute('data-occludable-entity-urn') ||
              post.closest('[data-occludable-entity-urn]')?.getAttribute('data-occludable-entity-urn');
  if (urn) return urn;

  const link = post.querySelector('a[href*="/posts/"], a[href*="/feed/update/"]');
  if (link) {
    const m = link.href.match(/urn:li:activity:\d+|ugcPost:\d+/);
    return m ? m[0] : link.href;
  }
  return null;
}

/**
 * Counts existing comments on the post card.
 * Returns Infinity if the element cannot be found (treat as viral, skip).
 *
 * Covers both /feed/hashtag/* and /search/results/content/* DOM layouts.
 *
 * @param {Element} post
 * @returns {number}
 */
function getCommentCount(post) {
  // LinkedIn 2026: look for aria-label like "X comments" or button text
  const selectors = [
    '[aria-label*="comment"]',
    'button[aria-label*="Comment"]',
    '.social-counts-reactions__count-value',
    '.comments-comments-count',
  ];

  for (const sel of selectors) {
    const el = post.querySelector(sel);
    if (!el) continue;
    const text = el.getAttribute('aria-label') || el.textContent || '';
    const m = text.match(/(\d[\d,]*)/);
    if (m) return parseInt(m[1].replace(/,/g, ''), 10);
  }
  return Infinity;
}

/**
 * Extracts the first ~200 characters of post text (used for logging only in v1.0).
 * @param {Element} post
 * @returns {string}
 */
function getPostSnippet(post) {
  const selectors = [
    '.feed-shared-update-v2__description',
    '.update-components-text',
    '[data-test-id="main-feed-activity-card__commentary"]',
    '.feed-shared-text',
    'span[dir="ltr"]',
  ];
  for (const sel of selectors) {
    const el = post.querySelector(sel);
    if (el?.textContent?.trim()) return el.textContent.trim().slice(0, 120);
  }
  return '(no text found)';
}

// ─── Comment action ───────────────────────────────────────────────────────────

/**
 * Opens the comment box on a post card and types the comment text.
 * Returns true if the comment was posted, false on failure.
 *
 * LinkedIn comment flow (2026):
 *   1. Find and click the "Comment" button on the post card
 *   2. Wait for the comment editor to appear
 *   3. Click inside the editor (sets focus)
 *   4. Type the comment via humanType()
 *   5. Submit with Ctrl+Enter or click the Post button
 *
 * @param {Element} post
 * @param {string} commentText
 * @returns {Promise<boolean>}
 */
async function postComment(post, commentText) {
  // Step 1: Click the Comment button
  const commentBtnSelectors = [
    'button[aria-label*="Comment"]',
    'button[aria-label*="comment"]',
    '.comment-button',
    '[data-control-name="comment"]',
    'button.artdeco-button--muted[aria-label*="omment"]',
  ];

  let commentBtn = null;
  for (const sel of commentBtnSelectors) {
    commentBtn = post.querySelector(sel);
    if (commentBtn) break;
  }

  if (!commentBtn) {
    await p3Log('⚠ comment button not found on post card', 'warn');
    return false;
  }

  await scrollIntoViewAndPause(commentBtn);
  await humanClick(commentBtn);
  await randomWait(1500, 2500);

  // Step 2: Find the comment editor
  const editorSelectors = [
    '.ql-editor[contenteditable="true"]',
    '[contenteditable="true"][data-placeholder]',
    '.comments-comment-box__form [contenteditable="true"]',
    '.editor-content[contenteditable="true"]',
  ];

  let editor = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    for (const sel of editorSelectors) {
      editor = document.querySelector(sel);
      if (editor) break;
    }
    if (editor) break;
    await randomWait(500, 1000);
  }

  if (!editor) {
    await p3Log('⚠ comment editor did not appear', 'warn');
    return false;
  }

  // Step 3: Focus the editor
  await scrollIntoViewAndPause(editor);
  await humanClick(editor);
  await randomWait(800, 1200);

  // Step 4: Type the comment
  await humanType(editor, commentText);
  await randomWait(1000, 2000);

  // Step 5: Submit with Ctrl+Enter (most reliable in 2026 LinkedIn editor)
  editor.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', code: 'Enter', ctrlKey: true, bubbles: true,
  }));
  await randomWait(800, 1500);

  // Fallback: click the Post/Submit button if Ctrl+Enter did not close the editor
  const stillOpen = document.querySelector('.ql-editor[contenteditable="true"]');
  if (stillOpen) {
    const submitSelectors = [
      'button[type="submit"]',
      'button.comments-comment-box__submit-button',
      'button[aria-label="Post comment"]',
      'button[aria-label="Add comment"]',
    ];
    for (const sel of submitSelectors) {
      const btn = document.querySelector(sel);
      if (btn) {
        await humanClick(btn);
        await randomWait(1000, 1800);
        break;
      }
    }
  }

  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Main entry point. Scans the current feed page for posts, comments on eligible
 * ones up to P3_CAP, then sends DONE message to the service worker.
 */
async function runPillar3Insights() {
  await p3Log('▶ starting | url: ' + window.location.href);

  let commented = 0;

  // Collect all post cards visible on the page
  const postSelectors = [
    '[data-occludable-entity-urn]',
    '.feed-shared-update-v2',
    '.occludable-update',
    '.artdeco-card.mb2',
  ];

  let posts = [];
  for (const sel of postSelectors) {
    const found = Array.from(document.querySelectorAll(sel));
    if (found.length > 0) {
      posts = found;
      await p3Log(`📋 found ${found.length} posts via selector "${sel}"`);
      break;
    }
  }

  if (posts.length === 0) {
    await p3Log('⚠ no post cards found on page', 'warn');
    chrome.runtime.sendMessage({ action: 'DONE', task: P3_SCRIPT, commented: 0 });
    return;
  }

  for (const post of posts) {
    if (commented >= P3_CAP) {
      await p3Log(`🏁 cap reached (${P3_CAP}), stopping`);
      break;
    }

    const postId = getPostId(post);
    if (!postId) {
      await p3Log('↷ skipping post — no stable ID found');
      continue;
    }

    // Dedup check
    if (await hasCommented(postId)) {
      await p3Log(`↷ already commented | ${postId.slice(-20)}`);
      continue;
    }

    // Comment count filter
    const count = getCommentCount(post);
    const priority = count <= HIGH_COMMENT_MAX ? 'HIGH' :
                     count <= MEDIUM_COMMENT_MAX ? 'MEDIUM' : 'SKIP';

    if (priority === 'SKIP') {
      await p3Log(`↷ viral post (${count} comments), skipping`);
      continue;
    }

    // Detect topic and build contextual comment
    const snippet = getPostSnippet(post);
    const comment = COMMENT_TEXT;

    await p3Log(`💬 commenting [${priority}] | ${count} cmts | id: ${postId.slice(-20)} | "${snippet.slice(0, 50)}…"`);

    // Human pause before acting (simulate reading)
    await randomWait(3000, 6000);

    const success = await postComment(post, comment);

    if (success) {
      await markCommented(postId);
      commented++;
      await p3Log(`✅ comment posted (${commented}/${P3_CAP})`);

      // Pause between comments to mimic natural reading cadence
      if (commented < P3_CAP) {
        await randomWait(8000, 15000);
      }
    } else {
      await p3Log(`❌ comment failed | postId: ${postId.slice(-20)}`, 'error');
    }
  }

  await p3Log(`✔ done | ${commented} comment(s) posted this run`);
  chrome.runtime.sendMessage({ action: 'DONE', task: P3_SCRIPT, commented });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

(async () => {
  // Wait for feed to render
  await randomWait(2500, 4500);
  await runPillar3Insights();
})();
