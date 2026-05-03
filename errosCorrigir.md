Uncaught (in promise) Error: Unable to download all specified images.
Contexto
extensions::notifications
Rastreamento de pilha
-------------
Contexto
https://www.linkedin.com/mynetwork/catch-up/work_anniversaries/
Rastreamento de pilha
content/relationship-builder.js:154 (getNetworkCards)
content/relationship-builder.js:69 (buildRelationships)
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77
78
79
80
81
82
83
84
85
86
87
88
89
90
91
92
93
94
95
96
97
98
99
100
101
102
103
104
105
106
107
108
109
110
111
112
113
114
115
116
117
118
119
120
121
122
123
124
125
126
127
128
129
130
131
132
133
134
135
136
137
138
139
140
141
142
143
144
145
146
147
148
149
150
151
152
153
154
155
156
157
158
159
160
161
162
163
164
165
166
167
168
169
170
171
172
173
174
175
176
177
178
179
180
181
182
183
184
185
186
187
188
189
190
191
192
193
194
195
196
197
198
199
200
201
202
203
204
205
206
207
208
209
210
211
212
213
214
215
216
217
218
219
220
221
222
223
224
225
226
227
228
229
230
231
232
233
234
235
236
237
238
239
240
241
242
243
244
245
246
247
/**
 * relationship-builder.js — Content script for linkedin.com/mynetwork/
 *
 * Engages with pending network events to boost the SSI "Build Relationships" pillar:
 *   - Congratulates connections on work anniversaries and new roles
 *   - Responds to connection acceptance notifications
 *
 * Session cap: 10 relationship touches per run.
 * Human-mimicry delays applied between all interactions.
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

const SESSION_CAP = 10;
// SEVEN_DAYS_MS is already declared as a global by utils/db.js (loaded first in manifest)

const BIRTHDAY_MESSAGES = [
  "Happy birthday! Hope you're having a great day. 🎂",
  "Many happy returns! Wishing you a wonderful birthday.",
  "Happy birthday! Great having you in my professional network.",
  "Wishing you a fantastic birthday and an even better year ahead! 🎉",
];

const ANNIVERSARY_MESSAGES = [
  "Congratulations on the milestone! Wishing you continued success.",
  "Happy work anniversary! Great to have you in my network.",
  "Congratulations on another year — looking forward to following your journey!",
];

const NEW_JOB_MESSAGES = [
  "Congratulations on the new role! Exciting times ahead.",
  "Great news on the new position — wishing you a strong start!",
  "Congratulations! New roles bring great opportunities. All the best.",
];

// ─── Message listener ─────────────────────────────────────────────────────────

let PAGE_TYPE = null; // 'birthday' | 'anniversary' | null (auto-detect)

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START' && message.task === 'relationship-builder') {
    if (message.pageType) PAGE_TYPE = message.pageType;
    buildRelationships().then((result) => {
      sendResponse({ success: true, ...result });
    }).catch((error) => {
      console.error('[Relationship Builder] Error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// ─── Core logic ───────────────────────────────────────────────────────────────

async function buildRelationships() {
  await contentLog(`▶ relationship-builder started | ${window.location.href}`);
  await randomWait(3000, 6000);

  let touched = 0;
  const cards = getNetworkCards();

  for (const card of cards) {
    if (touched >= SESSION_CAP) break;

    const type = detectCardType(card);
    if (!type) continue;

    const profileId  = extractProfileId(card);
    const profileUrl = extractProfileUrl(card);

    // 7-day dedup — skip if we already congratulated this person recently
    const name = extractName(card);
    if (profileId && await isRecentlyTouched(profileId)) {
      console.log(`[Relationship Builder] Skipping ${name || profileId} — touched within 7 days.`);
      await contentLog(`↷ ${profileUrl || profileId} | ${name} — recently touched (7-day)`);
      continue;
    }

    await scrollIntoViewAndPause(card);
    await randomWait(1500, 4000);

    const messages =
      type === 'anniversary' ? ANNIVERSARY_MESSAGES :
      type === 'birthday'    ? BIRTHDAY_MESSAGES    :
                               NEW_JOB_MESSAGES;
    const chosen   = messages[Math.floor(Math.random() * messages.length)];
    const success  = await sendMessage(card, [chosen]);

    if (success) {
      touched++;
      await contentLog(`✓ ${profileUrl || profileId} | ${name} — ${type} (${touched}/${SESSION_CAP})`, 'success');
      console.log(`[Relationship Builder] Engaged with ${type} card for ${name} (${touched}/${SESSION_CAP})`);

      // Persist to history — name already extracted above
      const { relationships = [] } = await chrome.storage.local.get('relationships');
      relationships.push({
        profileId: profileId || `unknown-${Date.now()}`,
        name,
        profileUrl,
        eventType: type,
        messageSent: chosen,
        touchedAt: new Date().toISOString(),
      });
      await chrome.storage.local.set({ relationships: relationships.slice(-200) });

      await randomWait(6000, 12000);
    }
  }

  await chrome.storage.local.set({
    lastRelationshipBuild: { touched, runAt: new Date().toISOString() },
  });
  await contentLog(`■ relationship-builder done | ${touched} touched`);

  return { touched };
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function getNetworkCards() {
  // Strategy 1: dedicated birthday/anniversary catch-up pages
  const catchUp = Array.from(document.querySelectorAll(
    '.catch-up-card, ' +
    '[data-view-name="catch-up-entity-card"]'
  ));
  if (catchUp.length) { console.log(`[Relationship Builder] Found ${catchUp.length} cards via catch-up selectors.`); return catchUp; }

  // Strategy 2: notification-style items on catch-up/all/
  const notifItems = Array.from(document.querySelectorAll(
    '.notification-item, ' +
    '[data-view-name="notification-item"]'
  ));
  if (notifItems.length) { console.log(`[Relationship Builder] Found ${notifItems.length} cards via notification items.`); return notifItems; }

  // Strategy 3: standard mynetwork page cards
  const standard = Array.from(document.querySelectorAll('.mn-pymk-list__card, .mn-community-summary'));
  if (standard.length) { console.log(`[Relationship Builder] Found ${standard.length} cards via standard selectors.`); return standard; }

  // Strategy 4: any artdeco card on a mynetwork/* page that has a profile link
  const byLink = Array.from(document.querySelectorAll('.artdeco-card')).filter(
    el => el.querySelector('a[href*="/in/"]')
  );
  if (byLink.length) { console.log(`[Relationship Builder] Found ${byLink.length} cards via artdeco+profile-link fallback.`); return byLink; }

  console.warn('[Relationship Builder] All selectors failed. Page URL:', location.href);
  return [];
}

function detectCardType(card) {
  // If the service worker told us which page we're on, trust it
  if (PAGE_TYPE === 'birthday')     return 'birthday';
  if (PAGE_TYPE === 'anniversary')  return 'anniversary';
  // Fallback: infer from card text (catch-up/all/ or manual trigger)
  const text = card.textContent.toLowerCase();
  if (text.includes('birthday') || text.includes('born') || text.includes('happy birthday')) return 'birthday';
  if (text.includes('anniversary') || text.includes('years at')) return 'anniversary';
  if (text.includes('new job') || text.includes('started') || text.includes('joined')) return 'new_job';
  return null;
}

function extractProfileId(card) {
  const link = card.querySelector('a[href*="/in/"]');
  if (!link) return null;
  const match = link.href.match(/\/in\/([^/?#]+)/);
  return match ? match[1] : null;
}

function extractProfileUrl(card) {
  const link = card.querySelector('a[href*="/in/"]');
  if (!link) return null;
  const href = link.getAttribute('href') || '';
  const clean = href.split('?')[0].split('#')[0];
  return clean.startsWith('http') ? clean : `https://www.linkedin.com${clean}`;
}

function extractName(card) {
  // Catch-up page specific selectors (birthday / anniversary cards)
  const catchUpEl =
    card.querySelector('.catch-up-card__actor-name') ||
    card.querySelector('.catch-up-identity__name') ||
    card.querySelector('[data-anonymize="person-name"]') ||
    card.querySelector('.entity-result__title-text') ||
    card.querySelector('.update-components-actor__name') ||
    card.querySelector('.update-components-actor__meta-link span[aria-hidden="true"]');
  if (catchUpEl) return catchUpEl.textContent.trim();

  // Generic mynetwork page
  const genericEl = card.querySelector('.mn-connection-card__name, .actor-name, span[aria-hidden="true"]');
  return genericEl ? genericEl.textContent.trim() : 'there';
}

/**
 * Returns true if this profileId already has a record within the last 7 days.
 */
