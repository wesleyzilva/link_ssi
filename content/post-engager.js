/**
 * post-engager.js — Content script for linkedin.com/feed/ and linkedin.com/search/results/content/
 *
 * Strategically engages with posts to maximise SSI "Engage with Insights" score.
 * When opened via a targeted content-search URL, comments signal Wesley as a
 * senior IT Manager / Project Manager available for global/LATAM roles.
 *
 * Priority tiers by comment count:
 *   HIGH    : 0–10 comments  — maximum SSI impact, low noise for the author
 *   MEDIUM  : 11–30 comments — moderate engagement value
 *   SKIP    : 50+ comments   — diminishing returns; post is already viral
 *
 * Session cap: 5 likes + 2 meaningful comments per run.
 * Anti-duplication: every post ID is stored in chrome.storage.local after interaction.
 */

// utils/human-mimicry.js and utils/db.js are loaded before this script by the manifest

// ─── Activity logger (inline — content scripts cannot use ES modules) ────────
async function contentLog(msg, level = 'info') {
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push({ ts: new Date().toISOString(), level, msg });
    await chrome.storage.local.set({ activityLog: activityLog.slice(-300) });
  } catch (e) { console.warn('[contentLog]', e); }
}

const CAPS = { likes: 5, comments: 2 };

/**
 * Comment templates written for posts about PM/Delivery/Agile/LATAM topics.
 * Each naturally positions Wesley as a senior IT Manager open to global roles.
 * Rotate randomly so comments never look templated to LinkedIn's classifiers.
 */
const COMMENT_TEMPLATES = [
  "Great perspective on this. The real challenge for distributed tech teams is maintaining this consistency at scale — especially across LATAM time zones. Let's connect! 🔗 https://wesleyzilva.github.io/portfolioNearshoreWesIA/ | https://www.linkedin.com/in/wesleyzilva/",
  "This aligns with what I’ve observed leading engineering teams across LATAM. The cultural alignment piece is often underestimated in remote setups. Let’s connect! 🔗 https://wesleyzilva.github.io/portfolioNearshoreWesIA/ | https://www.linkedin.com/in/wesleyzilva/",
  "Solid breakdown. From an IT Management standpoint (14+ yrs, remote teams, M&A), the ROI case becomes even clearer when you factor in attrition costs. Let’s connect! 🔗 https://www.linkedin.com/in/wesleyzilva/",
  "This resonates — especially for companies expanding into LATAM tech talent markets where this delivery pattern is most common. Let’s connect! 🔗 https://wesleyzilva.github.io/portfolioNearshoreWesIA/ | https://www.linkedin.com/in/wesleyzilva/",
  "Really valuable insight. As an IT Manager based in Brazil with 14+ yrs leading remote engineering teams, I see this daily in Agile transformations. Let’s connect! 🔗 https://www.linkedin.com/in/wesleyzilva/",
  "Exactly why Delivery Managers in LATAM need strong async frameworks — the overlap window with EU/US is tight. Curious how your team handles sprint ceremonies. Let’s connect! 🔗 https://wesleyzilva.github.io/portfolioNearshoreWesIA/",
  "Nearshore teams in Brazil have been closing this gap fast. 14+ years of M&A and cross-border delivery taught me the blockers rarely come from the tech side. Let’s connect! 🔗 https://www.linkedin.com/in/wesleyzilva/",
  "Agile at scale in distributed environments is where most frameworks break down. Happy to share what worked for us leading tech teams across time zones from Brazil. Let’s connect! 🔗 https://wesleyzilva.github.io/portfolioNearshoreWesIA/",
  "The demand for bilingual Project Managers who can bridge LATAM talent pools with global delivery standards is real — and still undersupplied. Let’s connect! 🔗 https://www.linkedin.com/in/wesleyzilva/",
  "Digital transformation initiatives stall when the PM layer can’t translate between business stakeholders and distributed engineering teams. Hard lesson from 14 yrs in IT. Let’s connect! 🔗 https://wesleyzilva.github.io/portfolioNearshoreWesIA/",
];

