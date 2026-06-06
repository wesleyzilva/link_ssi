"""Writes the focused post-commenter.js content script."""
import pathlib

OUT = pathlib.Path(__file__).parent.parent / "content" / "post-commenter.js"

content = r"""/**
 * post-commenter.js -- Focused content script for LinkedIn /search/results/content/ pages.
 *
 * For each post on the page:
 *   1. Check if already liked AND commented in a previous run (via db.js helpers)
 *   2. If both done -> skip
 *   3. Otherwise -> like (if not done) then comment (if not done)
 *
 * Comment text is fixed. Human-mimicry delays are applied before every action.
 * Sends PAGE_DONE to background when the page is fully processed.
 *
 * Injected before this script (manifest.json order):
 *   utils/human-mimicry.js  -- randomWait, randomScroll, scrollIntoViewAndPause,
 *                              humanClick, simulatePageReading, randomInt
 *   utils/db.js             -- hasInteracted(postId, action), saveInteraction(postId, action)
 */

// Fixed comment posted on every unvisited post
const COMMENT_TEXT = "Let's connect and delivery ! https://wesleyzilva.github.io/portfolioNearshoreWesIA/";

// Number of scroll+collect cycles per page before reporting PAGE_DONE
const SCROLL_ROUNDS = 5;

// -- Init ---------------------------------------------------------------------

(async function init() {
  const data = await chrome.storage.local.get('commenterRunning');
  if (!data.commenterRunning) {
    console.log('[Post Commenter] Idle -- extension not started, doing nothing.');
    return;
  }

  try {
    await runCommenter();
  } catch (e) {
    await sendLog('Fatal error: ' + e.message);
    chrome.runtime.sendMessage({ action: 'PAGE_DONE', commented: 0, liked: 0, skipped: 0 });
  }
})();

// -- Main loop ----------------------------------------------------------------

async function runCommenter() {
  const params   = new URL(location.href).searchParams;
  const keywords = params.get('keywords') || location.href;
  await sendLog('Page started: ' + decodeURIComponent(keywords));

  // Simulate natural page reading before acting
  await randomWait(4000, 8000);
  await simulatePageReading(randomInt(6000, 12000));

  let commented = 0;
  let liked     = 0;
  let skipped   = 0;

  for (let round = 0; round < SCROLL_ROUNDS; round++) {
    const posts = await waitForPosts(15000);

    if (!posts.length) {
      await sendLog('Round ' + (round + 1) + ': no posts found, stopping early.');
      break;
    }

    for (const post of posts) {
      const postId = extractPostId(post);
      if (!postId) continue;

      const alreadyLiked     = await hasInteracted(postId, 'like');
      const alreadyCommented = await hasInteracted(postId, 'comment');

      if (alreadyLiked && alreadyCommented) {
        skipped++;
        continue;
      }

      await scrollIntoViewAndPause(post);
      await randomWait(1500, 3500);

      if (!alreadyLiked) {
        const didLike = await likePost(post);
        if (didLike) {
          liked++;
          await saveInteraction(postId, 'like');
          await sendLog('Liked: ...' + postId.slice(-20));
          await randomWait(5000, 10000);
        }
      }

      if (!alreadyCommented) {
        const didComment = await commentOnPost(post);
        if (didComment) {
          commented++;
          await saveInteraction(postId, 'comment');
          await sendLog('Commented: ...' + postId.slice(-20));
          await randomWait(15000, 30000);
        }
      }
    }

    randomScroll(800, 1800);
    await randomWait(3000, 5000);
    await sendLog(
      'Scroll ' + (round + 1) + '/' + SCROLL_ROUNDS +
      ' -- comments: ' + commented + ', likes: ' + liked + ', skipped: ' + skipped
    );
  }

  await sendLog('Done -- comments: ' + commented + ', likes: ' + liked + ', skipped: ' + skipped);
  chrome.runtime.sendMessage({ action: 'PAGE_DONE', commented: commented, liked: liked, skipped: skipped });
}

// -- Like ---------------------------------------------------------------------

async function likePost(post) {
  const btn =
    post.querySelector('[data-test-id="like-button"]') ||
    post.querySelector('[data-control-name="like"]') ||
    post.querySelector('button[aria-label*="Like" i]') ||
    post.querySelector('button[aria-label*="React" i]') ||
    post.querySelector('button[aria-label*="Reagir" i]') ||
    post.querySelector('button[aria-label*="Curtir" i]') ||
    Array.from(post.querySelectorAll('button')).find(
      b => /^(like|react|reagir|curtir)/i.test((b.getAttribute('aria-label') || b.textContent).trim())
    );
  if (!btn) return false;
  if (btn.getAttribute('aria-pressed') === 'true') return false;
  await humanClick(btn);
  return true;
}

// -- Comment ------------------------------------------------------------------

async function commentOnPost(post) {
  const commentBtn =
    post.querySelector('button[aria-label*="Comment" i]') ||
    post.querySelector('button[aria-label*="Comentar" i]') ||
    post.querySelector('[data-control-name="comment"]') ||
    post.querySelector('button[data-test-id*="comment"]') ||
    Array.from(post.querySelectorAll('button')).find(
      b => /^(comment|comentar)$/i.test(b.textContent.trim())
    );
  if (!commentBtn) return false;

  await humanClick(commentBtn);
  await randomWait(2500, 4500);

  const commentBox =
    post.querySelector('.ql-editor[data-placeholder]') ||
    document.querySelector('.comments-comment-texteditor .ql-editor') ||
    document.querySelector('.comments-comment-box__text-editor .ql-editor') ||
    document.querySelector('[contenteditable="true"][data-placeholder*="omment" i]') ||
    document.querySelector('[contenteditable="true"][data-placeholder*="omentár" i]') ||
    document.querySelector('.comments-comment-box [contenteditable="true"]') ||
    document.querySelector('[role="textbox"][contenteditable="true"]');

  if (!commentBox) {
    await sendLog('Comment box not found after click');
    return false;
  }

  commentBox.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, COMMENT_TEXT);
  commentBox.dispatchEvent(new InputEvent('input', { bubbles: true }));

  await randomWait(3000, 6000);

  const submitBtn =
    post.querySelector('button[class*="comments-comment-box__submit-button"]') ||
    document.querySelector('.comments-comment-box__submit-button--cr') ||
    document.querySelector('.comments-comment-box .artdeco-button--primary') ||
    document.querySelector('button[data-control-name="submit-post"]') ||
    document.querySelector('button[data-control-name="comment.comment"]') ||
    Array.from(document.querySelectorAll('.comments-comment-box button, [role="dialog"] button')).find(
      b => /^(post|publicar|postar|enviar)$/i.test(b.textContent.trim()) ||
           /submit/i.test(b.getAttribute('aria-label') || '')
    );

  if (!submitBtn) {
    await sendLog('Submit button not found');
    return false;
  }

  await humanClick(submitBtn);
  await randomWait(2000, 4000);
  return true;
}

// -- DOM helpers --------------------------------------------------------------

async function waitForPosts(maxWait) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const posts = getFeedPosts();
    if (posts.length) return posts;
    await new Promise(function(r) { setTimeout(r, 2000); });
  }
  return getFeedPosts();
}

function getFeedPosts() {
  // Strategy 1: standard content-search li containers
  const s1 = Array.from(document.querySelectorAll(
    'li.reusable-search__result-container,' +
    'li[class*="reusable-search__result"],' +
    'div.reusable-search__result-container,' +
    'div[class*="reusable-search__result"]'
  )).filter(function(el) {
    return (
      el.querySelector('[data-chameleon-result-urn],[data-entity-urn]') ||
      el.querySelector('a[href*="/feed/update/"], a[href*="/posts/"]')
    );
  });
  if (s1.length) return s1;

  // Strategy 2: inner cards with chameleon / entity URN
  const s2 = Array.from(document.querySelectorAll(
    'li.reusable-search__result-container [data-chameleon-result-urn],' +
    'li[class*="reusable-search__result"] [data-chameleon-result-urn],' +
    'div[class*="reusable-search__result"] [data-entity-urn]'
  ));
  if (s2.length) return s2;

  // Strategy 3: search container list items with post links
  const s3 = Array.from(document.querySelectorAll(
    '.search-results-container li, .search-results-container [data-view-name]'
  )).filter(function(el) {
    return el.querySelector('a[href*="/posts/"], a[href*="/feed/update/"]');
  });
  if (s3.length) return s3;

  // Strategy 4: walk up from like/comment buttons
  const LIKE_SEL = 'button[aria-label*="Like" i],button[aria-label*="Curtir" i],' +
                   'button[aria-label*="Comment" i],button[aria-label*="Comentar" i]';
  const anchors = Array.from(document.querySelectorAll('a[href*="/feed/update/"],a[href*="/posts/"]'));
  const seen = new Set();
  const byLink = [];
  for (const a of anchors) {
    let el = a.parentElement;
    let d = 0;
    while (el && el !== document.body && d < 14) {
      if (el.querySelector(LIKE_SEL) && !seen.has(el)) {
        seen.add(el);
        byLink.push(el);
        break;
      }
      el = el.parentElement;
      d++;
    }
  }
  return byLink;
}

function extractPostId(post) {
  const direct =
    post.getAttribute('data-urn') ||
    post.getAttribute('data-id') ||
    post.getAttribute('data-chameleon-result-urn') ||
    post.getAttribute('data-entity-urn') ||
    post.getAttribute('data-occludable-entity-urn');
  if (direct) return direct;

  const ancestor = post.closest(
    '[data-urn],[data-id],[data-chameleon-result-urn],[data-entity-urn],[data-occludable-entity-urn]'
  );
  if (ancestor) {
    return ancestor.getAttribute('data-urn') ||
           ancestor.getAttribute('data-id') ||
           ancestor.getAttribute('data-chameleon-result-urn') ||
           ancestor.getAttribute('data-entity-urn') ||
           ancestor.getAttribute('data-occludable-entity-urn');
  }

  const nested = post.querySelector(
    '[data-urn],[data-id],[data-entity-urn],[data-chameleon-result-urn]'
  );
  if (nested) {
    return nested.getAttribute('data-urn') ||
           nested.getAttribute('data-id') ||
           nested.getAttribute('data-entity-urn') ||
           nested.getAttribute('data-chameleon-result-urn');
  }

  const link =
    post.querySelector('a[href*="/feed/update/"]') ||
    post.querySelector('a[href*="/posts/"]');
  if (link) return link.href.split('?')[0];

  return null;
}

// -- Logger -------------------------------------------------------------------

async function sendLog(text) {
  console.log('[Post Commenter]', text);
  try { chrome.runtime.sendMessage({ action: 'LOG', text: text }); } catch (_) {}
}
"""

OUT.write_text(content, encoding='utf-8')
print("post-commenter.js written:", len(content.splitlines()), "lines")