async function isRecentlyTouched(profileId) {
  const { relationships = [] } = await chrome.storage.local.get('relationships');
  return relationships.some(
    r => r.profileId === profileId && (Date.now() - new Date(r.touchedAt).getTime()) < SEVEN_DAYS_MS
  );
}

async function sendMessage(card, messages) {
  // On the catch-up page LinkedIn uses "Say happy birthday" or "Wish" buttons
  // On the standard mynetwork page it uses "Message"
  const messageButton =
    card.querySelector('button[aria-label*="Message"]') ||
    card.querySelector('button[aria-label*="birthday"]') ||
    card.querySelector('button[aria-label*="Wish"]') ||
    Array.from(card.querySelectorAll('button')).find(
      b => /^(Message|Wish|Say happy birthday)$/i.test(b.textContent.trim())
    );
  if (!messageButton) return false;

  await humanClick(messageButton);
  await randomWait(2000, 4000);

  const messageBox = document.querySelector('.msg-form__contenteditable[contenteditable="true"]');
  if (!messageBox) return false;

  const message = messages[Math.floor(Math.random() * messages.length)];
  messageBox.focus();
  messageBox.textContent = message;
  messageBox.dispatchEvent(new InputEvent('input', { bubbles: true }));
  await randomWait(2000, 4000);

  const sendButton = document.querySelector('.msg-form__send-button');
  if (!sendButton) return false;

  await humanClick(sendButton);
  await randomWait(1000, 2500);

  // Close the message panel
  const closeButton = document.querySelector('button[data-control-name="overlay.close_conversation_window"]');
  if (closeButton) await humanClick(closeButton);

  return true;
}
 ------------------
 Contexto
