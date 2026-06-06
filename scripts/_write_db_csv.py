"""Rewrites utils/db.js to use OPFS (Origin Private File System) for CSV persistence."""
import pathlib

OUT = pathlib.Path(__file__).parent.parent / "utils" / "db.js"

content = r"""/**
 * db.js -- CSV interaction log using the Origin Private File System (OPFS).
 *
 * File stored: post_interactions.csv  (under linkedin.com's OPFS origin)
 * CSV format : postId|postUrl|action|interactedAt   (pipe-delimited to avoid URL/URN conflicts)
 *
 * Exposed as plain globals to content scripts (no module system).
 *   hasInteracted(postId, action)           -> Promise<boolean>
 *   saveInteraction(postId, action, postUrl) -> Promise<void>
 */

const _CSV_FILE      = 'post_interactions.csv';
const _CSV_HEADER    = 'postId|postUrl|action|interactedAt\n';
const _MAX_RECORDS   = 500;

// -- Internal helpers ---------------------------------------------------------

async function _fileHandle() {
  const root = await navigator.storage.getDirectory();
  return root.getFileHandle(_CSV_FILE, { create: true });
}

async function _readRecords() {
  try {
    const handle = await _fileHandle();
    const file   = await handle.getFile();
    const text   = await file.text();
    return text
      .split('\n')
      .filter(function(line) {
        return line.trim() && !line.startsWith('postId');
      })
      .map(function(line) {
        const cols = line.split('|');
        return {
          postId      : cols[0] || '',
          postUrl     : cols[1] || '',
          action      : cols[2] || '',
          interactedAt: cols[3] || '',
        };
      });
  } catch (_) {
    return [];
  }
}

async function _writeRecords(records) {
  const rows = records.slice(-_MAX_RECORDS).map(function(r) {
    return [r.postId, r.postUrl, r.action, r.interactedAt].join('|');
  });
  const csv = _CSV_HEADER + rows.join('\n') + '\n';

  const handle   = await _fileHandle();
  const writable = await handle.createWritable();
  await writable.write(csv);
  await writable.close();
}

// -- Public API ---------------------------------------------------------------

/**
 * Returns true if the post was already actioned with the given action.
 * @param {string} postId
 * @param {string} action  'like' | 'comment'
 * @returns {Promise<boolean>}
 */
async function hasInteracted(postId, action) {
  const records = await _readRecords();
  return records.some(function(r) {
    return r.postId === postId && r.action === action;
  });
}

/**
 * Appends an interaction record to the CSV. No-ops if the record already exists.
 * @param {string} postId
 * @param {string} action   'like' | 'comment'
 * @param {string} postUrl  Canonical permalink of the post
 * @returns {Promise<void>}
 */
async function saveInteraction(postId, action, postUrl) {
  const records = await _readRecords();

  const exists = records.some(function(r) {
    return r.postId === postId && r.action === action;
  });
  if (exists) return;

  records.push({
    postId      : postId,
    postUrl     : postUrl || postId,
    action      : action,
    interactedAt: new Date().toISOString(),
  });

  await _writeRecords(records);
}
"""

OUT.write_text(content, encoding="utf-8")
print("db.js written:", len(content.splitlines()), "lines")
