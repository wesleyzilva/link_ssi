/**
 * post-engager.js — Content script for feed + content-search pages
 *
 * Goals (in priority order):
 *   1. Find posts by Tech Recruiters with job openings → comment "Let's connect! portfolio_url"
 *   2. Like posts (SSI: Engage with Insights)
 *   3. Follow post authors (SSI signal, no connection request sent here)
 *   4. Register ALL post links found for later validation
 *   5. Log EVERYTHING — every action, every error, every link encountered
 *
 * Priority tiers by comment count:
 *   HIGH    : 0–15 comments  — maximum SSI impact
 *   MEDIUM  : 16–40 comments — moderate
 *   SKIP    : 41+ comments   — viral, skip comment
 *
 * Session caps (per run): likes 8 | comments 4 | follows 6
 * Anti-duplication: post IDs stored in chrome.storage.local
 * Human-mimicry: all actions use randomWait + humanClick + readBeforeActing
 */

// utils/human-mimicry.js and utils/db.js injected by manifest before this script

// ─── Logger ──────────────────────────────────────────────────────────────────

async function contentLog(msg, level = 'info') {
  const entry = { ts: new Date().toISOString(), level, script: 'post-engager', msg };
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[Post Engager]', msg);
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push(entry);
    await chrome.storage.local.set({ activityLog: activityLog.slice(-500) });
  } catch (e) { console.warn('[Post Engager][contentLog failed]', e); }
}

async function logLink(postUrl, context) {
  try {
    const entry = { ts: new Date().toISOString(), url: postUrl, context };
    const { discoveredLinks = [] } = await chrome.storage.local.get('discoveredLinks');
    discoveredLinks.push(entry);
    await chrome.storage.local.set({ discoveredLinks: discoveredLinks.slice(-1000) });
    await contentLog(`🔗 link registered | ${context} | ${postUrl}`);
  } catch (e) { console.warn('[Post Engager][logLink failed]', e); }
}

// ─── Caps ─────────────────────────────────────────────────────────────────────

const CAPS = { likes: 8, comments: 4, follows: 6 };

// ─── Recruiter / job-post detection ──────────────────────────────────────────

const RECRUITER_KEYWORDS = [
  'recruiter', 'talent acquisition', 'head of talent', 'ta manager',
  'hr manager', 'people & culture', 'people ops', 'hiring manager',
  'technical recruiter', 'engineering recruiter',
];

const JOB_KEYWORDS = [
  'we are hiring', "we're hiring", 'open role', 'job opening', 'new opportunity',
  'looking for', 'we have an opening', 'apply now', 'join our team',
  'remote opportunity', '#hiring', '#novasvaga', '#job', '#career',
];

function isRecruiterPost(post) {
  const text = (post.textContent || '').toLowerCase();
  const authorTitle = (
    post.querySelector('.update-components-actor__description, .artdeco-entity-lockup__subtitle')
      ?.textContent || ''
  ).toLowerCase();

  const hasRecruiterTitle = RECRUITER_KEYWORDS.some(kw => authorTitle.includes(kw));
  const hasJobKeyword = JOB_KEYWORDS.some(kw => text.includes(kw));

  return hasRecruiterTitle || hasJobKeyword;
}

// ─── Comment templates (short, direct, no emojis that trigger spam filters) ──

const COMMENT_TEMPLATES = [
  "Great opportunity! Let's connect 👉 https://wesleyzilva.github.io/portfolioNearshoreWesIA/",
  "Really interesting — Let's connect! https://wesleyzilva.github.io/portfolioNearshoreWesIA/",
  "Solid perspective. Let's connect! https://wesleyzilva.github.io/portfolioNearshoreWesIA/",
  "This aligns with what I see across LATAM tech teams. Let's connect! https://wesleyzilva.github.io/portfolioNearshoreWesIA/",
  "From 14+ yrs leading nearshore teams in Brazil, I agree entirely. Let's connect! https://wesleyzilva.github.io/portfolioNearshoreWesIA/",
  "Exactly what distributed engineering teams face at scale. Let's connect! https://wesleyzilva.github.io/portfolioNearshoreWesIA/",
  "Very relevant for LATAM delivery contexts. Let's connect! https://wesleyzilva.github.io/portfolioNearshoreWesIA/",
  "The async/sync balance question is one every global team wrestles with. Let's connect! https://wesleyzilva.github.io/portfolioNearshoreWesIA/",
  "Strong point on nearshore delivery. Happy to share context from Brazil. Let's connect! https://wesleyzilva.github.io/portfolioNearshoreWesIA/",
  "Agile at scale across time zones is where most frameworks break. Let's connect! https://wesleyzilva.github.io/portfolioNearshoreWesIA/",
];