https://www.linkedin.com/mynetwork/catch-up/birthday/
Rastreamento de pilha
content/relationship-builder.js:154 (getNetworkCards)
content/relationship-builder.js:69 (buildRelationships)
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77
78
79
80
81
82
83
84
85
86
87
88
89
90
91
92
93
94
95
96
97
98
99
100
101
102
103
104
105
106
107
108
109
110
111
112
113
114
115
116
117
118
119
120
121
122
123
124
125
126
127
128
129
130
131
132
133
134
135
136
137
138
139
140
141
142
143
144
145
146
147
148
149
150
151
152
153
154
155
156
157
158
159
160
161
162
163
164
165
166
167
168
169
170
171
172
173
174
175
176
177
178
179
180
181
182
183
184
185
186
187
188
189
190
191
192
193
194
195
196
197
198
199
200
201
202
203
204
205
206
207
208
209
210
211
212
213
214
215
216
217
218
219
220
221
222
223
224
225
226
227
228
229
230
231
232
233
234
235
236
237
238
239
240
241
242
243
244
245
246
247
/**
 * relationship-builder.js — Content script for linkedin.com/mynetwork/
 *
 * Engages with pending network events to boost the SSI "Build Relationships" pillar:
 *   - Congratulates connections on work anniversaries and new roles
 *   - Responds to connection acceptance notifications
 *
 * Session cap: 10 relationship touches per run.
 * Human-mimicry delays applied between all interactions.
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

const SESSION_CAP = 10;
// SEVEN_DAYS_MS is already declared as a global by utils/db.js (loaded first in manifest)

const BIRTHDAY_MESSAGES = [
  "Happy birthday! Hope you're having a great day. 🎂",
  "Many happy returns! Wishing you a wonderful birthday.",
  "Happy birthday! Great having you in my professional network.",
  "Wishing you a fantastic birthday and an even better year ahead! 🎉",
];

const ANNIVERSARY_MESSAGES = [
  "Congratulations on the milestone! Wishing you continued success.",
  "Happy work anniversary! Great to have you in my network.",
  "Congratulations on another year — looking forward to following your journey!",
];

const NEW_JOB_MESSAGES = [
  "Congratulations on the new role! Exciting times ahead.",
  "Great news on the new position — wishing you a strong start!",
  "Congratulations! New roles bring great opportunities. All the best.",
];

// ─── Message listener ─────────────────────────────────────────────────────────

let PAGE_TYPE = null; // 'birthday' | 'anniversary' | null (auto-detect)

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START' && message.task === 'relationship-builder') {
    if (message.pageType) PAGE_TYPE = message.pageType;
    buildRelationships().then((result) => {
      sendResponse({ success: true, ...result });
    }).catch((error) => {
      console.error('[Relationship Builder] Error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// ─── Core logic ───────────────────────────────────────────────────────────────

async function buildRelationships() {
  await contentLog(`▶ relationship-builder started | ${window.location.href}`);
  await randomWait(3000, 6000);

  let touched = 0;
  const cards = getNetworkCards();

  for (const card of cards) {
    if (touched >= SESSION_CAP) break;

    const type = detectCardType(card);
    if (!type) continue;

    const profileId  = extractProfileId(card);
    const profileUrl = extractProfileUrl(card);

    // 7-day dedup — skip if we already congratulated this person recently
    const name = extractName(card);
    if (profileId && await isRecentlyTouched(profileId)) {
      console.log(`[Relationship Builder] Skipping ${name || profileId} — touched within 7 days.`);
      await contentLog(`↷ ${profileUrl || profileId} | ${name} — recently touched (7-day)`);
      continue;
    }

    await scrollIntoViewAndPause(card);
    await randomWait(1500, 4000);

    const messages =
      type === 'anniversary' ? ANNIVERSARY_MESSAGES :
      type === 'birthday'    ? BIRTHDAY_MESSAGES    :
                               NEW_JOB_MESSAGES;
    const chosen   = messages[Math.floor(Math.random() * messages.length)];
    const success  = await sendMessage(card, [chosen]);

    if (success) {
      touched++;
      await contentLog(`✓ ${profileUrl || profileId} | ${name} — ${type} (${touched}/${SESSION_CAP})`, 'success');
      console.log(`[Relationship Builder] Engaged with ${type} card for ${name} (${touched}/${SESSION_CAP})`);

      // Persist to history — name already extracted above
      const { relationships = [] } = await chrome.storage.local.get('relationships');
      relationships.push({
        profileId: profileId || `unknown-${Date.now()}`,
        name,
        profileUrl,
        eventType: type,
        messageSent: chosen,
        touchedAt: new Date().toISOString(),
      });
      await chrome.storage.local.set({ relationships: relationships.slice(-200) });

      await randomWait(6000, 12000);
    }
  }

  await chrome.storage.local.set({
    lastRelationshipBuild: { touched, runAt: new Date().toISOString() },
  });
  await contentLog(`■ relationship-builder done | ${touched} touched`);

  return { touched };
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function getNetworkCards() {
  // Strategy 1: dedicated birthday/anniversary catch-up pages
  const catchUp = Array.from(document.querySelectorAll(
    '.catch-up-card, ' +
    '[data-view-name="catch-up-entity-card"]'
  ));
  if (catchUp.length) { console.log(`[Relationship Builder] Found ${catchUp.length} cards via catch-up selectors.`); return catchUp; }

  // Strategy 2: notification-style items on catch-up/all/
  const notifItems = Array.from(document.querySelectorAll(
    '.notification-item, ' +
    '[data-view-name="notification-item"]'
  ));
  if (notifItems.length) { console.log(`[Relationship Builder] Found ${notifItems.length} cards via notification items.`); return notifItems; }

  // Strategy 3: standard mynetwork page cards
  const standard = Array.from(document.querySelectorAll('.mn-pymk-list__card, .mn-community-summary'));
  if (standard.length) { console.log(`[Relationship Builder] Found ${standard.length} cards via standard selectors.`); return standard; }

  // Strategy 4: any artdeco card on a mynetwork/* page that has a profile link
  const byLink = Array.from(document.querySelectorAll('.artdeco-card')).filter(
    el => el.querySelector('a[href*="/in/"]')
  );
  if (byLink.length) { console.log(`[Relationship Builder] Found ${byLink.length} cards via artdeco+profile-link fallback.`); return byLink; }

  console.warn('[Relationship Builder] All selectors failed. Page URL:', location.href);
  return [];
}

function detectCardType(card) {
  // If the service worker told us which page we're on, trust it
  if (PAGE_TYPE === 'birthday')     return 'birthday';
  if (PAGE_TYPE === 'anniversary')  return 'anniversary';
  // Fallback: infer from card text (catch-up/all/ or manual trigger)
  const text = card.textContent.toLowerCase();
  if (text.includes('birthday') || text.includes('born') || text.includes('happy birthday')) return 'birthday';
  if (text.includes('anniversary') || text.includes('years at')) return 'anniversary';
  if (text.includes('new job') || text.includes('started') || text.includes('joined')) return 'new_job';
  return null;
}

function extractProfileId(card) {
  const link = card.querySelector('a[href*="/in/"]');
  if (!link) return null;
  const match = link.href.match(/\/in\/([^/?#]+)/);
  return match ? match[1] : null;
}

function extractProfileUrl(card) {
  const link = card.querySelector('a[href*="/in/"]');
  if (!link) return null;
  const href = link.getAttribute('href') || '';
  const clean = href.split('?')[0].split('#')[0];
  return clean.startsWith('http') ? clean : `https://www.linkedin.com${clean}`;
}

function extractName(card) {
  // Catch-up page specific selectors (birthday / anniversary cards)
  const catchUpEl =
    card.querySelector('.catch-up-card__actor-name') ||
    card.querySelector('.catch-up-identity__name') ||
    card.querySelector('[data-anonymize="person-name"]') ||
    card.querySelector('.entity-result__title-text') ||
    card.querySelector('.update-components-actor__name') ||
    card.querySelector('.update-components-actor__meta-link span[aria-hidden="true"]');
  if (catchUpEl) return catchUpEl.textContent.trim();

  // Generic mynetwork page
  const genericEl = card.querySelector('.mn-connection-card__name, .actor-name, span[aria-hidden="true"]');
  return genericEl ? genericEl.textContent.trim() : 'there';
}

/**
 * Returns true if this profileId already has a record within the last 7 days.
 */
