/**
 * post-commenter.js -- Collects post URLs from LinkedIn /search/results/content/ pages.
 *
 * Scrolls the page multiple times, gathers all post links found in the DOM,
 * and sends them back to the service worker (PAGE_DONE).
 * No automatic liking or commenting -- URLs are exported as CSV via the popup.
 *
 * Injected before this script (manifest.json order):
 *   utils/human-mimicry.js  -- randomWait, randomScroll, randomInt
 */

const SCROLL_ROUNDS = 5;

(async function init() {
  const data = await chrome.storage.local.get('commenterRunning');
  if (!data.commenterRunning) {
    console.log('[Post Collector] Idle -- extension not started.');
    return;
  }

  try {
    await runCollector();
  } catch (e) {
    console.error('[Post Collector] Fatal:', e);
    chrome.runtime.sendMessage({ action: 'PAGE_DONE', urls: [], keywords: '' });
  }
})();

async function runCollector() {
  const params   = new URL(location.href).searchParams;
  const keywords = decodeURIComponent(params.get('keywords') || location.href);

  await sendLog('Collecting: ' + keywords);
  await randomWait(3000, 6000);

  const collected = new Set();

  for (let round = 0; round < SCROLL_ROUNDS; round++) {
    await randomScroll(300, 700);
    await randomWait(2500, 5000);

    harvestLinks(collected);

    await sendLog(
      'Round ' + (round + 1) + '/' + SCROLL_ROUNDS +
      ' — ' + collected.size + ' posts found so far'
    );
  }

  // Final harvest after last scroll settles
  await randomWait(1500, 3000);
  harvestLinks(collected);

  const urls = Array.from(collected);
  await sendLog('Done. ' + urls.length + ' unique post URLs collected.');

  chrome.runtime.sendMessage({ action: 'PAGE_DONE', urls: urls, keywords: keywords });
}

function harvestLinks(set) {
  document.querySelectorAll(
    'a[href*="/feed/update/"], a[href*="/posts/"]'
  ).forEach(function(a) {
    var clean = cleanUrl(a.href);
    if (clean) set.add(clean);
  });
}

function cleanUrl(href) {
  try {
    var u = new URL(href);
    return u.origin + u.pathname;
  } catch (_) {
    return null;
  }
}

async function sendLog(text) {
  console.log('[Post Collector]', text);
  try {
    chrome.runtime.sendMessage({ action: 'LOG', text: text });
  } catch (_) {}
}
