/**
 * voyager-fetch.js — LinkedIn Voyager API client for content scripts.
 *
 * How it works:
 *   LinkedIn's internal REST API ("Voyager") runs at /voyager/api/*.
 *   Content scripts run inside https://www.linkedin.com/* with the user's
 *   authenticated session cookies already present in the browser.
 *   fetch() with credentials:'include' sends those cookies automatically —
 *   no login, no API key, no OAuth needed.
 *
 *   The only required header is `csrf-token`, which is just the value of the
 *   JSESSIONID cookie (without quotes). LinkedIn uses this for CSRF protection.
 *   Pattern extracted from: open-linkedin-api/open_linkedin_api/client.py
 *
 * Usage (in any content script that loads this file before itself):
 *   const data = await voyagerFetch('/identity/profiles/me/networkinfo');
 *   const results = await voyagerFetch('/search/blended?keywords=recruiter&...', { method: 'GET' });
 *
 * Error handling:
 *   Throws on 401 (session expired), 429 (rate limit), and non-2xx responses.
 *   Callers should wrap in try/catch and fall back to DOM scraping as needed.
 */

const VOYAGER_BASE = 'https://www.linkedin.com/voyager/api';

/**
 * Reads the CSRF token from the JSESSIONID cookie.
 * LinkedIn sets this on every authenticated session.
 * @returns {string|null} Token string, or null if not found (user not logged in).
 */
function getLinkedInCsrfToken() {
  const match = document.cookie.match(/JSESSIONID="?([^";]+)/);
  return match ? match[1] : null;
}

/**
 * Makes an authenticated request to the LinkedIn Voyager API.
 *
 * @param {string} path      - API path (without base), e.g. '/identity/profiles/me/ssi'
 * @param {object} options   - Optional fetch() overrides (method, body, headers, etc.)
 * @returns {Promise<object>} Parsed JSON response.
 * @throws {Error} On auth failure, rate limiting, or any non-2xx response.
 */
async function voyagerFetch(path, options = {}) {
  const csrfToken = getLinkedInCsrfToken();
  if (!csrfToken) {
    throw new Error('[Voyager] JSESSIONID not found — user may not be logged in to LinkedIn.');
  }

  const response = await fetch(`${VOYAGER_BASE}${path}`, {
    method: options.method || 'GET',
    credentials: 'include',
    headers: {
      'accept': 'application/vnd.linkedin.normalized+json+2.1',
      'accept-language': 'en-US,en;q=0.9',
      'csrf-token': csrfToken,
      'x-li-lang': 'en_US',
      'x-restli-protocol-version': '2.0.0',
      'x-li-page-instance': 'urn:li:page:d_flagship3_profile_view_base',
      ...(options.headers || {}),
    },
    body: options.body || undefined,
  });

  if (response.status === 401) {
    throw new Error('[Voyager] 401 Unauthorized — session expired or CSRF mismatch. Reload LinkedIn.');
  }
  if (response.status === 429) {
    throw new Error('[Voyager] 429 Too Many Requests — rate limited. Will retry on next run.');
  }
  if (!response.ok) {
    throw new Error(`[Voyager] HTTP ${response.status} on ${path}`);
  }

  return response.json();
}