async function isRecentlyTouched(profileId) {
  const { relationships = [] } = await chrome.storage.local.get('relationships');
  return relationships.some(
    r => r.profileId === profileId && (Date.now() - new Date(r.touchedAt).getTime()) < SEVEN_DAYS_MS
  );
}

async function sendMessage(card, messages) {
  // On the catch-up page LinkedIn uses "Say happy birthday" or "Wish" buttons
  // On the standard mynetwork page it uses "Message"
  const messageButton =
    card.querySelector('button[aria-label*="Message"]') ||
    card.querySelector('button[aria-label*="birthday"]') ||
    card.querySelector('button[aria-label*="Wish"]') ||
    Array.from(card.querySelectorAll('button')).find(
      b => /^(Message|Wish|Say happy birthday)$/i.test(b.textContent.trim())
    );
  if (!messageButton) return false;

  await humanClick(messageButton);
  await randomWait(2000, 4000);

  const messageBox = document.querySelector('.msg-form__contenteditable[contenteditable="true"]');
  if (!messageBox) return false;

  const message = messages[Math.floor(Math.random() * messages.length)];
  messageBox.focus();
  messageBox.textContent = message;
  messageBox.dispatchEvent(new InputEvent('input', { bubbles: true }));
  await randomWait(2000, 4000);

  const sendButton = document.querySelector('.msg-form__send-button');
  if (!sendButton) return false;

  await humanClick(sendButton);
  await randomWait(1000, 2500);

  // Close the message panel
  const closeButton = document.querySelector('button[data-control-name="overlay.close_conversation_window"]');
  if (closeButton) await humanClick(closeButton);

  return true;
}
 ----------------------
 Contexto
https://www.linkedin.com/search/results/content/?keywords=%22project%20manager%22%20latam&sortBy=%22relevance%22&datePosted=%22past-week%22
Rastreamento de pilha
content/post-engager.js:211 (getFeedPosts)
content/post-engager.js:74 (waitForElements)
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77
78
79
80
81
82
83
84
85
86
87
88
89
90
91
92
93
94
95
96
97
98
99
100
101
102
103
104
105
106
107
108
109
110
111
112
113
114
115
116
117
118
119
120
121
122
123
124
125
126
127
128
129
130
131
132
133
134
135
136
137
138
139
140
141
142
143
144
145
146
147
148
149
150
151
152
153
154
155
156
157
158
159
160
161
162
163
164
165
166
167
168
169
170
171
172
173
174
175
176
177
178
179
180
181
182
183
184
185
186
187
188
189
190
191
192
193
194
195
196
197
198
199
200
201
202
203
204
205
206
207
208
209
210
211
212
213
214
215
216
217
218
219
220
221
222
223
224
225
226
227
228
229
230
231
232
233
234
235
236
237
238
239
240
241
242
243
244
245
246
247
248
249
250
251
252
253
254
255
256
257
258
259
260
261
262
263
264
265
266
267
268
269
270
271
272
273
274
275
276
277
278
279
280
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
 -----------------
 Contexto
https://www.linkedin.com/search/results/content/?keywords=%22project%20manager%22%20latam&sortBy=%22relevance%22&datePosted=%22past-week%22
Rastreamento de pilha
content/post-engager.js:211 (getFeedPosts)
content/post-engager.js:70 (waitForElements)
content/post-engager.js:93 (engageWithPosts)
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77
78
79
80
81
82
83
84
85
86
87
88
89
90
91
92
93
94
95
96
97
98
99
100
101
102
103
104
105
106
107
108
109
110
111
112
113
114
115
116
117
118
119
120
121
122
123
124
125
126
127
128
129
130
131
132
133
134
135
136
137
138
139
140
141
142
143
144
145
146
147
148
149
150
151
152
153
154
155
156
157
158
159
160
161
162
163
164
165
166
167
168
169
170
171
172
173
174
175
176
177
178
179
180
181
182
183
184
185
186
187
188
189
190
191
192
193
194
195
196
197
198
199
200
201
202
203
204
205
206
207
208
209
210
211
212
213
214
215
216
217
218
219
220
221
222
223
224
225
226
227
228
229
230
231
232
233
234
235
236
237
238
239
240
241
242
243
244
245
246
247
248
249
250
251
252
253
254
255
256
257
258
259
260
261
262
263
264
265
266
267
268
269
270
271
272
273
274
275
276
277
278
279
280
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
 ---------------------- 
 Contexto
https://www.linkedin.com/search/results/people/?keywords=Tech%20Recruiter%20Information%20Technology&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%5D
Rastreamento de pilha
content/recruiter-prospector.js:80 (prospectRecruiters)
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77
78
79
80
81
82
83
84
85
86
87
88
89
90
91
92
93
94
95
96
97
98
99
100
101
102
103
104
105
106
107
108
109
110
111
112
113
114
115
116
117
118
119
120
121
122
123
124
125
126
127
128
129
130
131
132
133
134
135
136
137
138
139
140
141
142
143
144
145
146
147
148
149
150
151
152
153
154
155
156
157
158
159
160
161
162
163
164
165
166
167
168
169
170
171
172
173
174
175
176
177
178
179
180
181
182
183
184
185
186
187
188
189
190
191
192
193
194
195
196
197
198
199
200
201
202
203
204
205
206
207
208
209
210
211
212
213
214
215
216
217
218
219
220
221
222
223
224
225
226
227
228
/**
 * recruiter-prospector.js — Content script for linkedin.com/search/results/
 *
 * Automates strategic connection requests to Tech Recruiters in target regions.
 *
 * Rules:
 *   - Daily cap: 20 connection requests per session
 *   - 7-day lock per recruiter profile (enforced via chrome.storage.local)
 *   - Personalised connection note included with every request
 *   - Human-mimicry delays between all actions
 *   - Only sends requests to 1st or 2nd degree connections (excludes 3rd+)
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

/**
 * Daily cap is passed from the Service Worker via the START message.
 * Fallback to 9 (minimum of the 7-day cycle) if not provided.
 */