// ─── Message listener ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START' && message.task === 'post-engager') {
    engageWithPosts().then((result) => {
      sendResponse({ success: true, ...result });
    }).catch((error) => {
      console.error('[Post Engager] Error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// ─── Core logic ───────────────────────────────────────────────────────────────

/**
 * Polls a DOM query function until it returns at least one element, or times out.
 */
async function waitForElements(queryFn, maxWait = 20000, interval = 2000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const els = queryFn();
    if (els.length) return els;
    await new Promise(r => setTimeout(r, interval));
  }
  return queryFn();
}

async function engageWithPosts() {
  await contentLog(`▶ post-engager started | ${window.location.href}`);
  await randomWait(4000, 8000); // initial wait for SPA render

  // Simulate a person arriving on the feed and reading before engaging
  await simulatePageReading(randomInt(8000, 14000));

  let likesGiven = 0;
  let commentsMade = 0;
  let scrollRounds = 0;
  const MAX_SCROLL_ROUNDS = 5;

  while (
    (likesGiven < CAPS.likes || commentsMade < CAPS.comments) &&
    scrollRounds < MAX_SCROLL_ROUNDS
  ) {
    const posts = await waitForElements(getFeedPosts, 15000);

    for (const post of posts) {
      if (likesGiven >= CAPS.likes && commentsMade >= CAPS.comments) break;

      const postId = extractPostId(post);
      if (!postId) continue;

      // Independent per-action dedup checks
      const alreadyLiked     = await hasInteractedWithPost(postId);
      const alreadyCommented = await hasCommentedOnPostRecord(postId);

      // Skip entirely only when both actions are done, or nothing useful can happen
      const likeCapReached  = likesGiven >= CAPS.likes;
      const commCapReached  = commentsMade >= CAPS.comments;
      if ((alreadyLiked || likeCapReached) && (alreadyCommented || commCapReached)) continue;

      const commentCount = getCommentCount(post);
      const priority = getPriority(commentCount);
      if (priority === 'SKIP') continue;

      await scrollIntoViewAndPause(post);
      // Simulate reading the post content before deciding to engage
      await readBeforeActing(post, 4000, 10000);

      // Like the post
      if (likesGiven < CAPS.likes && !alreadyLiked) {
        const liked = await likePost(post);
        if (liked) {
          likesGiven++;
          const postUrl = extractPostUrl(post);
          await markPostAsInteracted(postId);
          await contentLog(`✓ liked | ${postUrl || postId} (${likesGiven}/${CAPS.likes})`, 'success');
          // Persist to history
          const { postInteractions = [] } = await chrome.storage.local.get('postInteractions');
          postInteractions.push({ postId, postUrl, action: 'like', interactedAt: new Date().toISOString() });
          await chrome.storage.local.set({ postInteractions: postInteractions.slice(-200) });
          console.log(`[Post Engager] Liked post ${postId} (${likesGiven}/${CAPS.likes})`);
          await randomWait(5000, 12000);
        }
      }

      // Comment on HIGH priority posts only (only if not already commented)
      if (commentsMade < CAPS.comments && priority === 'HIGH' && !alreadyCommented) {
        const commented = await commentOnPost(post);
        if (commented) {
          commentsMade++;
          const postUrl = extractPostUrl(post);
          await contentLog(`✓ commented | ${postUrl || postId} (${commentsMade}/${CAPS.comments})`, 'success');
          // Persist to history
          const { postInteractions = [] } = await chrome.storage.local.get('postInteractions');
          postInteractions.push({ postId, postUrl, action: 'comment', interactedAt: new Date().toISOString() });
          await chrome.storage.local.set({ postInteractions: postInteractions.slice(-200) });
          console.log(`[Post Engager] Commented on ${postId} (${commentsMade}/${CAPS.comments})`);
          await randomWait(15000, 30000); // longer pause after commenting
        }
      }
    }

    // Scroll for more posts
    randomScroll(800, 2000);
    await randomWait(3000, 6000);
    scrollRounds++;
  }

  await chrome.storage.local.set({
    lastEngagement: {
      likes: likesGiven,
      comments: commentsMade,
      runAt: new Date().toISOString(),
    },
  });
  await contentLog(`■ post-engager done | ${likesGiven} likes / ${commentsMade} comments`);

  return { likes: likesGiven, comments: commentsMade };
}

// ─── Priority classification ──────────────────────────────────────────────────

function getPriority(commentCount) {
  if (commentCount <= 10) return 'HIGH';
  if (commentCount <= 30) return 'MEDIUM';
  return 'SKIP';
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function getFeedPosts() {
  // Strategy 1: LinkedIn 2024-2026 feed — posts carry data-id with urn
  const byUrn = Array.from(document.querySelectorAll(
    'div[data-id*=":activity:"], div[data-id*=":ugcPost:"], div[data-id*=":share:"]'
  ));
  if (byUrn.length) { console.log(`[Post Engager] Found ${byUrn.length} posts via data-id urn.`); return byUrn; }

  // Strategy 2: legacy class (still present in some LinkedIn themes)
  const byClass = Array.from(document.querySelectorAll('.feed-shared-update-v2'));
  if (byClass.length) { console.log(`[Post Engager] Found ${byClass.length} posts via .feed-shared-update-v2.`); return byClass; }

  // Strategy 3: content search results page — universal template container
  const bySearch = Array.from(document.querySelectorAll(
    '[data-view-name="search-entity-result-universal-template"], ' +
    '.search-results-container .occludable-update, ' +
    '.entity-result[data-urn]'
  ));
  if (bySearch.length) { console.log(`[Post Engager] Found ${bySearch.length} posts via search selectors.`); return bySearch; }

  // Strategy 4: any element with a data-urn pointing to an activity/post
  const byDataUrn = Array.from(document.querySelectorAll(
    '[data-urn*=":activity:"], [data-urn*=":ugcPost:"], [data-urn*=":share:"]'
  ));
  if (byDataUrn.length) { console.log(`[Post Engager] Found ${byDataUrn.length} posts via data-urn.`); return byDataUrn; }

  // Strategy 5: broadest fallback — artdeco cards that are posts
  const byArtdeco = Array.from(document.querySelectorAll(
    '.occludable-update, .artdeco-card[data-id], .artdeco-card[data-urn]'
  ));
  if (byArtdeco.length) { console.log(`[Post Engager] Found ${byArtdeco.length} posts via artdeco fallback.`); return byArtdeco; }

  // Strategy 6: search/results/content — list items in search result containers (LinkedIn 2025)
  const bySearchLi = Array.from(document.querySelectorAll(
    'ul.reusable-search__entity-result-list > li, ' +
    '.search-results-container li, ' +
    'li.search-content-result__wrapper'
  )).filter(el => el.querySelector('[aria-label*="Like"], [data-urn], [data-id]'));
  if (bySearchLi.length) { console.log(`[Post Engager] Found ${bySearchLi.length} posts via search-li fallback.`); return bySearchLi; }

  // Strategy 7: absolute broadest — any element with a reaction button
  const byReaction = Array.from(document.querySelectorAll(
    '[data-reaction-type], [aria-label*="React"], ' +
    'button[aria-label*="Like"], button[aria-label*="Comment"]'
  )).map(btn => btn.closest('article, li, [data-id], [data-urn]') || btn.parentElement).filter(Boolean);
  const uniqueContainers = [...new Set(byReaction)];
  if (uniqueContainers.length) { console.log(`[Post Engager] Found ${uniqueContainers.length} posts via reaction-button fallback.`); return uniqueContainers; }

  console.warn('[Post Engager] All selectors failed. Page URL:', location.href);
  return [];
}

function extractPostId(post) {
  const urn = post.getAttribute('data-urn') || post.getAttribute('data-id');
  return urn || null;
}

/**
 * Checks chrome.storage.local to see if a COMMENT was already recorded for this post.
 * Used separately from hasInteractedWithPost (which tracks likes) so posts can be
 * commented on even if they were liked in a previous session.
 */
async function hasCommentedOnPostRecord(postId) {
  const { postInteractions = [] } = await chrome.storage.local.get('postInteractions');
  return postInteractions.some(r => r.postId === postId && r.action === 'comment');
}

function extractPostUrl(post) {
  // Standard permalink: timestamp anchor at the top of the post
  const link = post.querySelector('a[href*="/feed/update/"]') ||
    post.querySelector('a[href*="/posts/"]') ||
    post.querySelector('a[href*="/activity-"]');
  return link ? link.href.split('?')[0] : null;
}

function getCommentCount(post) {
  const countEl = post.querySelector('[data-test-id="social-actions__comments-count"]') ||
    post.querySelector('.social-details-social-counts__comments button');
  if (!countEl) return 0;
  const text = countEl.textContent.trim();
  const match = text.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

async function likePost(post) {
  const likeButton = post.querySelector('[data-test-id="like-button"]') ||
    post.querySelector('button[aria-label*="Like"]');
  if (!likeButton || likeButton.getAttribute('aria-pressed') === 'true') return false;

  await humanClick(likeButton);
  return true;
}

async function commentOnPost(post) {
  const commentButton = post.querySelector('button[aria-label*="Comment"]');
  if (!commentButton) return false;

  await humanClick(commentButton);
  await randomWait(1500, 3000);

  const commentBox = post.querySelector('.ql-editor[data-placeholder]') ||
    document.querySelector('.comments-comment-texteditor .ql-editor');
  if (!commentBox) return false;

  const template = COMMENT_TEMPLATES[Math.floor(Math.random() * COMMENT_TEMPLATES.length)];
  commentBox.focus();
  commentBox.textContent = template;
  commentBox.dispatchEvent(new InputEvent('input', { bubbles: true }));
  await randomWait(3000, 6000);

  const submitButton = post.querySelector('button[class*="comments-comment-box__submit-button"]') ||
    document.querySelector('.comments-comment-box__submit-button--cr');
  if (!submitButton) return false;

  await humanClick(submitButton);
  return true;
}