// Recruiter/hiring-post specific comment (shorter, more direct)
const RECRUITER_COMMENT_TEMPLATES = [
  "Let's connect! https://wesleyzilva.github.io/portfolioNearshoreWesIA/",
  "Interested — Let's connect! https://wesleyzilva.github.io/portfolioNearshoreWesIA/",
];

// ─── Message listener ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START' && message.task === 'post-engager') {
    contentLog('▶ post-engager START message received').then(() =>
      engageWithPosts()
    ).then((result) => {
      sendResponse({ success: true, ...result });
    }).catch((error) => {
      contentLog(`✗ post-engager fatal error: ${error.message}`, 'error');
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function waitForElements(queryFn, maxWait = 20000, interval = 2000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const els = queryFn();
    if (els.length) return els;
    await new Promise(r => setTimeout(r, interval));
  }
  return queryFn();
}

// ─── Core ─────────────────────────────────────────────────────────────────────

async function engageWithPosts() {
  await contentLog(`▶ post-engager started | url=${window.location.href}`);
  await randomWait(4000, 8000);

  await simulatePageReading(randomInt(8000, 14000));

  let likesGiven = 0;
  let commentsMade = 0;
  let followsMade = 0;
  let linksFound = 0;
  let scrollRounds = 0;
  const MAX_SCROLL_ROUNDS = 8;

  while (
    (likesGiven < CAPS.likes || commentsMade < CAPS.comments || followsMade < CAPS.follows) &&
    scrollRounds < MAX_SCROLL_ROUNDS
  ) {
    let posts;
    try {
      posts = await waitForElements(getFeedPosts, 15000);
    } catch (e) {
      await contentLog(`✗ waitForElements error: ${e.message}`, 'error');
      break;
    }

    if (!posts.length) {
      await contentLog(`⚠ no posts found in round ${scrollRounds + 1}/${MAX_SCROLL_ROUNDS}`, 'warn');
    }

    for (const post of posts) {
      if (likesGiven >= CAPS.likes && commentsMade >= CAPS.comments && followsMade >= CAPS.follows) break;

      let postId, postUrl;
      try {
        postId  = extractPostId(post);
        postUrl = extractPostUrl(post);
      } catch (e) {
        await contentLog(`✗ extractPostId/Url error: ${e.message}`, 'error');
        continue;
      }

      if (!postId) {
        await contentLog('⚠ post with no id found — skipped');
        continue;
      }

      // Register every link we find (for later human validation)
      if (postUrl) {
        await logLink(postUrl, 'discovered');
        linksFound++;
      }

      const isRecruiter = isRecruiterPost(post);
      const commentCount = getCommentCount(post);
      const priority = getPriority(commentCount);

      await contentLog(
        `📌 post ${postId.slice(-18)} | recruiter=${isRecruiter} | comments=${commentCount} | priority=${priority} | url=${postUrl || 'none'}`
      );

      if (priority === 'SKIP' && !isRecruiter) continue;

      // Dedup checks — both use postInteractions (no db.js dependency)
      let alreadyLiked, alreadyCommented;
      try {
        alreadyLiked     = await hasLikedPost(postId);
        alreadyCommented = await hasCommentedOnPostRecord(postId);
      } catch (e) {
        await contentLog(`✗ dedup check error for ${postId}: ${e.message}`, 'error');
        continue;
      }

      await scrollIntoViewAndPause(post);
      await readBeforeActing(post, 3000, 9000);

      // ── 1. LIKE ──
      if (likesGiven < CAPS.likes && !alreadyLiked) {
        try {
          const liked = await likePost(post);
          if (liked) {
            likesGiven++;
            await saveInteraction(postId, postUrl, 'like');
            await contentLog(`✓ LIKE | ${postUrl || postId} (${likesGiven}/${CAPS.likes})`, 'success');
            await randomWait(5000, 12000);
          } else {
            await contentLog(`⚠ like button not found or already liked | ${postId}`, 'warn');
          }
        } catch (e) {
          await contentLog(`✗ like error for ${postId}: ${e.message}`, 'error');
        }
      }

      // ── 2. COMMENT — recruiter/job posts get priority, else HIGH only ──
      const shouldComment = commentsMade < CAPS.comments && !alreadyCommented &&
        (isRecruiter || priority === 'HIGH');
      if (shouldComment) {
        try {
          const templates = isRecruiter ? RECRUITER_COMMENT_TEMPLATES : COMMENT_TEMPLATES;
          const commented = await commentOnPost(post, templates);
          if (commented) {
            commentsMade++;
            await saveInteraction(postId, postUrl, 'comment');
            await contentLog(`✓ COMMENT | ${postUrl || postId} (${commentsMade}/${CAPS.comments})`, 'success');
            if (postUrl) await logLink(postUrl, 'commented');
            await randomWait(15000, 30000);
          } else {
            await contentLog(`⚠ comment failed (no box/submit) | ${postId}`, 'warn');
          }
        } catch (e) {
          await contentLog(`✗ comment error for ${postId}: ${e.message}`, 'error');
        }
      }

      // ── 3. FOLLOW author ──
      if (followsMade < CAPS.follows) {
        try {
          const followed = await followPostAuthor(post);
          if (followed) {
            followsMade++;
            await saveInteraction(postId, postUrl, 'follow');
            await contentLog(`✓ FOLLOW | author of ${postUrl || postId} (${followsMade}/${CAPS.follows})`, 'success');
            await randomWait(3000, 7000);
          }
        } catch (e) {
          await contentLog(`✗ follow error for ${postId}: ${e.message}`, 'error');
        }
      }
    }

    randomScroll(800, 2000);
    await randomWait(3000, 6000);
    scrollRounds++;
    await contentLog(`↓ scroll round ${scrollRounds}/${MAX_SCROLL_ROUNDS} | likes=${likesGiven} comments=${commentsMade} follows=${followsMade}`);
  }

  const summary = {
    likes: likesGiven,
    comments: commentsMade,
    follows: followsMade,
    linksFound,
    runAt: new Date().toISOString(),
    url: window.location.href,
  };

  try {
    await chrome.storage.local.set({ lastEngagement: summary });
  } catch (e) {
    await contentLog(`✗ failed to save lastEngagement: ${e.message}`, 'error');
  }

  await contentLog(
    `■ post-engager DONE | likes=${likesGiven}/${CAPS.likes} comments=${commentsMade}/${CAPS.comments} follows=${followsMade}/${CAPS.follows} linksFound=${linksFound}`,
    'success'
  );

  // Export CSVs to output/ after every run (not just at day end)
  try {
    await chrome.runtime.sendMessage({ action: 'EXPORT_LOGS' });
    await contentLog('📁 CSV export triggered → output/');
  } catch (e) {
    await contentLog(`⚠ CSV export trigger failed: ${e.message}`, 'warn');
  }

  return summary;
}

// ─── Priority ─────────────────────────────────────────────────────────────────

function getPriority(commentCount) {
  if (commentCount <= 15) return 'HIGH';
  if (commentCount <= 40) return 'MEDIUM';
  return 'SKIP';
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

async function saveInteraction(postId, postUrl, action) {
  try {
    const { postInteractions = [] } = await chrome.storage.local.get('postInteractions');
    postInteractions.push({ postId, postUrl, action, interactedAt: new Date().toISOString() });
    await chrome.storage.local.set({ postInteractions: postInteractions.slice(-500) });
  } catch (e) {
    console.warn('[Post Engager][saveInteraction failed]', e);
  }
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function getFeedPosts() {
  // Strategy 0: Content-search page (/search/results/content/) — result li containers
  // These are the actual post-result wrappers; checked first so the reaction-button
  // fallback (which can match sidebar widgets) never runs on content-search pages.
  const s0 = Array.from(document.querySelectorAll(
    'li.reusable-search__result-container,' +
    'li[class*="reusable-search__result"]'
  )).filter(el =>
    el.querySelector('a[href*="/feed/update/"], a[href*="/posts/"]') ||
    el.querySelector('button[aria-label*="Like"], button[aria-label*="React"]')
  );
  if (s0.length) { console.log(`[Post Engager] ${s0.length} posts via content-search li`); return s0; }

  const s1 = Array.from(document.querySelectorAll(
    'div[data-id*=":activity:"], div[data-id*=":ugcPost:"], div[data-id*=":share:"]'
  ));
  if (s1.length) { console.log(`[Post Engager] ${s1.length} posts via data-id urn`); return s1; }

  const s2 = Array.from(document.querySelectorAll('.feed-shared-update-v2'));
  if (s2.length) { console.log(`[Post Engager] ${s2.length} posts via .feed-shared-update-v2`); return s2; }

  const s3 = Array.from(document.querySelectorAll(
    '[data-view-name="search-entity-result-universal-template"],' +
    '.search-results-container .occludable-update,' +
    '.entity-result[data-urn]'
  ));
  if (s3.length) { console.log(`[Post Engager] ${s3.length} posts via search selectors`); return s3; }

  const s4 = Array.from(document.querySelectorAll(
    '[data-urn*=":activity:"], [data-urn*=":ugcPost:"], [data-urn*=":share:"]'
  ));
  if (s4.length) { console.log(`[Post Engager] ${s4.length} posts via data-urn`); return s4; }

  const s5 = Array.from(document.querySelectorAll(
    '.occludable-update, .artdeco-card[data-id], .artdeco-card[data-urn]'
  ));
  if (s5.length) { console.log(`[Post Engager] ${s5.length} posts via artdeco`); return s5; }

  const s6 = Array.from(document.querySelectorAll(
    'ul.reusable-search__entity-result-list > li,' +
    '.search-results-container li,' +
    'li.search-content-result__wrapper'
  )).filter(el => el.querySelector('[aria-label*="Like"], [data-urn], [data-id]'));
  if (s6.length) { console.log(`[Post Engager] ${s6.length} posts via search-li`); return s6; }

  const byReaction = Array.from(document.querySelectorAll(
    'button[aria-label*="Like"], button[aria-label*="Comment"]'
  )).map(btn =>
    btn.closest('[data-id], [data-urn], [data-chameleon-result-urn], .feed-shared-update-v2, .occludable-update, article') ||
    btn.closest('li') ||
    btn.parentElement
  ).filter(Boolean);
  const unique = [...new Set(byReaction)];
  if (unique.length) { console.log(`[Post Engager] ${unique.length} posts via reaction-button fallback`); return unique; }

  console.warn('[Post Engager] ALL selectors failed. url=', location.href);
  return [];
}

function extractPostId(post) {
  // Direct URN attribute
  const direct = post.getAttribute('data-urn') || post.getAttribute('data-id') || post.getAttribute('data-chameleon-result-urn');
  if (direct) return direct;

  // Walk up the DOM — reaction-button fallback may land on a wrapper element
  const ancestor = post.closest('[data-urn], [data-id], [data-chameleon-result-urn]');
  if (ancestor) return ancestor.getAttribute('data-urn') || ancestor.getAttribute('data-id') || ancestor.getAttribute('data-chameleon-result-urn');

  // Nested element carrying the URN (e.g. feed-shared-update-v2 inside a search li)
  const nested = post.querySelector('[data-urn], [data-id]');
  if (nested) return nested.getAttribute('data-urn') || nested.getAttribute('data-id');

  // Link-based fallback — also handles URL-encoded URNs (urn%3Ali%3A)
  const link =
    post.querySelector('a[href*="/feed/update/"]') ||
    post.querySelector('a[href*="/posts/"]') ||
    post.querySelector('a[href*="/activity-"]') ||
    post.querySelector('a[href*="urn%3Ali%3A"]');
  return link ? link.href.split('?')[0] : null;
}

function extractPostUrl(post) {
  const link =
    post.querySelector('a[href*="/feed/update/"]') ||
    post.querySelector('a[href*="/posts/"]') ||
    post.querySelector('a[href*="/activity-"]') ||
    post.querySelector('a[href*="urn%3Ali%3A"]');
  return link ? link.href.split('?')[0] : null;
}

function getCommentCount(post) {
  const el =
    post.querySelector('[data-test-id="social-actions__comments-count"]') ||
    post.querySelector('.social-details-social-counts__comments button') ||
    post.querySelector('[aria-label*="comment"]');
  if (!el) return 0;
  const m = (el.textContent || '').trim().match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

// ─── Dedup helpers — single source of truth: postInteractions ───────────────

/** Returns true if this post was already COMMENTED in any previous run. */
async function hasCommentedOnPostRecord(postId) {
  try {
    const { postInteractions = [] } = await chrome.storage.local.get('postInteractions');
    return postInteractions.some(r => r.postId === postId && r.action === 'comment');
  } catch { return false; }
}

/** Returns true if this post was already LIKED in any previous run. */
async function hasLikedPost(postId) {
  try {
    const { postInteractions = [] } = await chrome.storage.local.get('postInteractions');
    return postInteractions.some(r => r.postId === postId && r.action === 'like');
  } catch { return false; }
}

// ─── Like ─────────────────────────────────────────────────────────────────────

async function likePost(post) {
  const btn =
    post.querySelector('[data-test-id="like-button"]') ||
    post.querySelector('button[aria-label*="Like"]') ||
    post.querySelector('button[aria-label*="React"]') ||
    Array.from(post.querySelectorAll('button')).find(
      b => /^(like|react)/i.test((b.getAttribute('aria-label') || b.textContent).trim())
    );
  if (!btn) { console.log('[Post Engager] likePost: no like button found'); return false; }
  if (btn.getAttribute('aria-pressed') === 'true') { console.log('[Post Engager] likePost: already liked'); return false; }
  await humanClick(btn);
  return true;
}

// ─── Comment ──────────────────────────────────────────────────────────────────

async function commentOnPost(post, templates = COMMENT_TEMPLATES) {
  const commentBtn =
    post.querySelector('button[aria-label*="Comment"]') ||
    post.querySelector('button[aria-label*="comment"]') ||
    Array.from(post.querySelectorAll('button')).find(
      b => /^comment$/i.test(b.textContent.trim())
    );
  if (!commentBtn) {
    console.log('[Post Engager] commentOnPost: no comment button found');
    return false;
  }

  await humanClick(commentBtn);
  await randomWait(1500, 3500);

  const commentBox =
    post.querySelector('.ql-editor[data-placeholder]') ||
    document.querySelector('.comments-comment-texteditor .ql-editor') ||
    document.querySelector('.comments-comment-box__text-editor .ql-editor') ||
    document.querySelector('[contenteditable="true"][data-placeholder*="omment"]') ||
    document.querySelector('.comments-comment-box [contenteditable="true"]');

  if (!commentBox) {
    console.warn('[Post Engager] commentOnPost: comment box not found after click');
    await contentLog('⚠ comment box not found — may be a JS timing issue', 'warn');
    return false;
  }

  const template = templates[Math.floor(Math.random() * templates.length)];
  await contentLog(`💬 typing comment: "${template.slice(0, 60)}..."`);

  commentBox.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, template);
  commentBox.dispatchEvent(new InputEvent('input', { bubbles: true }));

  // Simulate re-reading typed comment before posting (human behaviour)
  await randomWait(3000, 6000);

  const submitBtn =
    post.querySelector('button[class*="comments-comment-box__submit-button"]') ||
    document.querySelector('.comments-comment-box__submit-button--cr') ||
    document.querySelector('.comments-comment-box .artdeco-button--primary') ||
    document.querySelector('button[data-control-name="submit-post"]') ||
    Array.from(document.querySelectorAll('.comments-comment-box button')).find(
      b => /^post$/i.test(b.textContent.trim()) || /submit/i.test(b.getAttribute('aria-label') || '')
    );

  if (!submitBtn) {
    console.warn('[Post Engager] commentOnPost: submit button not found');
    await contentLog('⚠ comment submit button not found', 'warn');
    return false;
  }

  await humanClick(submitBtn);
  await randomWait(2000, 4000);
  return true;
}

// ─── Follow ───────────────────────────────────────────────────────────────────

async function followPostAuthor(post) {
  // Follow button strategies — LinkedIn renders this differently in feed vs search
  const followBtn =
    post.querySelector('button[aria-label*="Follow"]') ||
    post.querySelector('button[aria-label*="follow"]') ||
    Array.from(post.querySelectorAll('button')).find(b => {
      const label = (b.getAttribute('aria-label') || b.textContent || '').toLowerCase().trim();
      return label === 'follow' || label.startsWith('follow ');
    });

  if (!followBtn) return false; // no follow button visible — skip silently

  const currentLabel = (followBtn.getAttribute('aria-label') || followBtn.textContent || '').toLowerCase();
  if (currentLabel.includes('following') || currentLabel.includes('unfollow')) {
    // Already following
    return false;
  }

  await humanClick(followBtn);
  return true;
}