let SESSION_CAP = 9;

const CONNECTION_NOTE =
  "Hi {firstName}, let's connect! " +
  'Check out my profile & portfolio: ' +
  'https://wesleyzilva.github.io/portfolioNearshoreWesIA/ ' +
  '| https://www.linkedin.com/in/wesleyzilva/ ' +
  '— Wesley, IT Manager Brazil (14+ yrs, remote teams, M&A)';

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START' && message.task === 'recruiter-prospector') {
    // Read the daily cap sent by the service worker
    if (typeof message.dailyCap === 'number') {
      SESSION_CAP = message.dailyCap;
    }
    prospectRecruiters().then((result) => {
      sendResponse({ success: true, ...result });
    }).catch((error) => {
      console.error('[Recruiter Prospector] Error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// ─── Core logic ───────────────────────────────────────────────────────────────

/**
 * Polls a DOM query function until it returns at least one element, or times out.
 * @param {Function} queryFn  - zero-arg function that returns an array
 * @param {number}   maxWait  - total ms to keep trying (default 20 s)
 * @param {number}   interval - ms between attempts (default 2 s)
 */
async function waitForElements(queryFn, maxWait = 20000, interval = 2000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const els = queryFn();
    if (els.length) return els;
    await new Promise(r => setTimeout(r, interval));
  }
  return queryFn(); // final attempt
}

async function prospectRecruiters() {
  await contentLog(`▶ recruiter-prospector started | ${window.location.href}`);
  await randomWait(5000, 9000); // initial wait for SPA render

  const results = await waitForElements(getSearchResultCards);
  if (!results.length) {
    console.warn('[Recruiter Prospector] No search result cards found — selectors may need updating.');
    await contentLog('✗ recruiter-prospector — no search result cards found (waited 20 s)', 'warn');
    await chrome.storage.local.set({ lastProspecting: { sent: 0, runAt: new Date().toISOString() } });
    return { sent: 0 };
  }
  await contentLog(`recruiter-prospector — ${results.length} cards found`);

  let sent = 0;

  for (const card of results) {
    if (sent >= SESSION_CAP) break;

    const profileId = extractProfileId(card);
    if (!profileId) continue;

    const profileUrl = extractProfileUrl(card) || `/in/${profileId}`;
    const locked = await isRecruiterLocked(profileId);
    if (locked) {
      console.log(`[Recruiter Prospector] Skipping ${profileId} — within 7-day lock.`);
      await contentLog(`↷ ${profileUrl} — locked (7-day)`);
      continue;
    }

    const connectButton = getConnectButton(card);
    if (!connectButton) {
      await contentLog(`↷ ${profileUrl} — no connect button`);
      continue;
    }

    // Simulate reading the profile card before deciding to connect
    await readBeforeActing(card, 3000, 7000);
    await humanClick(connectButton);

    // LinkedIn may show a modal asking for a note
    const noteSent = await handleConnectionModal(card, profileId);
    if (!noteSent) continue;

    const firstName = extractName(card);
    await markRecruiterInteracted(profileId, firstName);
    sent++;
    await contentLog(`✓ ${profileUrl} | ${firstName} — connected (${sent}/${SESSION_CAP})`, 'success');

    // Persist to history — chrome.storage.local is readable from any extension page
    const { connections = [] } = await chrome.storage.local.get('connections');
    connections.push({
      profileId,
      name: firstName,
      profileUrl,
      sentAt: new Date().toISOString(),
    });
    await chrome.storage.local.set({ connections: connections.slice(-200) });

    console.log(`[Recruiter Prospector] Connection sent to ${profileId} (${sent}/${SESSION_CAP})`);
    await randomWait(9000, 20000); // longer pause between requests to avoid rate detection
  }

  await chrome.storage.local.set({
    lastProspecting: { sent, runAt: new Date().toISOString() },
  });
  await contentLog(`■ recruiter-prospector done | ${sent} sent / ${results.length} checked`);

  return { sent };
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function getSearchResultCards() {
  // LinkedIn 2024-2026: list items in people search results
  const byLi = Array.from(document.querySelectorAll(
    'li.reusable-search__result-container, ' +
    'li[class*="result-container"]'
  ));
  if (byLi.length) { console.log(`[Recruiter Prospector] Found ${byLi.length} cards via li selector.`); return byLi; }

  // Entity result containers (LinkedIn redesign pattern)
  const byEntity = Array.from(document.querySelectorAll(
    '.entity-result, ' +
    '[data-view-name="search-entity-result-universal-template"]'
  ));
  if (byEntity.length) { console.log(`[Recruiter Prospector] Found ${byEntity.length} cards via entity selector.`); return byEntity; }

  // Broad fallback: any list item containing a /in/ profile link
  const byProfileLink = Array.from(document.querySelectorAll('li')).filter(
    li => li.querySelector('a[href*="/in/"]')
  );
  if (byProfileLink.length) { console.log(`[Recruiter Prospector] Found ${byProfileLink.length} cards via profile-link fallback.`); return byProfileLink; }

  console.warn('[Recruiter Prospector] All selectors failed. LinkedIn DOM may have changed.');
  return [];
}

function extractProfileId(card) {
  const link = card.querySelector('a[href*="/in/"]');
  if (!link) return null;
  const match = link.href.match(/\/in\/([^/?#]+)/);
  return match ? match[1] : null;
}

function extractProfileUrl(card) {
  const link = card.querySelector('a[href*="/in/"]');
  if (!link) return null;
  const href = link.getAttribute('href') || '';
  const clean = href.split('?')[0].split('#')[0];
  return clean.startsWith('http') ? clean : `https://www.linkedin.com${clean}`;
}

function extractName(card) {
  const nameEl = card.querySelector('.entity-result__title-text a span[aria-hidden="true"]');
  return nameEl ? nameEl.textContent.trim().split(' ')[0] : 'there';
}

function getConnectButton(card) {
  const buttons = card.querySelectorAll('button');
  return Array.from(buttons).find(
    (btn) => btn.textContent.trim().toLowerCase() === 'connect'
  ) || null;
}

async function handleConnectionModal(card, profileId) {
  await randomWait(1500, 3000);

  const addNoteButton = document.querySelector('[aria-label="Add a note"]');
  if (addNoteButton) {
    await humanClick(addNoteButton);
    await randomWait(800, 1600);

    const noteInput = document.querySelector('#custom-message');
    if (noteInput) {
      const firstName = extractName(card);
      const personalizedNote = CONNECTION_NOTE.replace('{firstName}', firstName);
      noteInput.value = personalizedNote;
      noteInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
      await randomWait(1000, 2000);
    }
  }

  const sendButton = document.querySelector('[aria-label="Send now"]');
  if (sendButton) {
    await humanClick(sendButton);
    await randomWait(1000, 2500);
    return true;
  }

  // Close modal if send failed
  const dismissButton = document.querySelector('[aria-label="Dismiss"]');
  if (dismissButton) await humanClick(dismissButton);
  return false;
}
 ---------  
 Contexto
https://www.linkedin.com/search/results/people/?keywords=Tech%20Recruiter%20Information%20Technology&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%5D
Rastreamento de pilha
content/recruiter-prospector.js:167 (getSearchResultCards)
content/recruiter-prospector.js:71 (waitForElements)
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77
78
79
80
81
82
83
84
85
86
87
88
89
90
91
92
93
94
95
96
97
98
99
100
101
102
103
104
105
106
107
108
109
110
111
112
113
114
115
116
117
118
119
120
121
122
123
124
125
126
127
128
129
130
131
132
133
134
135
136
137
138
139
140
141
142
143
144
145
146
147
148
149
150
151
152
153
154
155
156
157
158
159
160
161
162
163
164
165
166
167
168
169
170
171
172
173
174
175
176
177
178
179
180
181
182
183
184
185
186
187
188
189
190
191
192
193
194
195
196
197
198
199
200
201
202
203
204
205
206
207
208
209
210
211
212
213
214
215
216
217
218
219
220
221
222
223
224
225
226
227
228
/**
 * recruiter-prospector.js — Content script for linkedin.com/search/results/
 *
 * Automates strategic connection requests to Tech Recruiters in target regions.
 *
 * Rules:
 *   - Daily cap: 20 connection requests per session
 *   - 7-day lock per recruiter profile (enforced via chrome.storage.local)
 *   - Personalised connection note included with every request
 *   - Human-mimicry delays between all actions
 *   - Only sends requests to 1st or 2nd degree connections (excludes 3rd+)
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

/**
 * Daily cap is passed from the Service Worker via the START message.
 * Fallback to 9 (minimum of the 7-day cycle) if not provided.
 */
let SESSION_CAP = 9;

const CONNECTION_NOTE =
  "Hi {firstName}, let's connect! " +
  'Check out my profile & portfolio: ' +
  'https://wesleyzilva.github.io/portfolioNearshoreWesIA/ ' +
  '| https://www.linkedin.com/in/wesleyzilva/ ' +
  '— Wesley, IT Manager Brazil (14+ yrs, remote teams, M&A)';

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START' && message.task === 'recruiter-prospector') {
    // Read the daily cap sent by the service worker
    if (typeof message.dailyCap === 'number') {
      SESSION_CAP = message.dailyCap;
    }
    prospectRecruiters().then((result) => {
      sendResponse({ success: true, ...result });
    }).catch((error) => {
      console.error('[Recruiter Prospector] Error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// ─── Core logic ───────────────────────────────────────────────────────────────

/**
 * Polls a DOM query function until it returns at least one element, or times out.
 * @param {Function} queryFn  - zero-arg function that returns an array
 * @param {number}   maxWait  - total ms to keep trying (default 20 s)
 * @param {number}   interval - ms between attempts (default 2 s)
 */
async function waitForElements(queryFn, maxWait = 20000, interval = 2000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const els = queryFn();
    if (els.length) return els;
    await new Promise(r => setTimeout(r, interval));
  }
  return queryFn(); // final attempt
}

async function prospectRecruiters() {
  await contentLog(`▶ recruiter-prospector started | ${window.location.href}`);
  await randomWait(5000, 9000); // initial wait for SPA render

  const results = await waitForElements(getSearchResultCards);
  if (!results.length) {
    console.warn('[Recruiter Prospector] No search result cards found — selectors may need updating.');
    await contentLog('✗ recruiter-prospector — no search result cards found (waited 20 s)', 'warn');
    await chrome.storage.local.set({ lastProspecting: { sent: 0, runAt: new Date().toISOString() } });
    return { sent: 0 };
  }
  await contentLog(`recruiter-prospector — ${results.length} cards found`);

  let sent = 0;

  for (const card of results) {
    if (sent >= SESSION_CAP) break;

    const profileId = extractProfileId(card);
    if (!profileId) continue;

    const profileUrl = extractProfileUrl(card) || `/in/${profileId}`;
    const locked = await isRecruiterLocked(profileId);
    if (locked) {
      console.log(`[Recruiter Prospector] Skipping ${profileId} — within 7-day lock.`);
      await contentLog(`↷ ${profileUrl} — locked (7-day)`);
      continue;
    }

    const connectButton = getConnectButton(card);
    if (!connectButton) {
      await contentLog(`↷ ${profileUrl} — no connect button`);
      continue;
    }

    // Simulate reading the profile card before deciding to connect
    await readBeforeActing(card, 3000, 7000);
    await humanClick(connectButton);

    // LinkedIn may show a modal asking for a note
    const noteSent = await handleConnectionModal(card, profileId);
    if (!noteSent) continue;

    const firstName = extractName(card);
    await markRecruiterInteracted(profileId, firstName);
    sent++;
    await contentLog(`✓ ${profileUrl} | ${firstName} — connected (${sent}/${SESSION_CAP})`, 'success');

    // Persist to history — chrome.storage.local is readable from any extension page
    const { connections = [] } = await chrome.storage.local.get('connections');
    connections.push({
      profileId,
      name: firstName,
      profileUrl,
      sentAt: new Date().toISOString(),
    });
    await chrome.storage.local.set({ connections: connections.slice(-200) });

    console.log(`[Recruiter Prospector] Connection sent to ${profileId} (${sent}/${SESSION_CAP})`);
    await randomWait(9000, 20000); // longer pause between requests to avoid rate detection
  }

  await chrome.storage.local.set({
    lastProspecting: { sent, runAt: new Date().toISOString() },
  });
  await contentLog(`■ recruiter-prospector done | ${sent} sent / ${results.length} checked`);

  return { sent };
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function getSearchResultCards() {
  // LinkedIn 2024-2026: list items in people search results
  const byLi = Array.from(document.querySelectorAll(
    'li.reusable-search__result-container, ' +
    'li[class*="result-container"]'
  ));
  if (byLi.length) { console.log(`[Recruiter Prospector] Found ${byLi.length} cards via li selector.`); return byLi; }

  // Entity result containers (LinkedIn redesign pattern)
  const byEntity = Array.from(document.querySelectorAll(
    '.entity-result, ' +
    '[data-view-name="search-entity-result-universal-template"]'
  ));
  if (byEntity.length) { console.log(`[Recruiter Prospector] Found ${byEntity.length} cards via entity selector.`); return byEntity; }

  // Broad fallback: any list item containing a /in/ profile link
  const byProfileLink = Array.from(document.querySelectorAll('li')).filter(
    li => li.querySelector('a[href*="/in/"]')
  );
  if (byProfileLink.length) { console.log(`[Recruiter Prospector] Found ${byProfileLink.length} cards via profile-link fallback.`); return byProfileLink; }

  console.warn('[Recruiter Prospector] All selectors failed. LinkedIn DOM may have changed.');
  return [];
}

function extractProfileId(card) {
  const link = card.querySelector('a[href*="/in/"]');
  if (!link) return null;
  const match = link.href.match(/\/in\/([^/?#]+)/);
  return match ? match[1] : null;
}

function extractProfileUrl(card) {
  const link = card.querySelector('a[href*="/in/"]');
  if (!link) return null;
  const href = link.getAttribute('href') || '';
  const clean = href.split('?')[0].split('#')[0];
  return clean.startsWith('http') ? clean : `https://www.linkedin.com${clean}`;
}

function extractName(card) {
  const nameEl = card.querySelector('.entity-result__title-text a span[aria-hidden="true"]');
  return nameEl ? nameEl.textContent.trim().split(' ')[0] : 'there';
}

function getConnectButton(card) {
  const buttons = card.querySelectorAll('button');
  return Array.from(buttons).find(
    (btn) => btn.textContent.trim().toLowerCase() === 'connect'
  ) || null;
}

async function handleConnectionModal(card, profileId) {
  await randomWait(1500, 3000);

  const addNoteButton = document.querySelector('[aria-label="Add a note"]');
  if (addNoteButton) {
    await humanClick(addNoteButton);
    await randomWait(800, 1600);

    const noteInput = document.querySelector('#custom-message');
    if (noteInput) {
      const firstName = extractName(card);
      const personalizedNote = CONNECTION_NOTE.replace('{firstName}', firstName);
      noteInput.value = personalizedNote;
      noteInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
      await randomWait(1000, 2000);
    }
  }

  const sendButton = document.querySelector('[aria-label="Send now"]');
  if (sendButton) {
    await humanClick(sendButton);
    await randomWait(1000, 2500);
    return true;
  }

  // Close modal if send failed
  const dismissButton = document.querySelector('[aria-label="Dismiss"]');
  if (dismissButton) await humanClick(dismissButton);
  return false;
}
 -------------------------
 Contexto
https://www.linkedin.com/search/results/people/?keywords=Tech%20Recruiter%20Information%20Technology&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%5D
Rastreamento de pilha
content/recruiter-prospector.js:167 (getSearchResultCards)
content/recruiter-prospector.js:67 (waitForElements)
content/recruiter-prospector.js:78 (prospectRecruiters)
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77
78
79
80
81
82
83
84
85
86
87
88
89
90
91
92
93
94
95
96
97
98
99
100
101
102
103
104
105
106
107
108
109
110
111
112
113
114
115
116
117
118
119
120
121
122
123
124
125
126
127
128
129
130
131
132
133
134
135
136
137
138
139
140
141
142
143
144
145
146
147
148
149
150
151
152
153
154
155
156
157
158
159
160
161
162
163
164
165
166
167
168
169
170
171
172
173
174
175
176
177
178
179
180
181
182
183
184
185
186
187
188
189
190
191
192
193
194
195
196
197
198
199
200
201
202
203
204
205
206
207
208
209
210
211
212
213
214
215
216
217
218
219
220
221
222
223
224
225
226
227
228
/**
 * recruiter-prospector.js — Content script for linkedin.com/search/results/
 *
 * Automates strategic connection requests to Tech Recruiters in target regions.
 *
 * Rules:
 *   - Daily cap: 20 connection requests per session
 *   - 7-day lock per recruiter profile (enforced via chrome.storage.local)
 *   - Personalised connection note included with every request
 *   - Human-mimicry delays between all actions
 *   - Only sends requests to 1st or 2nd degree connections (excludes 3rd+)
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

/**
 * Daily cap is passed from the Service Worker via the START message.
 * Fallback to 9 (minimum of the 7-day cycle) if not provided.
 */
let SESSION_CAP = 9;

const CONNECTION_NOTE =
  "Hi {firstName}, let's connect! " +
  'Check out my profile & portfolio: ' +
  'https://wesleyzilva.github.io/portfolioNearshoreWesIA/ ' +
  '| https://www.linkedin.com/in/wesleyzilva/ ' +
  '— Wesley, IT Manager Brazil (14+ yrs, remote teams, M&A)';

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START' && message.task === 'recruiter-prospector') {
    // Read the daily cap sent by the service worker
    if (typeof message.dailyCap === 'number') {
      SESSION_CAP = message.dailyCap;
    }
    prospectRecruiters().then((result) => {
      sendResponse({ success: true, ...result });
    }).catch((error) => {
      console.error('[Recruiter Prospector] Error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// ─── Core logic ───────────────────────────────────────────────────────────────

/**
 * Polls a DOM query function until it returns at least one element, or times out.
 * @param {Function} queryFn  - zero-arg function that returns an array
 * @param {number}   maxWait  - total ms to keep trying (default 20 s)
 * @param {number}   interval - ms between attempts (default 2 s)
 */
async function waitForElements(queryFn, maxWait = 20000, interval = 2000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const els = queryFn();
    if (els.length) return els;
    await new Promise(r => setTimeout(r, interval));
  }
  return queryFn(); // final attempt
}

async function prospectRecruiters() {
  await contentLog(`▶ recruiter-prospector started | ${window.location.href}`);
  await randomWait(5000, 9000); // initial wait for SPA render

  const results = await waitForElements(getSearchResultCards);
  if (!results.length) {
    console.warn('[Recruiter Prospector] No search result cards found — selectors may need updating.');
    await contentLog('✗ recruiter-prospector — no search result cards found (waited 20 s)', 'warn');
    await chrome.storage.local.set({ lastProspecting: { sent: 0, runAt: new Date().toISOString() } });
    return { sent: 0 };
  }
  await contentLog(`recruiter-prospector — ${results.length} cards found`);

  let sent = 0;

  for (const card of results) {
    if (sent >= SESSION_CAP) break;

    const profileId = extractProfileId(card);
    if (!profileId) continue;

    const profileUrl = extractProfileUrl(card) || `/in/${profileId}`;
    const locked = await isRecruiterLocked(profileId);
    if (locked) {
      console.log(`[Recruiter Prospector] Skipping ${profileId} — within 7-day lock.`);
      await contentLog(`↷ ${profileUrl} — locked (7-day)`);
      continue;
    }

    const connectButton = getConnectButton(card);
    if (!connectButton) {
      await contentLog(`↷ ${profileUrl} — no connect button`);
      continue;
    }

    // Simulate reading the profile card before deciding to connect
    await readBeforeActing(card, 3000, 7000);
    await humanClick(connectButton);

    // LinkedIn may show a modal asking for a note
    const noteSent = await handleConnectionModal(card, profileId);
    if (!noteSent) continue;

    const firstName = extractName(card);
    await markRecruiterInteracted(profileId, firstName);
    sent++;
    await contentLog(`✓ ${profileUrl} | ${firstName} — connected (${sent}/${SESSION_CAP})`, 'success');

    // Persist to history — chrome.storage.local is readable from any extension page
    const { connections = [] } = await chrome.storage.local.get('connections');
    connections.push({
      profileId,
      name: firstName,
      profileUrl,
      sentAt: new Date().toISOString(),
    });
    await chrome.storage.local.set({ connections: connections.slice(-200) });

    console.log(`[Recruiter Prospector] Connection sent to ${profileId} (${sent}/${SESSION_CAP})`);
    await randomWait(9000, 20000); // longer pause between requests to avoid rate detection
  }

  await chrome.storage.local.set({
    lastProspecting: { sent, runAt: new Date().toISOString() },
  });
  await contentLog(`■ recruiter-prospector done | ${sent} sent / ${results.length} checked`);

  return { sent };
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function getSearchResultCards() {
  // LinkedIn 2024-2026: list items in people search results
  const byLi = Array.from(document.querySelectorAll(
    'li.reusable-search__result-container, ' +
    'li[class*="result-container"]'
  ));
  if (byLi.length) { console.log(`[Recruiter Prospector] Found ${byLi.length} cards via li selector.`); return byLi; }

  // Entity result containers (LinkedIn redesign pattern)
  const byEntity = Array.from(document.querySelectorAll(
    '.entity-result, ' +
    '[data-view-name="search-entity-result-universal-template"]'
  ));
  if (byEntity.length) { console.log(`[Recruiter Prospector] Found ${byEntity.length} cards via entity selector.`); return byEntity; }

  // Broad fallback: any list item containing a /in/ profile link
  const byProfileLink = Array.from(document.querySelectorAll('li')).filter(
    li => li.querySelector('a[href*="/in/"]')
  );
  if (byProfileLink.length) { console.log(`[Recruiter Prospector] Found ${byProfileLink.length} cards via profile-link fallback.`); return byProfileLink; }

  console.warn('[Recruiter Prospector] All selectors failed. LinkedIn DOM may have changed.');
  return [];
}

function extractProfileId(card) {
  const link = card.querySelector('a[href*="/in/"]');
  if (!link) return null;
  const match = link.href.match(/\/in\/([^/?#]+)/);
  return match ? match[1] : null;
}

function extractProfileUrl(card) {
  const link = card.querySelector('a[href*="/in/"]');
  if (!link) return null;
  const href = link.getAttribute('href') || '';
  const clean = href.split('?')[0].split('#')[0];
  return clean.startsWith('http') ? clean : `https://www.linkedin.com${clean}`;
}

function extractName(card) {
  const nameEl = card.querySelector('.entity-result__title-text a span[aria-hidden="true"]');
  return nameEl ? nameEl.textContent.trim().split(' ')[0] : 'there';
}

function getConnectButton(card) {
  const buttons = card.querySelectorAll('button');
  return Array.from(buttons).find(
    (btn) => btn.textContent.trim().toLowerCase() === 'connect'
  ) || null;
}

async function handleConnectionModal(card, profileId) {
  await randomWait(1500, 3000);

  const addNoteButton = document.querySelector('[aria-label="Add a note"]');
  if (addNoteButton) {
    await humanClick(addNoteButton);
    await randomWait(800, 1600);

    const noteInput = document.querySelector('#custom-message');
    if (noteInput) {
      const firstName = extractName(card);
      const personalizedNote = CONNECTION_NOTE.replace('{firstName}', firstName);
      noteInput.value = personalizedNote;
      noteInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
      await randomWait(1000, 2000);
    }
  }

  const sendButton = document.querySelector('[aria-label="Send now"]');
  if (sendButton) {
    await humanClick(sendButton);
    await randomWait(1000, 2500);
    return true;
  }

  // Close modal if send failed
  const dismissButton = document.querySelector('[aria-label="Dismiss"]');
  if (dismissButton) await humanClick(dismissButton);
  return false;
}
 