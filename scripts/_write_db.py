"""Rewrites utils/db.js to expose only hasInteracted / saveInteraction."""
import pathlib

OUT = pathlib.Path(__file__).parent.parent / "utils" / "db.js"

content = r"""/**
 * db.js -- Lightweight interaction store for LinkedIn Post Commenter.
 *
 * Storage key: postInteractions  (array of interaction records, max 500)
 * Record shape: { postId, postUrl, action, interactedAt }
 *
 * Exposed to content scripts via global functions (no module system required).
 */

/**
 * Check whether the extension already acted on a post with the given action.
 * @param {string} postId  - The unique post identifier extracted from the DOM
 * @param {string} action  - 'like' | 'comment'
 * @returns {Promise<boolean>}
 */
async function hasInteracted(postId, action) {
  const data = await chrome.storage.local.get('postInteractions');
  const records = Array.isArray(data.postInteractions) ? data.postInteractions : [];
  return records.some(function(r) { return r.postId === postId && r.action === action; });
}

/**
 * Persist an interaction record so the post is not actioned again.
 * Caps the list at 500 entries (oldest entries are dropped).
 * @param {string} postId  - The unique post identifier extracted from the DOM
 * @param {string} action  - 'like' | 'comment'
 * @returns {Promise<void>}
 */
async function saveInteraction(postId, action) {
  const data = await chrome.storage.local.get('postInteractions');
  const records = Array.isArray(data.postInteractions) ? data.postInteractions : [];
  records.push({
    postId: postId,
    postUrl: location.href,
    action: action,
    interactedAt: new Date().toISOString(),
  });
  const trimmed = records.slice(-500);
  await chrome.storage.local.set({ postInteractions: trimmed });
}
"""

OUT.write_text(content, encoding="utf-8")
print("db.js written:", len(content.splitlines()), "lines")
