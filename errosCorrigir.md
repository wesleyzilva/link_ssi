Erros
[Recruiter Prospector] [Diag] no connect btn found | card buttons: "Follow" aria="Follow Simha kiraankumar"
Contexto
https://www.linkedin.com/search/results/people/?keywords=Tech%20Recruiter%20Information%20Technology&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%2C%22102713980%22%2C%22101739942%22%2C%22104738515%22%2C%22102890883%22%2C%22102454443%22%2C%22105015875%22%2C%22106157047%22%5D&spellCorrectionEnabled=true&prioritizeMessage=false
Rastreamento de pilha
content/recruiter-prospector.js:19 (contentLog)
content/recruiter-prospector.js:227 (prospectRecruiters)
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
281
282
283
284
285
286
287
288
289
290
291
292
293
294
295
296
297
298
299
300
301
302
303
304
305
306
307
308
309
310
311
312
313
314
315
316
317
318
319
320
321
322
323
324
325
326
327
328
329
330
331
332
333
334
335
336
337
338
339
340
341
342
343
344
345
346
347
348
349
350
351
352
353
354
355
356
357
358
359
360
361
362
363
364
365
366
367
368
369
370
371
372
373
374
375
376
377
378
379
380
381
382
383
384
385
386
387
388
389
390
391
392
393
394
395
396
397
398
399
400
401
402
403
404
405
406
407
408
409
410
411
412
413
414
415
416
417
418
419
420
421
422
423
424
425
426
427
428
429
430
431
432
433
434
435
436
437
438
439
440
441
442
443
444
445
446
447
448
449
450
451
452
453
454
455
456
457
458
459
460
461
462
463
464
465
466
467
468
469
470
471
472
473
474
475
476
477
478
479
480
481
482
483
484
485
486
487
488
489
490
491
492
493
494
495
496
497
498
499
500
501
502
503
504
505
506
507
508
509
510
511
512
513
514
515
516
517
518
519
520
521
522
523
524
525
526
527
528
529
530
531
532
533
534
535
536
537
538
539
540
541
542
543
544
545
546
547
548
549
550
551
552
553
554
555
556
557
558
559
560
561
562
563
564
565
566
567
568
569
570
571
572
573
574
575
576
577
578
579
580
581
582
583
584
585
586
587
588
589
590
591
592
593
594
595
596
597
598
599
600
601
602
603
604
605
606
607
608
609
610
611
612
613
614
615
616
617
618
619
620
621
622
623
624
625
626
627
628
629
630
631
632
633
634
635
636
637
638
639
640
641
642
643
644
645
646
647
648
649
650
651
652
653
654
655
656
657
658
659
660
661
662
663
664
665
666
667
668
669
670
671
672
673
674
675
676
677
678
679
680
681
682
683
684
685
686
687
688
689
690
691
692
693
694
695
696
697
698
699
700
701
702
703
704
705
706
707
708
709
710
711
712
713
714
715
716
717
718
719
720
721
722
723
724
725
726
727
728
729
730
731
732
733
734
735
736
737
738
739
740
741
742
743
744
745
746
747
748
749
750
751
752
753
754
755
756
757
758
759
760
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
  const entry = { ts: new Date().toISOString(), level, script: 'recruiter-prospector', msg };
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[Recruiter Prospector]', msg);
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push(entry);
    await chrome.storage.local.set({ activityLog: activityLog.slice(-300) });
  } catch (e) { console.warn('[contentLog]', e); }
}

/**
 * Daily cap is passed from the Service Worker via the START message.
 * Fallback to 9 (minimum of the 7-day cycle) if not provided.
 */
let SESSION_CAP = 9;
let VIEW_ONLY_MODE = false; // true when dailyCap=0 — browse profiles for SSI "Localizar as pessoas certas", no connections sent

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
      VIEW_ONLY_MODE = SESSION_CAP === 0;
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

/**
 * Navigates to the next LinkedIn search results page by clicking the native
 * pagination "Next" button. Returns true if navigation succeeded.
 * LinkedIn is a SPA — the URL changes via pushState and the content script
 * stays alive across pagination.
 */
async function goToNextPage() {
  const nextBtn =
    document.querySelector('button[aria-label="Next"]') ||
    document.querySelector('button[aria-label="Próximo"]') ||
    document.querySelector('button[aria-label="Siguiente"]') ||
    document.querySelector('.artdeco-pagination__button--next:not([disabled])') ||
    Array.from(document.querySelectorAll('button')).find(b => {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      const text  = b.textContent.trim().toLowerCase();
      return (label === 'next' || label === 'próximo' || text === 'next' || text === 'próximo') &&
             !b.disabled;
    });

  if (!nextBtn || nextBtn.disabled) return false;

  const prevUrl = window.location.href;
  nextBtn.click();

  // Wait up to 15s for the SPA to update the URL
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (window.location.href !== prevUrl) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function prospectRecruiters() {
  await contentLog(`▶ recruiter-prospector started | ${window.location.href}`);
  await randomWait(5000, 9000); // initial wait for SPA render

  let sent = 0;
  let totalChecked = 0;
  const MAX_PAGES = 10;

  for (let page = 1; page <= MAX_PAGES; page++) {
    if (!VIEW_ONLY_MODE && sent >= SESSION_CAP) break;

    // From page 2 onward: navigate via the Next button
    if (page > 1) {
      await randomWait(3000, 6000); // human-like pause between pages
      const navigated = await goToNextPage();
      if (!navigated) {
        await contentLog(`■ no more pages after page ${page - 1} — stopping pagination`);
        break;
      }
      await contentLog(`▶ page ${page} — waiting for SPA render...`);
      await randomWait(4000, 7000); // wait for LinkedIn SPA to paint new results
    }

    const cards = await waitForElements(getSearchResultCards);
    if (!cards.length) {
      if (page === 1) {
        console.warn('[Recruiter Prospector] No search result cards found — selectors may need updating.');
        await contentLog('✗ recruiter-prospector — no search result cards found (waited 20 s)', 'warn');
        await chrome.storage.local.set({ lastProspecting: { sent: 0, runAt: new Date().toISOString() } });
        return { sent: 0 };
      }
      await contentLog(`✗ page ${page} — no cards found — stopping pagination`, 'warn');
      break;
    }

    await contentLog(`page ${page}/${MAX_PAGES} — ${cards.length} cards found`);
    totalChecked += cards.length;

    for (const card of cards) {
      if (!VIEW_ONLY_MODE && sent >= SESSION_CAP) break;

      const profileId = extractProfileId(card);
      if (!profileId) continue;

      const profileUrl = extractProfileUrl(card) || `/in/${profileId}`;

      // Skip profiles with a locale suffix in the URL — e.g. /en/, /pt/, /es/
      // These are typically Brazilians who set their LinkedIn UI to English.
      // We want genuinely global profiles, not localised ones.
      if (/\/in\/[^/]+\/[a-z]{2}(-[a-zA-Z]{2,4})?\/?($|\?)/.test(profileUrl)) {
        await contentLog(`↷ ${profileUrl} — skipped (locale-suffixed URL, likely BR)`);
        continue;
      }

      // VIEW_ONLY_MODE: scroll each card — signals "Find Right People" to LinkedIn SSI
      if (VIEW_ONLY_MODE) {
        await scrollIntoViewAndPause(card);
        await randomWait(2000, 4500);
        await logProfileLink(profileUrl, profileId, '');
        await contentLog(`👁 ${profileUrl} — viewed (SSI: localizar as pessoas certas)`);
        continue;
      }

      // Log every profile we encounter (for later human review)
      const firstName = extractName(card);
      await logProfileLink(profileUrl, profileId, firstName);

      const locked = await isRecruiterLocked(profileId);
      if (locked) {
        // Scroll into view even when locked — SSI counts profile impressions from search
        await scrollIntoViewAndPause(card);
        await randomWait(1500, 3000);
        console.log(`[Recruiter Prospector] Skipping ${profileId} — within 7-day lock.`);
        await contentLog(`↷ ${profileUrl} — locked (7-day, viewed)`);
        continue;
      }

      // LinkedIn 2026 lazy-renders action buttons only after the card scrolls into view
      // and receives a hover event. Dispatch both pointer and mouse events (LinkedIn uses both).
      await scrollIntoViewAndPause(card);
      await readBeforeActing(card, 2000, 5000);
      card.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
      card.dispatchEvent(new MouseEvent('mouseenter',    { bubbles: true }));
      card.dispatchEvent(new PointerEvent('pointermove',  { bubbles: true, cancelable: true }));
      card.dispatchEvent(new MouseEvent('mouseover',      { bubbles: true, cancelable: true }));
      await waitForButtonsInCard(card, 6000);

      // Try direct Connect button inside the card first
      let connectButton = getConnectButton(card);
      let viaMoreMenu = false;

      if (!connectButton) {
        // Connect may be hidden inside the "More actions" overflow menu inside card
        connectButton = await getConnectButtonViaMore(card);
        if (connectButton) viaMoreMenu = true;
      }

      // LinkedIn 2026: action buttons are rendered in a floating overlay OUTSIDE the card's
      // DOM subtree. After hover, scan the full document for a Connect button whose
      // aria-label contains the profile ID or whose nearest ancestor link matches the URL.
      if (!connectButton) {
        connectButton = getConnectButtonDocument(profileId, profileUrl);
      }

      // Last resort: open More actions at document level and search the dropdown
      if (!connectButton) {
        connectButton = await getConnectButtonViaMoreDocument(profileId, profileUrl);
        if (connectButton) viaMoreMenu = true;
      }

      if (!connectButton) {
        await randomWait(1000, 2500);
        // Diagnostic: log all button texts/aria-labels in this card so we can tune selectors
        const btns = Array.from(card.querySelectorAll('button'))
          .map(b => `"${b.textContent.trim().slice(0,30)}" aria="${(b.getAttribute('aria-label')||'').slice(0,50)}"`)
          .join(' | ');
        await contentLog(`[Diag] no connect btn found | card buttons: ${btns || 'none'}`, 'warn');
        await contentLog(`↷ ${profileUrl} — no connect button (viewed)`);
        continue;
      }

      await humanClick(connectButton);

      // Send connection WITHOUT a note — avoids modal friction and feels more organic
      const connected = await handleConnectionModalNoNote();
      if (!connected) {
        await contentLog(`⚠ connection modal handled but send failed | ${profileUrl}`, 'warn');
        continue;
      }

      await markRecruiterInteracted(profileId, firstName);
      sent++;
      await contentLog(`✓ ${profileUrl} | ${firstName} — connected (${sent}/${SESSION_CAP}) [p${page}]`, 'success');

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
  }

  await chrome.storage.local.set({
    lastProspecting: { sent, runAt: new Date().toISOString() },
  });
  await contentLog(`■ recruiter-prospector DONE | ${sent} sent / ${totalChecked} checked`, 'success');

  return { sent };
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

/**
 * Polls up to maxWait ms for the action button set to fully render inside a card.
 * LinkedIn 2026 lazy-renders buttons after scroll/hover: first "Follow" appears, then
 * "Connect" / "More (…)" appear a beat later. We wait for ≥2 buttons so the overflow
 * menu button is present before we try to open it. Falls back after maxWait.
 */
async function waitForButtonsInCard(card, maxWait = 6000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const btns = Array.from(card.querySelectorAll('button'));
    if (btns.length >= 2) return; // Follow + More/Connect both rendered
    if (btns.some(b => {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      const text  = b.textContent.trim().toLowerCase();
      return /^connect/i.test(label) || /^connect/i.test(text) ||
             /^convidar/i.test(label) || /^conectar/i.test(label);
    })) return; // Connect button appeared directly — no need to wait for More
    await new Promise(r => setTimeout(r, 300));
  }
}

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

  // Strategy 4 (LinkedIn 2025): div-based result containers (LinkedIn migrated away from li in some views)
  const byDivResult = Array.from(document.querySelectorAll(
    'div.search-result, div[class*="search-result"], ' +
    'div.reusable-search__result-container'
  )).filter(el => el.querySelector('a[href*="/in/"]'));
  if (byDivResult.length) { console.log(`[Recruiter Prospector] Found ${byDivResult.length} cards via div-result fallback.`); return byDivResult; }

  // Strategy 5 (LinkedIn 2026): data-attribute based containers used in Chameleon/Voyager redesign
  const byDataAttr = Array.from(document.querySelectorAll(
    '[data-chameleon-result-urn], [data-entity-urn*="fs_miniProfile"], ' +
    '[data-member-id], [data-view-name*="entity-result"]'
  )).filter(el => el.querySelector('a[href*="/in/"]'));
  if (byDataAttr.length) { console.log(`[Recruiter Prospector] Found ${byDataAttr.length} cards via data-attr strategy.`); return byDataAttr; }

  // Strategy 6: walk UP from each profile link to find the closest card-like container
  // (avoids the old "outermost ancestor per profile" bug that returned page-wide containers
  //  containing nav, pagination and ad buttons alongside card buttons)
  const allProfileLinks = Array.from(document.querySelectorAll('a[href*="/in/"]'));
  const seenUrls = new Set();
  const closestContainers = [];
  for (const link of allProfileLinks) {
    const key = link.href.split('?')[0];
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    // Walk up: take the closest <li>, or the closest bounded <div> that is card-sized
    let el = link.parentElement;
    let best = null;
    while (el && el.tagName !== 'BODY') {
      if (el.tagName === 'LI') { best = el; break; }
      if (el.tagName === 'DIV') {
        const rect = el.getBoundingClientRect();
        // Card heuristic: taller than a line but shorter than two viewport heights,
        // and wide enough to be a result item (not a narrow sidebar widget)
        if (rect.height > 60 && rect.height < 500 && rect.width > 300) {
          best = el;
          break;
        }
      }
      el = el.parentElement;
    }
    if (best) closestContainers.push(best);
  }
  if (closestContainers.length) { console.log(`[Recruiter Prospector] Found ${closestContainers.length} cards via closest-container strategy.`); return closestContainers; }

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
  return Array.from(card.querySelectorAll('button')).find(b => {
    const text  = b.textContent.trim().toLowerCase();
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    return text === 'connect' ||
           text === 'conectar' ||
           text === 'conectar-se' ||
           text.startsWith('connect') ||
           text.startsWith('conectar') ||
           /^connect/i.test(label) ||
           /^conectar/i.test(label) ||
           /^convidar/i.test(label) ||
           (/convidar/i.test(label) && /conectar/i.test(label)) ||
           /^invite .+ to connect/i.test(label) ||
           /^convidar .+ para se? conectar/i.test(label);
  }) || null;
}

async function getConnectButtonViaMore(card) {
  // Look for the More button first inside the card, then at document level
  // (LinkedIn 2026 may render action overlays outside the li container)
  const MORE_SELS = [
    'button[aria-label*="More actions"]',
    'button[aria-label*="More options"]',
    'button[aria-label*="Mais ações"]',
    'button[aria-label*="Mais opções"]',
    'button[aria-label*="Mais ação"]',
    // Catch-all patterns for LinkedIn 2026 Chameleon design
    'button.artdeco-dropdown__trigger',
    'button[data-control-name*="overflow"]',
    'button[data-control-name*="more"]',
  ];
  const textMatch = (b) => {
    const t = (b.getAttribute('aria-label') || b.textContent || '').trim().toLowerCase();
    // Use startsWith so "More options for John" also matches
    return t.startsWith('more') || t === '…' || t === '...' ||
           t.startsWith('mais') || t.includes('overflow actions');
  };

  let moreBtn =
    MORE_SELS.reduce((f, s) => f || card.querySelector(s), null) ||
    Array.from(card.querySelectorAll('button')).find(textMatch);

  // Fallback: the More button may live outside the card's DOM subtree in a floating overlay.
  // Use geometric proximity instead of document.querySelector (which returns the wrong card's button).
  if (!moreBtn) {
    const cardRect = card.getBoundingClientRect();
    const candidates = [
      ...MORE_SELS.flatMap(s => Array.from(document.querySelectorAll(s))),
      ...Array.from(document.querySelectorAll('button')).filter(textMatch),
    ];
    moreBtn = candidates.find(b => {
      if (b.disabled) return false;
      const rect = b.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      // Accept the button if it sits within the card's vertical band (±60 px slack)
      return rect.top >= cardRect.top - 60 && rect.bottom <= cardRect.bottom + 60;
    });
  }

  if (!moreBtn) return null;

  await humanClick(moreBtn);
  await randomWait(600, 1400);

  // Poll up to 3s for the dropdown Connect item to appear
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const item =
      document.querySelector('.artdeco-dropdown__content li button[aria-label*="Connect"]') ||
      document.querySelector('.artdeco-dropdown__content li button[aria-label*="Invite"]') ||
      document.querySelector('.artdeco-dropdown__content li button[aria-label*="Conectar"]') ||
      document.querySelector('.artdeco-dropdown__content li button[aria-label*="Convidar"]') ||
      Array.from(document.querySelectorAll(
        '.artdeco-dropdown__content li, .artdeco-dropdown li'
      )).reduce((found, li) => {
        if (found) return found;
        const btn = li.querySelector('button') || li;
        const label = (btn.getAttribute('aria-label') || btn.textContent || '').trim().toLowerCase();
        return (
          label === 'connect'   || label.startsWith('connect ')   || /^invite .+ to connect/i.test(label)  ||
          label === 'conectar'  || label.startsWith('conectar ')  || /^convidar .+ para se? conectar/i.test(label) ||
          label === 'convidar'
        ) ? btn : null;
      }, null);
    if (item) return item;
    await new Promise(r => setTimeout(r, 300));
  }

  // Connect not in dropdown — close it and report
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return null;
}

/**
 * LinkedIn 2026: action buttons are rendered in a floating overlay OUTSIDE the card's DOM
 * subtree. After scrolling a card into view and dispatching hover, the "Connect" button
 * appears somewhere on the page (not inside the card). We search document-wide but verify
 * the button is contextually tied to this profile via its aria-label (contains profileId or
 * profile URL slug) or because it is the only visible Connect button on the page at that moment.
 *
 * @param {string} profileId  - URL slug of the profile, e.g. "john-smith-123"
 * @param {string} profileUrl - full /in/ URL of the profile
 * @returns {HTMLElement|null}
 */
function getConnectButtonDocument(profileId, profileUrl) {
  const slug = profileId ? profileId.toLowerCase() : '';
  const CONNECT_RE = /^(connect|conectar|conectar-se|convidar)\b/i;
  const INVITE_RE  = /^(invite .+ to connect|convidar .+ para se? conectar)/i;

  const allBtns = Array.from(document.querySelectorAll('button'));

  // First pass: prefer buttons whose aria-label explicitly names this profile
  const byLabel = allBtns.find(b => {
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    if (!CONNECT_RE.test(label) && !INVITE_RE.test(label)) return false;
    return slug && label.includes(slug.toLowerCase());
  });
  if (byLabel) return byLabel;

  // Second pass: any visible, enabled Connect button on the page
  // (safe when only one card is active / hovered at a time)
  const visible = allBtns.filter(b => {
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    const text  = b.textContent.trim().toLowerCase();
    const isConnect = CONNECT_RE.test(label) || CONNECT_RE.test(text) || INVITE_RE.test(label);
    if (!isConnect) return false;
    if (b.disabled) return false;
    const rect = b.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  // Return only if exactly one Connect button is visible (avoids ambiguity)
  if (visible.length === 1) return visible[0];

  return null;
}

/**
 * LinkedIn 2026 document-level More-menu fallback.
 * Clicks the first visible More/overflow button that is NOT inside a nav/header,
 * then waits for a dropdown Connect item. Verifies the dropdown appeared for THIS
 * profile by checking the aria-label contains the profile slug.
 */
async function getConnectButtonViaMoreDocument(profileId, profileUrl) {
  const slug = profileId ? profileId.toLowerCase() : '';

  const MORE_SELS = [
    'button[aria-label*="More actions"]',
    'button[aria-label*="More options"]',
    'button[aria-label*="Mais ações"]',
    'button[aria-label*="Mais opções"]',
  ];
  const textMatch = (b) => {
    const t = (b.getAttribute('aria-label') || b.textContent || '').trim().toLowerCase();
    return t === 'more' || t === 'more actions' || t === 'more options' ||
           t === 'mais' || t === 'mais ações'   || t === 'mais opções'  || t === '…';
  };

  // Find More button that is NOT in the main nav
  const moreBtns = [
    ...MORE_SELS.flatMap(s => Array.from(document.querySelectorAll(s))),
    ...Array.from(document.querySelectorAll('button')).filter(textMatch),
  ].filter(b => {
    if (b.disabled) return false;
    const rect = b.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    // Exclude navbar buttons (top of page)
    if (rect.top < 80) return false;
    return true;
  });

  if (!moreBtns.length) return null;

  // Click the first candidate (should be the one for the hovered card)
  await humanClick(moreBtns[0]);
  await randomWait(600, 1400);

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const dropItems = Array.from(document.querySelectorAll(
      '.artdeco-dropdown__content li, .artdeco-dropdown li'
    ));
    const connectItem = dropItems.find(li => {
      const btn = li.querySelector('button') || li;
      const label = (btn.getAttribute('aria-label') || btn.textContent || '').trim().toLowerCase();
      return /^(connect|invite .+ to connect|conectar|convidar)/i.test(label);
    });
    if (connectItem) {
      const btn = connectItem.querySelector('button') || connectItem;
      // Validate: the aria-label should reference this profile if slug available
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (!slug || label.includes(slug)) return btn;
      // Mismatch — close and skip
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return null;
    }
    await new Promise(r => setTimeout(r, 300));
  }

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return null;
}

async function handleConnectionModal(card, profileId) {
  // Poll for the invite modal to appear (up to 5 s)
  const modal = await new Promise(resolve => {
    const deadline = Date.now() + 5000;
    const tick = setInterval(() => {
      const m =
        document.querySelector('div[data-test-modal-id="send-invite-modal"]') ||
        document.querySelector('.send-invite') ||
        document.querySelector('[data-test-modal]') ||
        document.querySelector('.artdeco-modal[role="dialog"]');
      if (m || Date.now() >= deadline) { clearInterval(tick); resolve(m || null); }
    }, 300);
  });

  if (!modal) {
    // No modal — LinkedIn sent the request directly (no note required)
    return true;
  }

  // Try to click the "Add a note" button inside the modal
  const addNoteBtn =
    modal.querySelector('[aria-label="Add a note"]') ||
    modal.querySelector('button[data-control-name="add-note"]') ||
    Array.from(modal.querySelectorAll('button')).find(
      b => /add\s*a?\s*note/i.test(b.textContent)
    );

  if (addNoteBtn) {
    await humanClick(addNoteBtn);
    await randomWait(800, 1600);

    const noteInput =
      document.querySelector('#custom-message') ||
      document.querySelector('#connect-cta-form__message') ||
      document.querySelector('textarea[name="message"]') ||
      document.querySelector('.connect-button-send-invite__custom-message') ||
      document.querySelector('.artdeco-modal textarea');

    if (noteInput) {
      const firstName = extractName(card);
      const personalizedNote = CONNECTION_NOTE.replace('{firstName}', firstName);
      noteInput.focus();
      // Use execCommand so the character counter and submit-enable logic fires
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, personalizedNote);
      noteInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
      await randomWait(1000, 2000);
    }
  }

  // Find the send / submit button
  const sendButton =
    document.querySelector('[aria-label="Send now"]') ||
    document.querySelector('[aria-label="Send invitation"]') ||
    document.querySelector('button[data-control-name="send-invite-cta-btn"]') ||
    Array.from(document.querySelectorAll('.artdeco-modal button')).find(
      b => !b.disabled && /send/i.test(b.textContent.trim())
    );

  if (sendButton) {
    await humanClick(sendButton);
    await randomWait(1000, 2500);
    return true;
  }

  // Last resort: "Send without a note" so the connection is still attempted
  const sendWithoutNote =
    document.querySelector('[aria-label="Send without a note"]') ||
    Array.from(document.querySelectorAll('button')).find(
      b => /send without/i.test(b.textContent)
    );
  if (sendWithoutNote) {
    await humanClick(sendWithoutNote);
    await randomWait(1000, 2000);
    return true;
  }

  // Could not send — close the modal and skip
  const dismissButton =
    document.querySelector('[aria-label="Dismiss"]') ||
    document.querySelector('.artdeco-modal__dismiss') ||
    document.querySelector('button[data-control-name="overlay.close"]');
  if (dismissButton) await humanClick(dismissButton);
  return false;
}

// ─── No-note connection handler ───────────────────────────────────────────────
/**
 * Handles the post-click connection modal by always sending WITHOUT a note.
 * This avoids the message-compose step and feels less bot-like in terms of
 * volume (LinkedIn flags accounts that always send identical notes).
 * Logs everything for debugging.
 */
async function handleConnectionModalNoNote() {
  // Wait up to 6s for any modal to appear — LinkedIn 2026 modal is slower to paint
  const modal = await new Promise(resolve => {
    const deadline = Date.now() + 6000;
    const tick = setInterval(() => {
      const m =
        // LinkedIn 2026: "Add a note to your invitation?" dialog
        document.querySelector('[data-test-modal-id="send-invite-modal"]') ||
        document.querySelector('[data-test-modal-id="send-connections-modal"]') ||
        document.querySelector('div[aria-label*="Add a note"]') ||
        document.querySelector('div[aria-label*="invitation"]') ||
        // Classic selectors
        document.querySelector('.send-invite') ||
        document.querySelector('[data-test-modal]') ||
        document.querySelector('.artdeco-modal[role="dialog"]') ||
        document.querySelector('div[role="dialog"]');
      if (m || Date.now() >= deadline) { clearInterval(tick); resolve(m || null); }
    }, 300);
  });

  if (!modal) {
    // LinkedIn sent directly — no modal (already connected or 1st degree)
    await contentLog('📤 connection sent directly — no modal appeared');
    return true;
  }

  await contentLog('📋 connection modal appeared — looking for send-without-note button');

  // Priority: "Send without a note" — LinkedIn 2026 uses both aria-label and data-control-name
  const sendWithoutNote =
    modal.querySelector('[aria-label="Send without a note"]') ||
    modal.querySelector('[data-control-name="connect.send_without_note"]') ||
    modal.querySelector('button[data-control-name*="without"]') ||
    Array.from(modal.querySelectorAll('button')).find(
      b => /send without/i.test(b.textContent) ||
           /sem nota/i.test(b.textContent) ||
           /without a note/i.test(b.getAttribute('aria-label') || '')
    );

  if (sendWithoutNote) {
    await humanClick(sendWithoutNote);
    await randomWait(1000, 2500);
    await contentLog('✓ sent without note');
    return true;
  }

  // Fallback: generic send/submit button
  const sendBtn =
    modal.querySelector('[aria-label="Send now"]') ||
    modal.querySelector('[aria-label="Send invitation"]') ||
    modal.querySelector('button[data-control-name="send-invite-cta-btn"]') ||
    Array.from(modal.querySelectorAll('button')).find(
      b => !b.disabled && /^send/i.test(b.textContent.trim())
    );

  if (sendBtn) {
    await humanClick(sendBtn);
    await randomWait(1000, 2500);
    await contentLog('✓ sent via generic send button');
    return true;
  }

  // Could not find any send button — dismiss and log for debugging
  await contentLog('⚠ no send/dismiss button found in modal — dumping modal HTML to log', 'warn');
  await contentLog(`[modal-html] ${modal.innerHTML.slice(0, 600)}`, 'warn');

  const dismissBtn =
    modal.querySelector('[aria-label="Dismiss"]') ||
    modal.querySelector('.artdeco-modal__dismiss') ||
    modal.querySelector('button[data-control-name="overlay.close"]');
  if (dismissBtn) await humanClick(dismissBtn);
  return false;
}

// ─── Profile link logger ──────────────────────────────────────────────────────
async function logProfileLink(profileUrl, profileId, name) {
  try {
    const entry = { ts: new Date().toISOString(), url: profileUrl, profileId, name, context: 'recruiter-search' };
    const { discoveredLinks = [] } = await chrome.storage.local.get('discoveredLinks');
    discoveredLinks.push(entry);
    await chrome.storage.local.set({ discoveredLinks: discoveredLinks.slice(-1000) });
  } catch (e) { console.warn('[Recruiter Prospector][logProfileLink failed]', e); }
}

[Recruiter Prospector] [Diag] no connect btn found | card buttons: none
[Recruiter Prospector] [Diag] no connect btn found | card buttons: "Follow" aria="Follow Anusha Raj"
Erros
[Recruiter Prospector] [Diag] no connect btn found | card buttons: "Follow" aria="Follow Simha kiraankumar"
[Recruiter Prospector] [Diag] no connect btn found | card buttons: none
Contexto
https://www.linkedin.com/search/results/people/?keywords=Tech%20Recruiter%20Information%20Technology&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%2C%22102713980%22%2C%22101739942%22%2C%22104738515%22%2C%22102890883%22%2C%22102454443%22%2C%22105015875%22%2C%22106157047%22%5D&spellCorrectionEnabled=true&prioritizeMessage=false
Rastreamento de pilha
content/recruiter-prospector.js:19 (contentLog)
content/recruiter-prospector.js:227 (prospectRecruiters)
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
281
282
283
284
285
286
287
288
289
290
291
292
293
294
295
296
297
298
299
300
301
302
303
304
305
306
307
308
309
310
311
312
313
314
315
316
317
318
319
320
321
322
323
324
325
326
327
328
329
330
331
332
333
334
335
336
337
338
339
340
341
342
343
344
345
346
347
348
349
350
351
352
353
354
355
356
357
358
359
360
361
362
363
364
365
366
367
368
369
370
371
372
373
374
375
376
377
378
379
380
381
382
383
384
385
386
387
388
389
390
391
392
393
394
395
396
397
398
399
400
401
402
403
404
405
406
407
408
409
410
411
412
413
414
415
416
417
418
419
420
421
422
423
424
425
426
427
428
429
430
431
432
433
434
435
436
437
438
439
440
441
442
443
444
445
446
447
448
449
450
451
452
453
454
455
456
457
458
459
460
461
462
463
464
465
466
467
468
469
470
471
472
473
474
475
476
477
478
479
480
481
482
483
484
485
486
487
488
489
490
491
492
493
494
495
496
497
498
499
500
501
502
503
504
505
506
507
508
509
510
511
512
513
514
515
516
517
518
519
520
521
522
523
524
525
526
527
528
529
530
531
532
533
534
535
536
537
538
539
540
541
542
543
544
545
546
547
548
549
550
551
552
553
554
555
556
557
558
559
560
561
562
563
564
565
566
567
568
569
570
571
572
573
574
575
576
577
578
579
580
581
582
583
584
585
586
587
588
589
590
591
592
593
594
595
596
597
598
599
600
601
602
603
604
605
606
607
608
609
610
611
612
613
614
615
616
617
618
619
620
621
622
623
624
625
626
627
628
629
630
631
632
633
634
635
636
637
638
639
640
641
642
643
644
645
646
647
648
649
650
651
652
653
654
655
656
657
658
659
660
661
662
663
664
665
666
667
668
669
670
671
672
673
674
675
676
677
678
679
680
681
682
683
684
685
686
687
688
689
690
691
692
693
694
695
696
697
698
699
700
701
702
703
704
705
706
707
708
709
710
711
712
713
714
715
716
717
718
719
720
721
722
723
724
725
726
727
728
729
730
731
732
733
734
735
736
737
738
739
740
741
742
743
744
745
746
747
748
749
750
751
752
753
754
755
756
757
758
759
760
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
  const entry = { ts: new Date().toISOString(), level, script: 'recruiter-prospector', msg };
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[Recruiter Prospector]', msg);
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push(entry);
    await chrome.storage.local.set({ activityLog: activityLog.slice(-300) });
  } catch (e) { console.warn('[contentLog]', e); }
}

/**
 * Daily cap is passed from the Service Worker via the START message.
 * Fallback to 9 (minimum of the 7-day cycle) if not provided.
 */
let SESSION_CAP = 9;
let VIEW_ONLY_MODE = false; // true when dailyCap=0 — browse profiles for SSI "Localizar as pessoas certas", no connections sent

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
      VIEW_ONLY_MODE = SESSION_CAP === 0;
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

/**
 * Navigates to the next LinkedIn search results page by clicking the native
 * pagination "Next" button. Returns true if navigation succeeded.
 * LinkedIn is a SPA — the URL changes via pushState and the content script
 * stays alive across pagination.
 */
async function goToNextPage() {
  const nextBtn =
    document.querySelector('button[aria-label="Next"]') ||
    document.querySelector('button[aria-label="Próximo"]') ||
    document.querySelector('button[aria-label="Siguiente"]') ||
    document.querySelector('.artdeco-pagination__button--next:not([disabled])') ||
    Array.from(document.querySelectorAll('button')).find(b => {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      const text  = b.textContent.trim().toLowerCase();
      return (label === 'next' || label === 'próximo' || text === 'next' || text === 'próximo') &&
             !b.disabled;
    });

  if (!nextBtn || nextBtn.disabled) return false;

  const prevUrl = window.location.href;
  nextBtn.click();

  // Wait up to 15s for the SPA to update the URL
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (window.location.href !== prevUrl) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function prospectRecruiters() {
  await contentLog(`▶ recruiter-prospector started | ${window.location.href}`);
  await randomWait(5000, 9000); // initial wait for SPA render

  let sent = 0;
  let totalChecked = 0;
  const MAX_PAGES = 10;

  for (let page = 1; page <= MAX_PAGES; page++) {
    if (!VIEW_ONLY_MODE && sent >= SESSION_CAP) break;

    // From page 2 onward: navigate via the Next button
    if (page > 1) {
      await randomWait(3000, 6000); // human-like pause between pages
      const navigated = await goToNextPage();
      if (!navigated) {
        await contentLog(`■ no more pages after page ${page - 1} — stopping pagination`);
        break;
      }
      await contentLog(`▶ page ${page} — waiting for SPA render...`);
      await randomWait(4000, 7000); // wait for LinkedIn SPA to paint new results
    }

    const cards = await waitForElements(getSearchResultCards);
    if (!cards.length) {
      if (page === 1) {
        console.warn('[Recruiter Prospector] No search result cards found — selectors may need updating.');
        await contentLog('✗ recruiter-prospector — no search result cards found (waited 20 s)', 'warn');
        await chrome.storage.local.set({ lastProspecting: { sent: 0, runAt: new Date().toISOString() } });
        return { sent: 0 };
      }
      await contentLog(`✗ page ${page} — no cards found — stopping pagination`, 'warn');
      break;
    }

    await contentLog(`page ${page}/${MAX_PAGES} — ${cards.length} cards found`);
    totalChecked += cards.length;

    for (const card of cards) {
      if (!VIEW_ONLY_MODE && sent >= SESSION_CAP) break;

      const profileId = extractProfileId(card);
      if (!profileId) continue;

      const profileUrl = extractProfileUrl(card) || `/in/${profileId}`;

      // Skip profiles with a locale suffix in the URL — e.g. /en/, /pt/, /es/
      // These are typically Brazilians who set their LinkedIn UI to English.
      // We want genuinely global profiles, not localised ones.
      if (/\/in\/[^/]+\/[a-z]{2}(-[a-zA-Z]{2,4})?\/?($|\?)/.test(profileUrl)) {
        await contentLog(`↷ ${profileUrl} — skipped (locale-suffixed URL, likely BR)`);
        continue;
      }

      // VIEW_ONLY_MODE: scroll each card — signals "Find Right People" to LinkedIn SSI
      if (VIEW_ONLY_MODE) {
        await scrollIntoViewAndPause(card);
        await randomWait(2000, 4500);
        await logProfileLink(profileUrl, profileId, '');
        await contentLog(`👁 ${profileUrl} — viewed (SSI: localizar as pessoas certas)`);
        continue;
      }

      // Log every profile we encounter (for later human review)
      const firstName = extractName(card);
      await logProfileLink(profileUrl, profileId, firstName);

      const locked = await isRecruiterLocked(profileId);
      if (locked) {
        // Scroll into view even when locked — SSI counts profile impressions from search
        await scrollIntoViewAndPause(card);
        await randomWait(1500, 3000);
        console.log(`[Recruiter Prospector] Skipping ${profileId} — within 7-day lock.`);
        await contentLog(`↷ ${profileUrl} — locked (7-day, viewed)`);
        continue;
      }

      // LinkedIn 2026 lazy-renders action buttons only after the card scrolls into view
      // and receives a hover event. Dispatch both pointer and mouse events (LinkedIn uses both).
      await scrollIntoViewAndPause(card);
      await readBeforeActing(card, 2000, 5000);
      card.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
      card.dispatchEvent(new MouseEvent('mouseenter',    { bubbles: true }));
      card.dispatchEvent(new PointerEvent('pointermove',  { bubbles: true, cancelable: true }));
      card.dispatchEvent(new MouseEvent('mouseover',      { bubbles: true, cancelable: true }));
      await waitForButtonsInCard(card, 6000);

      // Try direct Connect button inside the card first
      let connectButton = getConnectButton(card);
      let viaMoreMenu = false;

      if (!connectButton) {
        // Connect may be hidden inside the "More actions" overflow menu inside card
        connectButton = await getConnectButtonViaMore(card);
        if (connectButton) viaMoreMenu = true;
      }

      // LinkedIn 2026: action buttons are rendered in a floating overlay OUTSIDE the card's
      // DOM subtree. After hover, scan the full document for a Connect button whose
      // aria-label contains the profile ID or whose nearest ancestor link matches the URL.
      if (!connectButton) {
        connectButton = getConnectButtonDocument(profileId, profileUrl);
      }

      // Last resort: open More actions at document level and search the dropdown
      if (!connectButton) {
        connectButton = await getConnectButtonViaMoreDocument(profileId, profileUrl);
        if (connectButton) viaMoreMenu = true;
      }

      if (!connectButton) {
        await randomWait(1000, 2500);
        // Diagnostic: log all button texts/aria-labels in this card so we can tune selectors
        const btns = Array.from(card.querySelectorAll('button'))
          .map(b => `"${b.textContent.trim().slice(0,30)}" aria="${(b.getAttribute('aria-label')||'').slice(0,50)}"`)
          .join(' | ');
        await contentLog(`[Diag] no connect btn found | card buttons: ${btns || 'none'}`, 'warn');
        await contentLog(`↷ ${profileUrl} — no connect button (viewed)`);
        continue;
      }

      await humanClick(connectButton);

      // Send connection WITHOUT a note — avoids modal friction and feels more organic
      const connected = await handleConnectionModalNoNote();
      if (!connected) {
        await contentLog(`⚠ connection modal handled but send failed | ${profileUrl}`, 'warn');
        continue;
      }

      await markRecruiterInteracted(profileId, firstName);
      sent++;
      await contentLog(`✓ ${profileUrl} | ${firstName} — connected (${sent}/${SESSION_CAP}) [p${page}]`, 'success');

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
  }

  await chrome.storage.local.set({
    lastProspecting: { sent, runAt: new Date().toISOString() },
  });
  await contentLog(`■ recruiter-prospector DONE | ${sent} sent / ${totalChecked} checked`, 'success');

  return { sent };
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

/**
 * Polls up to maxWait ms for the action button set to fully render inside a card.
 * LinkedIn 2026 lazy-renders buttons after scroll/hover: first "Follow" appears, then
 * "Connect" / "More (…)" appear a beat later. We wait for ≥2 buttons so the overflow
 * menu button is present before we try to open it. Falls back after maxWait.
 */
async function waitForButtonsInCard(card, maxWait = 6000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const btns = Array.from(card.querySelectorAll('button'));
    if (btns.length >= 2) return; // Follow + More/Connect both rendered
    if (btns.some(b => {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      const text  = b.textContent.trim().toLowerCase();
      return /^connect/i.test(label) || /^connect/i.test(text) ||
             /^convidar/i.test(label) || /^conectar/i.test(label);
    })) return; // Connect button appeared directly — no need to wait for More
    await new Promise(r => setTimeout(r, 300));
  }
}

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

  // Strategy 4 (LinkedIn 2025): div-based result containers (LinkedIn migrated away from li in some views)
  const byDivResult = Array.from(document.querySelectorAll(
    'div.search-result, div[class*="search-result"], ' +
    'div.reusable-search__result-container'
  )).filter(el => el.querySelector('a[href*="/in/"]'));
  if (byDivResult.length) { console.log(`[Recruiter Prospector] Found ${byDivResult.length} cards via div-result fallback.`); return byDivResult; }

  // Strategy 5 (LinkedIn 2026): data-attribute based containers used in Chameleon/Voyager redesign
  const byDataAttr = Array.from(document.querySelectorAll(
    '[data-chameleon-result-urn], [data-entity-urn*="fs_miniProfile"], ' +
    '[data-member-id], [data-view-name*="entity-result"]'
  )).filter(el => el.querySelector('a[href*="/in/"]'));
  if (byDataAttr.length) { console.log(`[Recruiter Prospector] Found ${byDataAttr.length} cards via data-attr strategy.`); return byDataAttr; }

  // Strategy 6: walk UP from each profile link to find the closest card-like container
  // (avoids the old "outermost ancestor per profile" bug that returned page-wide containers
  //  containing nav, pagination and ad buttons alongside card buttons)
  const allProfileLinks = Array.from(document.querySelectorAll('a[href*="/in/"]'));
  const seenUrls = new Set();
  const closestContainers = [];
  for (const link of allProfileLinks) {
    const key = link.href.split('?')[0];
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    // Walk up: take the closest <li>, or the closest bounded <div> that is card-sized
    let el = link.parentElement;
    let best = null;
    while (el && el.tagName !== 'BODY') {
      if (el.tagName === 'LI') { best = el; break; }
      if (el.tagName === 'DIV') {
        const rect = el.getBoundingClientRect();
        // Card heuristic: taller than a line but shorter than two viewport heights,
        // and wide enough to be a result item (not a narrow sidebar widget)
        if (rect.height > 60 && rect.height < 500 && rect.width > 300) {
          best = el;
          break;
        }
      }
      el = el.parentElement;
    }
    if (best) closestContainers.push(best);
  }
  if (closestContainers.length) { console.log(`[Recruiter Prospector] Found ${closestContainers.length} cards via closest-container strategy.`); return closestContainers; }

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
  return Array.from(card.querySelectorAll('button')).find(b => {
    const text  = b.textContent.trim().toLowerCase();
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    return text === 'connect' ||
           text === 'conectar' ||
           text === 'conectar-se' ||
           text.startsWith('connect') ||
           text.startsWith('conectar') ||
           /^connect/i.test(label) ||
           /^conectar/i.test(label) ||
           /^convidar/i.test(label) ||
           (/convidar/i.test(label) && /conectar/i.test(label)) ||
           /^invite .+ to connect/i.test(label) ||
           /^convidar .+ para se? conectar/i.test(label);
  }) || null;
}

async function getConnectButtonViaMore(card) {
  // Look for the More button first inside the card, then at document level
  // (LinkedIn 2026 may render action overlays outside the li container)
  const MORE_SELS = [
    'button[aria-label*="More actions"]',
    'button[aria-label*="More options"]',
    'button[aria-label*="Mais ações"]',
    'button[aria-label*="Mais opções"]',
    'button[aria-label*="Mais ação"]',
    // Catch-all patterns for LinkedIn 2026 Chameleon design
    'button.artdeco-dropdown__trigger',
    'button[data-control-name*="overflow"]',
    'button[data-control-name*="more"]',
  ];
  const textMatch = (b) => {
    const t = (b.getAttribute('aria-label') || b.textContent || '').trim().toLowerCase();
    // Use startsWith so "More options for John" also matches
    return t.startsWith('more') || t === '…' || t === '...' ||
           t.startsWith('mais') || t.includes('overflow actions');
  };

  let moreBtn =
    MORE_SELS.reduce((f, s) => f || card.querySelector(s), null) ||
    Array.from(card.querySelectorAll('button')).find(textMatch);

  // Fallback: the More button may live outside the card's DOM subtree in a floating overlay.
  // Use geometric proximity instead of document.querySelector (which returns the wrong card's button).
  if (!moreBtn) {
    const cardRect = card.getBoundingClientRect();
    const candidates = [
      ...MORE_SELS.flatMap(s => Array.from(document.querySelectorAll(s))),
      ...Array.from(document.querySelectorAll('button')).filter(textMatch),
    ];
    moreBtn = candidates.find(b => {
      if (b.disabled) return false;
      const rect = b.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      // Accept the button if it sits within the card's vertical band (±60 px slack)
      return rect.top >= cardRect.top - 60 && rect.bottom <= cardRect.bottom + 60;
    });
  }

  if (!moreBtn) return null;

  await humanClick(moreBtn);
  await randomWait(600, 1400);

  // Poll up to 3s for the dropdown Connect item to appear
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const item =
      document.querySelector('.artdeco-dropdown__content li button[aria-label*="Connect"]') ||
      document.querySelector('.artdeco-dropdown__content li button[aria-label*="Invite"]') ||
      document.querySelector('.artdeco-dropdown__content li button[aria-label*="Conectar"]') ||
      document.querySelector('.artdeco-dropdown__content li button[aria-label*="Convidar"]') ||
      Array.from(document.querySelectorAll(
        '.artdeco-dropdown__content li, .artdeco-dropdown li'
      )).reduce((found, li) => {
        if (found) return found;
        const btn = li.querySelector('button') || li;
        const label = (btn.getAttribute('aria-label') || btn.textContent || '').trim().toLowerCase();
        return (
          label === 'connect'   || label.startsWith('connect ')   || /^invite .+ to connect/i.test(label)  ||
          label === 'conectar'  || label.startsWith('conectar ')  || /^convidar .+ para se? conectar/i.test(label) ||
          label === 'convidar'
        ) ? btn : null;
      }, null);
    if (item) return item;
    await new Promise(r => setTimeout(r, 300));
  }

  // Connect not in dropdown — close it and report
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return null;
}

/**
 * LinkedIn 2026: action buttons are rendered in a floating overlay OUTSIDE the card's DOM
 * subtree. After scrolling a card into view and dispatching hover, the "Connect" button
 * appears somewhere on the page (not inside the card). We search document-wide but verify
 * the button is contextually tied to this profile via its aria-label (contains profileId or
 * profile URL slug) or because it is the only visible Connect button on the page at that moment.
 *
 * @param {string} profileId  - URL slug of the profile, e.g. "john-smith-123"
 * @param {string} profileUrl - full /in/ URL of the profile
 * @returns {HTMLElement|null}
 */
function getConnectButtonDocument(profileId, profileUrl) {
  const slug = profileId ? profileId.toLowerCase() : '';
  const CONNECT_RE = /^(connect|conectar|conectar-se|convidar)\b/i;
  const INVITE_RE  = /^(invite .+ to connect|convidar .+ para se? conectar)/i;

  const allBtns = Array.from(document.querySelectorAll('button'));

  // First pass: prefer buttons whose aria-label explicitly names this profile
  const byLabel = allBtns.find(b => {
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    if (!CONNECT_RE.test(label) && !INVITE_RE.test(label)) return false;
    return slug && label.includes(slug.toLowerCase());
  });
  if (byLabel) return byLabel;

  // Second pass: any visible, enabled Connect button on the page
  // (safe when only one card is active / hovered at a time)
  const visible = allBtns.filter(b => {
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    const text  = b.textContent.trim().toLowerCase();
    const isConnect = CONNECT_RE.test(label) || CONNECT_RE.test(text) || INVITE_RE.test(label);
    if (!isConnect) return false;
    if (b.disabled) return false;
    const rect = b.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  // Return only if exactly one Connect button is visible (avoids ambiguity)
  if (visible.length === 1) return visible[0];

  return null;
}

/**
 * LinkedIn 2026 document-level More-menu fallback.
 * Clicks the first visible More/overflow button that is NOT inside a nav/header,
 * then waits for a dropdown Connect item. Verifies the dropdown appeared for THIS
 * profile by checking the aria-label contains the profile slug.
 */
async function getConnectButtonViaMoreDocument(profileId, profileUrl) {
  const slug = profileId ? profileId.toLowerCase() : '';

  const MORE_SELS = [
    'button[aria-label*="More actions"]',
    'button[aria-label*="More options"]',
    'button[aria-label*="Mais ações"]',
    'button[aria-label*="Mais opções"]',
  ];
  const textMatch = (b) => {
    const t = (b.getAttribute('aria-label') || b.textContent || '').trim().toLowerCase();
    return t === 'more' || t === 'more actions' || t === 'more options' ||
           t === 'mais' || t === 'mais ações'   || t === 'mais opções'  || t === '…';
  };

  // Find More button that is NOT in the main nav
  const moreBtns = [
    ...MORE_SELS.flatMap(s => Array.from(document.querySelectorAll(s))),
    ...Array.from(document.querySelectorAll('button')).filter(textMatch),
  ].filter(b => {
    if (b.disabled) return false;
    const rect = b.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    // Exclude navbar buttons (top of page)
    if (rect.top < 80) return false;
    return true;
  });

  if (!moreBtns.length) return null;

  // Click the first candidate (should be the one for the hovered card)
  await humanClick(moreBtns[0]);
  await randomWait(600, 1400);

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const dropItems = Array.from(document.querySelectorAll(
      '.artdeco-dropdown__content li, .artdeco-dropdown li'
    ));
    const connectItem = dropItems.find(li => {
      const btn = li.querySelector('button') || li;
      const label = (btn.getAttribute('aria-label') || btn.textContent || '').trim().toLowerCase();
      return /^(connect|invite .+ to connect|conectar|convidar)/i.test(label);
    });
    if (connectItem) {
      const btn = connectItem.querySelector('button') || connectItem;
      // Validate: the aria-label should reference this profile if slug available
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (!slug || label.includes(slug)) return btn;
      // Mismatch — close and skip
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return null;
    }
    await new Promise(r => setTimeout(r, 300));
  }

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return null;
}

async function handleConnectionModal(card, profileId) {
  // Poll for the invite modal to appear (up to 5 s)
  const modal = await new Promise(resolve => {
    const deadline = Date.now() + 5000;
    const tick = setInterval(() => {
      const m =
        document.querySelector('div[data-test-modal-id="send-invite-modal"]') ||
        document.querySelector('.send-invite') ||
        document.querySelector('[data-test-modal]') ||
        document.querySelector('.artdeco-modal[role="dialog"]');
      if (m || Date.now() >= deadline) { clearInterval(tick); resolve(m || null); }
    }, 300);
  });

  if (!modal) {
    // No modal — LinkedIn sent the request directly (no note required)
    return true;
  }

  // Try to click the "Add a note" button inside the modal
  const addNoteBtn =
    modal.querySelector('[aria-label="Add a note"]') ||
    modal.querySelector('button[data-control-name="add-note"]') ||
    Array.from(modal.querySelectorAll('button')).find(
      b => /add\s*a?\s*note/i.test(b.textContent)
    );

  if (addNoteBtn) {
    await humanClick(addNoteBtn);
    await randomWait(800, 1600);

    const noteInput =
      document.querySelector('#custom-message') ||
      document.querySelector('#connect-cta-form__message') ||
      document.querySelector('textarea[name="message"]') ||
      document.querySelector('.connect-button-send-invite__custom-message') ||
      document.querySelector('.artdeco-modal textarea');

    if (noteInput) {
      const firstName = extractName(card);
      const personalizedNote = CONNECTION_NOTE.replace('{firstName}', firstName);
      noteInput.focus();
      // Use execCommand so the character counter and submit-enable logic fires
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, personalizedNote);
      noteInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
      await randomWait(1000, 2000);
    }
  }

  // Find the send / submit button
  const sendButton =
    document.querySelector('[aria-label="Send now"]') ||
    document.querySelector('[aria-label="Send invitation"]') ||
    document.querySelector('button[data-control-name="send-invite-cta-btn"]') ||
    Array.from(document.querySelectorAll('.artdeco-modal button')).find(
      b => !b.disabled && /send/i.test(b.textContent.trim())
    );

  if (sendButton) {
    await humanClick(sendButton);
    await randomWait(1000, 2500);
    return true;
  }

  // Last resort: "Send without a note" so the connection is still attempted
  const sendWithoutNote =
    document.querySelector('[aria-label="Send without a note"]') ||
    Array.from(document.querySelectorAll('button')).find(
      b => /send without/i.test(b.textContent)
    );
  if (sendWithoutNote) {
    await humanClick(sendWithoutNote);
    await randomWait(1000, 2000);
    return true;
  }

  // Could not send — close the modal and skip
  const dismissButton =
    document.querySelector('[aria-label="Dismiss"]') ||
    document.querySelector('.artdeco-modal__dismiss') ||
    document.querySelector('button[data-control-name="overlay.close"]');
  if (dismissButton) await humanClick(dismissButton);
  return false;
}

// ─── No-note connection handler ───────────────────────────────────────────────
/**
 * Handles the post-click connection modal by always sending WITHOUT a note.
 * This avoids the message-compose step and feels less bot-like in terms of
 * volume (LinkedIn flags accounts that always send identical notes).
 * Logs everything for debugging.
 */
async function handleConnectionModalNoNote() {
  // Wait up to 6s for any modal to appear — LinkedIn 2026 modal is slower to paint
  const modal = await new Promise(resolve => {
    const deadline = Date.now() + 6000;
    const tick = setInterval(() => {
      const m =
        // LinkedIn 2026: "Add a note to your invitation?" dialog
        document.querySelector('[data-test-modal-id="send-invite-modal"]') ||
        document.querySelector('[data-test-modal-id="send-connections-modal"]') ||
        document.querySelector('div[aria-label*="Add a note"]') ||
        document.querySelector('div[aria-label*="invitation"]') ||
        // Classic selectors
        document.querySelector('.send-invite') ||
        document.querySelector('[data-test-modal]') ||
        document.querySelector('.artdeco-modal[role="dialog"]') ||
        document.querySelector('div[role="dialog"]');
      if (m || Date.now() >= deadline) { clearInterval(tick); resolve(m || null); }
    }, 300);
  });

  if (!modal) {
    // LinkedIn sent directly — no modal (already connected or 1st degree)
    await contentLog('📤 connection sent directly — no modal appeared');
    return true;
  }

  await contentLog('📋 connection modal appeared — looking for send-without-note button');

  // Priority: "Send without a note" — LinkedIn 2026 uses both aria-label and data-control-name
  const sendWithoutNote =
    modal.querySelector('[aria-label="Send without a note"]') ||
    modal.querySelector('[data-control-name="connect.send_without_note"]') ||
    modal.querySelector('button[data-control-name*="without"]') ||
    Array.from(modal.querySelectorAll('button')).find(
      b => /send without/i.test(b.textContent) ||
           /sem nota/i.test(b.textContent) ||
           /without a note/i.test(b.getAttribute('aria-label') || '')
    );

  if (sendWithoutNote) {
    await humanClick(sendWithoutNote);
    await randomWait(1000, 2500);
    await contentLog('✓ sent without note');
    return true;
  }

  // Fallback: generic send/submit button
  const sendBtn =
    modal.querySelector('[aria-label="Send now"]') ||
    modal.querySelector('[aria-label="Send invitation"]') ||
    modal.querySelector('button[data-control-name="send-invite-cta-btn"]') ||
    Array.from(modal.querySelectorAll('button')).find(
      b => !b.disabled && /^send/i.test(b.textContent.trim())
    );

  if (sendBtn) {
    await humanClick(sendBtn);
    await randomWait(1000, 2500);
    await contentLog('✓ sent via generic send button');
    return true;
  }

  // Could not find any send button — dismiss and log for debugging
  await contentLog('⚠ no send/dismiss button found in modal — dumping modal HTML to log', 'warn');
  await contentLog(`[modal-html] ${modal.innerHTML.slice(0, 600)}`, 'warn');

  const dismissBtn =
    modal.querySelector('[aria-label="Dismiss"]') ||
    modal.querySelector('.artdeco-modal__dismiss') ||
    modal.querySelector('button[data-control-name="overlay.close"]');
  if (dismissBtn) await humanClick(dismissBtn);
  return false;
}

// ─── Profile link logger ──────────────────────────────────────────────────────
async function logProfileLink(profileUrl, profileId, name) {
  try {
    const entry = { ts: new Date().toISOString(), url: profileUrl, profileId, name, context: 'recruiter-search' };
    const { discoveredLinks = [] } = await chrome.storage.local.get('discoveredLinks');
    discoveredLinks.push(entry);
    await chrome.storage.local.set({ discoveredLinks: discoveredLinks.slice(-1000) });
  } catch (e) { console.warn('[Recruiter Prospector][logProfileLink failed]', e); }
}

[Recruiter Prospector] [Diag] no connect btn found | card buttons: "Follow" aria="Follow Anusha Raj"
Erros
[Recruiter Prospector] [Diag] no connect btn found | card buttons: "Follow" aria="Follow Simha kiraankumar"
[Recruiter Prospector] [Diag] no connect btn found | card buttons: none
Contexto
https://www.linkedin.com/search/results/people/?keywords=Tech%20Recruiter%20Information%20Technology&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%2C%22102713980%22%2C%22101739942%22%2C%22104738515%22%2C%22102890883%22%2C%22102454443%22%2C%22105015875%22%2C%22106157047%22%5D&spellCorrectionEnabled=true&prioritizeMessage=false
Rastreamento de pilha
content/recruiter-prospector.js:19 (contentLog)
content/recruiter-prospector.js:227 (prospectRecruiters)
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
281
282
283
284
285
286
287
288
289
290
291
292
293
294
295
296
297
298
299
300
301
302
303
304
305
306
307
308
309
310
311
312
313
314
315
316
317
318
319
320
321
322
323
324
325
326
327
328
329
330
331
332
333
334
335
336
337
338
339
340
341
342
343
344
345
346
347
348
349
350
351
352
353
354
355
356
357
358
359
360
361
362
363
364
365
366
367
368
369
370
371
372
373
374
375
376
377
378
379
380
381
382
383
384
385
386
387
388
389
390
391
392
393
394
395
396
397
398
399
400
401
402
403
404
405
406
407
408
409
410
411
412
413
414
415
416
417
418
419
420
421
422
423
424
425
426
427
428
429
430
431
432
433
434
435
436
437
438
439
440
441
442
443
444
445
446
447
448
449
450
451
452
453
454
455
456
457
458
459
460
461
462
463
464
465
466
467
468
469
470
471
472
473
474
475
476
477
478
479
480
481
482
483
484
485
486
487
488
489
490
491
492
493
494
495
496
497
498
499
500
501
502
503
504
505
506
507
508
509
510
511
512
513
514
515
516
517
518
519
520
521
522
523
524
525
526
527
528
529
530
531
532
533
534
535
536
537
538
539
540
541
542
543
544
545
546
547
548
549
550
551
552
553
554
555
556
557
558
559
560
561
562
563
564
565
566
567
568
569
570
571
572
573
574
575
576
577
578
579
580
581
582
583
584
585
586
587
588
589
590
591
592
593
594
595
596
597
598
599
600
601
602
603
604
605
606
607
608
609
610
611
612
613
614
615
616
617
618
619
620
621
622
623
624
625
626
627
628
629
630
631
632
633
634
635
636
637
638
639
640
641
642
643
644
645
646
647
648
649
650
651
652
653
654
655
656
657
658
659
660
661
662
663
664
665
666
667
668
669
670
671
672
673
674
675
676
677
678
679
680
681
682
683
684
685
686
687
688
689
690
691
692
693
694
695
696
697
698
699
700
701
702
703
704
705
706
707
708
709
710
711
712
713
714
715
716
717
718
719
720
721
722
723
724
725
726
727
728
729
730
731
732
733
734
735
736
737
738
739
740
741
742
743
744
745
746
747
748
749
750
751
752
753
754
755
756
757
758
759
760
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
  const entry = { ts: new Date().toISOString(), level, script: 'recruiter-prospector', msg };
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[Recruiter Prospector]', msg);
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push(entry);
    await chrome.storage.local.set({ activityLog: activityLog.slice(-300) });
  } catch (e) { console.warn('[contentLog]', e); }
}

/**
 * Daily cap is passed from the Service Worker via the START message.
 * Fallback to 9 (minimum of the 7-day cycle) if not provided.
 */
let SESSION_CAP = 9;
let VIEW_ONLY_MODE = false; // true when dailyCap=0 — browse profiles for SSI "Localizar as pessoas certas", no connections sent

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
      VIEW_ONLY_MODE = SESSION_CAP === 0;
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

/**
 * Navigates to the next LinkedIn search results page by clicking the native
 * pagination "Next" button. Returns true if navigation succeeded.
 * LinkedIn is a SPA — the URL changes via pushState and the content script
 * stays alive across pagination.
 */
async function goToNextPage() {
  const nextBtn =
    document.querySelector('button[aria-label="Next"]') ||
    document.querySelector('button[aria-label="Próximo"]') ||
    document.querySelector('button[aria-label="Siguiente"]') ||
    document.querySelector('.artdeco-pagination__button--next:not([disabled])') ||
    Array.from(document.querySelectorAll('button')).find(b => {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      const text  = b.textContent.trim().toLowerCase();
      return (label === 'next' || label === 'próximo' || text === 'next' || text === 'próximo') &&
             !b.disabled;
    });

  if (!nextBtn || nextBtn.disabled) return false;

  const prevUrl = window.location.href;
  nextBtn.click();

  // Wait up to 15s for the SPA to update the URL
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (window.location.href !== prevUrl) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function prospectRecruiters() {
  await contentLog(`▶ recruiter-prospector started | ${window.location.href}`);
  await randomWait(5000, 9000); // initial wait for SPA render

  let sent = 0;
  let totalChecked = 0;
  const MAX_PAGES = 10;

  for (let page = 1; page <= MAX_PAGES; page++) {
    if (!VIEW_ONLY_MODE && sent >= SESSION_CAP) break;

    // From page 2 onward: navigate via the Next button
    if (page > 1) {
      await randomWait(3000, 6000); // human-like pause between pages
      const navigated = await goToNextPage();
      if (!navigated) {
        await contentLog(`■ no more pages after page ${page - 1} — stopping pagination`);
        break;
      }
      await contentLog(`▶ page ${page} — waiting for SPA render...`);
      await randomWait(4000, 7000); // wait for LinkedIn SPA to paint new results
    }

    const cards = await waitForElements(getSearchResultCards);
    if (!cards.length) {
      if (page === 1) {
        console.warn('[Recruiter Prospector] No search result cards found — selectors may need updating.');
        await contentLog('✗ recruiter-prospector — no search result cards found (waited 20 s)', 'warn');
        await chrome.storage.local.set({ lastProspecting: { sent: 0, runAt: new Date().toISOString() } });
        return { sent: 0 };
      }
      await contentLog(`✗ page ${page} — no cards found — stopping pagination`, 'warn');
      break;
    }

    await contentLog(`page ${page}/${MAX_PAGES} — ${cards.length} cards found`);
    totalChecked += cards.length;

    for (const card of cards) {
      if (!VIEW_ONLY_MODE && sent >= SESSION_CAP) break;

      const profileId = extractProfileId(card);
      if (!profileId) continue;

      const profileUrl = extractProfileUrl(card) || `/in/${profileId}`;

      // Skip profiles with a locale suffix in the URL — e.g. /en/, /pt/, /es/
      // These are typically Brazilians who set their LinkedIn UI to English.
      // We want genuinely global profiles, not localised ones.
      if (/\/in\/[^/]+\/[a-z]{2}(-[a-zA-Z]{2,4})?\/?($|\?)/.test(profileUrl)) {
        await contentLog(`↷ ${profileUrl} — skipped (locale-suffixed URL, likely BR)`);
        continue;
      }

      // VIEW_ONLY_MODE: scroll each card — signals "Find Right People" to LinkedIn SSI
      if (VIEW_ONLY_MODE) {
        await scrollIntoViewAndPause(card);
        await randomWait(2000, 4500);
        await logProfileLink(profileUrl, profileId, '');
        await contentLog(`👁 ${profileUrl} — viewed (SSI: localizar as pessoas certas)`);
        continue;
      }

      // Log every profile we encounter (for later human review)
      const firstName = extractName(card);
      await logProfileLink(profileUrl, profileId, firstName);

      const locked = await isRecruiterLocked(profileId);
      if (locked) {
        // Scroll into view even when locked — SSI counts profile impressions from search
        await scrollIntoViewAndPause(card);
        await randomWait(1500, 3000);
        console.log(`[Recruiter Prospector] Skipping ${profileId} — within 7-day lock.`);
        await contentLog(`↷ ${profileUrl} — locked (7-day, viewed)`);
        continue;
      }

      // LinkedIn 2026 lazy-renders action buttons only after the card scrolls into view
      // and receives a hover event. Dispatch both pointer and mouse events (LinkedIn uses both).
      await scrollIntoViewAndPause(card);
      await readBeforeActing(card, 2000, 5000);
      card.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
      card.dispatchEvent(new MouseEvent('mouseenter',    { bubbles: true }));
      card.dispatchEvent(new PointerEvent('pointermove',  { bubbles: true, cancelable: true }));
      card.dispatchEvent(new MouseEvent('mouseover',      { bubbles: true, cancelable: true }));
      await waitForButtonsInCard(card, 6000);

      // Try direct Connect button inside the card first
      let connectButton = getConnectButton(card);
      let viaMoreMenu = false;

      if (!connectButton) {
        // Connect may be hidden inside the "More actions" overflow menu inside card
        connectButton = await getConnectButtonViaMore(card);
        if (connectButton) viaMoreMenu = true;
      }

      // LinkedIn 2026: action buttons are rendered in a floating overlay OUTSIDE the card's
      // DOM subtree. After hover, scan the full document for a Connect button whose
      // aria-label contains the profile ID or whose nearest ancestor link matches the URL.
      if (!connectButton) {
        connectButton = getConnectButtonDocument(profileId, profileUrl);
      }

      // Last resort: open More actions at document level and search the dropdown
      if (!connectButton) {
        connectButton = await getConnectButtonViaMoreDocument(profileId, profileUrl);
        if (connectButton) viaMoreMenu = true;
      }

      if (!connectButton) {
        await randomWait(1000, 2500);
        // Diagnostic: log all button texts/aria-labels in this card so we can tune selectors
        const btns = Array.from(card.querySelectorAll('button'))
          .map(b => `"${b.textContent.trim().slice(0,30)}" aria="${(b.getAttribute('aria-label')||'').slice(0,50)}"`)
          .join(' | ');
        await contentLog(`[Diag] no connect btn found | card buttons: ${btns || 'none'}`, 'warn');
        await contentLog(`↷ ${profileUrl} — no connect button (viewed)`);
        continue;
      }

      await humanClick(connectButton);

      // Send connection WITHOUT a note — avoids modal friction and feels more organic
      const connected = await handleConnectionModalNoNote();
      if (!connected) {
        await contentLog(`⚠ connection modal handled but send failed | ${profileUrl}`, 'warn');
        continue;
      }

      await markRecruiterInteracted(profileId, firstName);
      sent++;
      await contentLog(`✓ ${profileUrl} | ${firstName} — connected (${sent}/${SESSION_CAP}) [p${page}]`, 'success');

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
  }

  await chrome.storage.local.set({
    lastProspecting: { sent, runAt: new Date().toISOString() },
  });
  await contentLog(`■ recruiter-prospector DONE | ${sent} sent / ${totalChecked} checked`, 'success');

  return { sent };
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

/**
 * Polls up to maxWait ms for the action button set to fully render inside a card.
 * LinkedIn 2026 lazy-renders buttons after scroll/hover: first "Follow" appears, then
 * "Connect" / "More (…)" appear a beat later. We wait for ≥2 buttons so the overflow
 * menu button is present before we try to open it. Falls back after maxWait.
 */
async function waitForButtonsInCard(card, maxWait = 6000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const btns = Array.from(card.querySelectorAll('button'));
    if (btns.length >= 2) return; // Follow + More/Connect both rendered
    if (btns.some(b => {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      const text  = b.textContent.trim().toLowerCase();
      return /^connect/i.test(label) || /^connect/i.test(text) ||
             /^convidar/i.test(label) || /^conectar/i.test(label);
    })) return; // Connect button appeared directly — no need to wait for More
    await new Promise(r => setTimeout(r, 300));
  }
}

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

  // Strategy 4 (LinkedIn 2025): div-based result containers (LinkedIn migrated away from li in some views)
  const byDivResult = Array.from(document.querySelectorAll(
    'div.search-result, div[class*="search-result"], ' +
    'div.reusable-search__result-container'
  )).filter(el => el.querySelector('a[href*="/in/"]'));
  if (byDivResult.length) { console.log(`[Recruiter Prospector] Found ${byDivResult.length} cards via div-result fallback.`); return byDivResult; }

  // Strategy 5 (LinkedIn 2026): data-attribute based containers used in Chameleon/Voyager redesign
  const byDataAttr = Array.from(document.querySelectorAll(
    '[data-chameleon-result-urn], [data-entity-urn*="fs_miniProfile"], ' +
    '[data-member-id], [data-view-name*="entity-result"]'
  )).filter(el => el.querySelector('a[href*="/in/"]'));
  if (byDataAttr.length) { console.log(`[Recruiter Prospector] Found ${byDataAttr.length} cards via data-attr strategy.`); return byDataAttr; }

  // Strategy 6: walk UP from each profile link to find the closest card-like container
  // (avoids the old "outermost ancestor per profile" bug that returned page-wide containers
  //  containing nav, pagination and ad buttons alongside card buttons)
  const allProfileLinks = Array.from(document.querySelectorAll('a[href*="/in/"]'));
  const seenUrls = new Set();
  const closestContainers = [];
  for (const link of allProfileLinks) {
    const key = link.href.split('?')[0];
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    // Walk up: take the closest <li>, or the closest bounded <div> that is card-sized
    let el = link.parentElement;
    let best = null;
    while (el && el.tagName !== 'BODY') {
      if (el.tagName === 'LI') { best = el; break; }
      if (el.tagName === 'DIV') {
        const rect = el.getBoundingClientRect();
        // Card heuristic: taller than a line but shorter than two viewport heights,
        // and wide enough to be a result item (not a narrow sidebar widget)
        if (rect.height > 60 && rect.height < 500 && rect.width > 300) {
          best = el;
          break;
        }
      }
      el = el.parentElement;
    }
    if (best) closestContainers.push(best);
  }
  if (closestContainers.length) { console.log(`[Recruiter Prospector] Found ${closestContainers.length} cards via closest-container strategy.`); return closestContainers; }

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
  return Array.from(card.querySelectorAll('button')).find(b => {
    const text  = b.textContent.trim().toLowerCase();
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    return text === 'connect' ||
           text === 'conectar' ||
           text === 'conectar-se' ||
           text.startsWith('connect') ||
           text.startsWith('conectar') ||
           /^connect/i.test(label) ||
           /^conectar/i.test(label) ||
           /^convidar/i.test(label) ||
           (/convidar/i.test(label) && /conectar/i.test(label)) ||
           /^invite .+ to connect/i.test(label) ||
           /^convidar .+ para se? conectar/i.test(label);
  }) || null;
}

async function getConnectButtonViaMore(card) {
  // Look for the More button first inside the card, then at document level
  // (LinkedIn 2026 may render action overlays outside the li container)
  const MORE_SELS = [
    'button[aria-label*="More actions"]',
    'button[aria-label*="More options"]',
    'button[aria-label*="Mais ações"]',
    'button[aria-label*="Mais opções"]',
    'button[aria-label*="Mais ação"]',
    // Catch-all patterns for LinkedIn 2026 Chameleon design
    'button.artdeco-dropdown__trigger',
    'button[data-control-name*="overflow"]',
    'button[data-control-name*="more"]',
  ];
  const textMatch = (b) => {
    const t = (b.getAttribute('aria-label') || b.textContent || '').trim().toLowerCase();
    // Use startsWith so "More options for John" also matches
    return t.startsWith('more') || t === '…' || t === '...' ||
           t.startsWith('mais') || t.includes('overflow actions');
  };

  let moreBtn =
    MORE_SELS.reduce((f, s) => f || card.querySelector(s), null) ||
    Array.from(card.querySelectorAll('button')).find(textMatch);

  // Fallback: the More button may live outside the card's DOM subtree in a floating overlay.
  // Use geometric proximity instead of document.querySelector (which returns the wrong card's button).
  if (!moreBtn) {
    const cardRect = card.getBoundingClientRect();
    const candidates = [
      ...MORE_SELS.flatMap(s => Array.from(document.querySelectorAll(s))),
      ...Array.from(document.querySelectorAll('button')).filter(textMatch),
    ];
    moreBtn = candidates.find(b => {
      if (b.disabled) return false;
      const rect = b.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      // Accept the button if it sits within the card's vertical band (±60 px slack)
      return rect.top >= cardRect.top - 60 && rect.bottom <= cardRect.bottom + 60;
    });
  }

  if (!moreBtn) return null;

  await humanClick(moreBtn);
  await randomWait(600, 1400);

  // Poll up to 3s for the dropdown Connect item to appear
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const item =
      document.querySelector('.artdeco-dropdown__content li button[aria-label*="Connect"]') ||
      document.querySelector('.artdeco-dropdown__content li button[aria-label*="Invite"]') ||
      document.querySelector('.artdeco-dropdown__content li button[aria-label*="Conectar"]') ||
      document.querySelector('.artdeco-dropdown__content li button[aria-label*="Convidar"]') ||
      Array.from(document.querySelectorAll(
        '.artdeco-dropdown__content li, .artdeco-dropdown li'
      )).reduce((found, li) => {
        if (found) return found;
        const btn = li.querySelector('button') || li;
        const label = (btn.getAttribute('aria-label') || btn.textContent || '').trim().toLowerCase();
        return (
          label === 'connect'   || label.startsWith('connect ')   || /^invite .+ to connect/i.test(label)  ||
          label === 'conectar'  || label.startsWith('conectar ')  || /^convidar .+ para se? conectar/i.test(label) ||
          label === 'convidar'
        ) ? btn : null;
      }, null);
    if (item) return item;
    await new Promise(r => setTimeout(r, 300));
  }

  // Connect not in dropdown — close it and report
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return null;
}

/**
 * LinkedIn 2026: action buttons are rendered in a floating overlay OUTSIDE the card's DOM
 * subtree. After scrolling a card into view and dispatching hover, the "Connect" button
 * appears somewhere on the page (not inside the card). We search document-wide but verify
 * the button is contextually tied to this profile via its aria-label (contains profileId or
 * profile URL slug) or because it is the only visible Connect button on the page at that moment.
 *
 * @param {string} profileId  - URL slug of the profile, e.g. "john-smith-123"
 * @param {string} profileUrl - full /in/ URL of the profile
 * @returns {HTMLElement|null}
 */
function getConnectButtonDocument(profileId, profileUrl) {
  const slug = profileId ? profileId.toLowerCase() : '';
  const CONNECT_RE = /^(connect|conectar|conectar-se|convidar)\b/i;
  const INVITE_RE  = /^(invite .+ to connect|convidar .+ para se? conectar)/i;

  const allBtns = Array.from(document.querySelectorAll('button'));

  // First pass: prefer buttons whose aria-label explicitly names this profile
  const byLabel = allBtns.find(b => {
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    if (!CONNECT_RE.test(label) && !INVITE_RE.test(label)) return false;
    return slug && label.includes(slug.toLowerCase());
  });
  if (byLabel) return byLabel;

  // Second pass: any visible, enabled Connect button on the page
  // (safe when only one card is active / hovered at a time)
  const visible = allBtns.filter(b => {
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    const text  = b.textContent.trim().toLowerCase();
    const isConnect = CONNECT_RE.test(label) || CONNECT_RE.test(text) || INVITE_RE.test(label);
    if (!isConnect) return false;
    if (b.disabled) return false;
    const rect = b.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  // Return only if exactly one Connect button is visible (avoids ambiguity)
  if (visible.length === 1) return visible[0];

  return null;
}

/**
 * LinkedIn 2026 document-level More-menu fallback.
 * Clicks the first visible More/overflow button that is NOT inside a nav/header,
 * then waits for a dropdown Connect item. Verifies the dropdown appeared for THIS
 * profile by checking the aria-label contains the profile slug.
 */
async function getConnectButtonViaMoreDocument(profileId, profileUrl) {
  const slug = profileId ? profileId.toLowerCase() : '';

  const MORE_SELS = [
    'button[aria-label*="More actions"]',
    'button[aria-label*="More options"]',
    'button[aria-label*="Mais ações"]',
    'button[aria-label*="Mais opções"]',
  ];
  const textMatch = (b) => {
    const t = (b.getAttribute('aria-label') || b.textContent || '').trim().toLowerCase();
    return t === 'more' || t === 'more actions' || t === 'more options' ||
           t === 'mais' || t === 'mais ações'   || t === 'mais opções'  || t === '…';
  };

  // Find More button that is NOT in the main nav
  const moreBtns = [
    ...MORE_SELS.flatMap(s => Array.from(document.querySelectorAll(s))),
    ...Array.from(document.querySelectorAll('button')).filter(textMatch),
  ].filter(b => {
    if (b.disabled) return false;
    const rect = b.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    // Exclude navbar buttons (top of page)
    if (rect.top < 80) return false;
    return true;
  });

  if (!moreBtns.length) return null;

  // Click the first candidate (should be the one for the hovered card)
  await humanClick(moreBtns[0]);
  await randomWait(600, 1400);

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const dropItems = Array.from(document.querySelectorAll(
      '.artdeco-dropdown__content li, .artdeco-dropdown li'
    ));
    const connectItem = dropItems.find(li => {
      const btn = li.querySelector('button') || li;
      const label = (btn.getAttribute('aria-label') || btn.textContent || '').trim().toLowerCase();
      return /^(connect|invite .+ to connect|conectar|convidar)/i.test(label);
    });
    if (connectItem) {
      const btn = connectItem.querySelector('button') || connectItem;
      // Validate: the aria-label should reference this profile if slug available
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (!slug || label.includes(slug)) return btn;
      // Mismatch — close and skip
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return null;
    }
    await new Promise(r => setTimeout(r, 300));
  }

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return null;
}

async function handleConnectionModal(card, profileId) {
  // Poll for the invite modal to appear (up to 5 s)
  const modal = await new Promise(resolve => {
    const deadline = Date.now() + 5000;
    const tick = setInterval(() => {
      const m =
        document.querySelector('div[data-test-modal-id="send-invite-modal"]') ||
        document.querySelector('.send-invite') ||
        document.querySelector('[data-test-modal]') ||
        document.querySelector('.artdeco-modal[role="dialog"]');
      if (m || Date.now() >= deadline) { clearInterval(tick); resolve(m || null); }
    }, 300);
  });

  if (!modal) {
    // No modal — LinkedIn sent the request directly (no note required)
    return true;
  }

  // Try to click the "Add a note" button inside the modal
  const addNoteBtn =
    modal.querySelector('[aria-label="Add a note"]') ||
    modal.querySelector('button[data-control-name="add-note"]') ||
    Array.from(modal.querySelectorAll('button')).find(
      b => /add\s*a?\s*note/i.test(b.textContent)
    );

  if (addNoteBtn) {
    await humanClick(addNoteBtn);
    await randomWait(800, 1600);

    const noteInput =
      document.querySelector('#custom-message') ||
      document.querySelector('#connect-cta-form__message') ||
      document.querySelector('textarea[name="message"]') ||
      document.querySelector('.connect-button-send-invite__custom-message') ||
      document.querySelector('.artdeco-modal textarea');

    if (noteInput) {
      const firstName = extractName(card);
      const personalizedNote = CONNECTION_NOTE.replace('{firstName}', firstName);
      noteInput.focus();
      // Use execCommand so the character counter and submit-enable logic fires
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, personalizedNote);
      noteInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
      await randomWait(1000, 2000);
    }
  }

  // Find the send / submit button
  const sendButton =
    document.querySelector('[aria-label="Send now"]') ||
    document.querySelector('[aria-label="Send invitation"]') ||
    document.querySelector('button[data-control-name="send-invite-cta-btn"]') ||
    Array.from(document.querySelectorAll('.artdeco-modal button')).find(
      b => !b.disabled && /send/i.test(b.textContent.trim())
    );

  if (sendButton) {
    await humanClick(sendButton);
    await randomWait(1000, 2500);
    return true;
  }

  // Last resort: "Send without a note" so the connection is still attempted
  const sendWithoutNote =
    document.querySelector('[aria-label="Send without a note"]') ||
    Array.from(document.querySelectorAll('button')).find(
      b => /send without/i.test(b.textContent)
    );
  if (sendWithoutNote) {
    await humanClick(sendWithoutNote);
    await randomWait(1000, 2000);
    return true;
  }

  // Could not send — close the modal and skip
  const dismissButton =
    document.querySelector('[aria-label="Dismiss"]') ||
    document.querySelector('.artdeco-modal__dismiss') ||
    document.querySelector('button[data-control-name="overlay.close"]');
  if (dismissButton) await humanClick(dismissButton);
  return false;
}

// ─── No-note connection handler ───────────────────────────────────────────────
/**
 * Handles the post-click connection modal by always sending WITHOUT a note.
 * This avoids the message-compose step and feels less bot-like in terms of
 * volume (LinkedIn flags accounts that always send identical notes).
 * Logs everything for debugging.
 */
async function handleConnectionModalNoNote() {
  // Wait up to 6s for any modal to appear — LinkedIn 2026 modal is slower to paint
  const modal = await new Promise(resolve => {
    const deadline = Date.now() + 6000;
    const tick = setInterval(() => {
      const m =
        // LinkedIn 2026: "Add a note to your invitation?" dialog
        document.querySelector('[data-test-modal-id="send-invite-modal"]') ||
        document.querySelector('[data-test-modal-id="send-connections-modal"]') ||
        document.querySelector('div[aria-label*="Add a note"]') ||
        document.querySelector('div[aria-label*="invitation"]') ||
        // Classic selectors
        document.querySelector('.send-invite') ||
        document.querySelector('[data-test-modal]') ||
        document.querySelector('.artdeco-modal[role="dialog"]') ||
        document.querySelector('div[role="dialog"]');
      if (m || Date.now() >= deadline) { clearInterval(tick); resolve(m || null); }
    }, 300);
  });

  if (!modal) {
    // LinkedIn sent directly — no modal (already connected or 1st degree)
    await contentLog('📤 connection sent directly — no modal appeared');
    return true;
  }

  await contentLog('📋 connection modal appeared — looking for send-without-note button');

  // Priority: "Send without a note" — LinkedIn 2026 uses both aria-label and data-control-name
  const sendWithoutNote =
    modal.querySelector('[aria-label="Send without a note"]') ||
    modal.querySelector('[data-control-name="connect.send_without_note"]') ||
    modal.querySelector('button[data-control-name*="without"]') ||
    Array.from(modal.querySelectorAll('button')).find(
      b => /send without/i.test(b.textContent) ||
           /sem nota/i.test(b.textContent) ||
           /without a note/i.test(b.getAttribute('aria-label') || '')
    );

  if (sendWithoutNote) {
    await humanClick(sendWithoutNote);
    await randomWait(1000, 2500);
    await contentLog('✓ sent without note');
    return true;
  }

  // Fallback: generic send/submit button
  const sendBtn =
    modal.querySelector('[aria-label="Send now"]') ||
    modal.querySelector('[aria-label="Send invitation"]') ||
    modal.querySelector('button[data-control-name="send-invite-cta-btn"]') ||
    Array.from(modal.querySelectorAll('button')).find(
      b => !b.disabled && /^send/i.test(b.textContent.trim())
    );

  if (sendBtn) {
    await humanClick(sendBtn);
    await randomWait(1000, 2500);
    await contentLog('✓ sent via generic send button');
    return true;
  }

  // Could not find any send button — dismiss and log for debugging
  await contentLog('⚠ no send/dismiss button found in modal — dumping modal HTML to log', 'warn');
  await contentLog(`[modal-html] ${modal.innerHTML.slice(0, 600)}`, 'warn');

  const dismissBtn =
    modal.querySelector('[aria-label="Dismiss"]') ||
    modal.querySelector('.artdeco-modal__dismiss') ||
    modal.querySelector('button[data-control-name="overlay.close"]');
  if (dismissBtn) await humanClick(dismissBtn);
  return false;
}

// ─── Profile link logger ──────────────────────────────────────────────────────
async function logProfileLink(profileUrl, profileId, name) {
  try {
    const entry = { ts: new Date().toISOString(), url: profileUrl, profileId, name, context: 'recruiter-search' };
    const { discoveredLinks = [] } = await chrome.storage.local.get('discoveredLinks');
    discoveredLinks.push(entry);
    await chrome.storage.local.set({ discoveredLinks: discoveredLinks.slice(-1000) });
  } catch (e) { console.warn('[Recruiter Prospector][logProfileLink failed]', e); }
}

[Recruiter Prospector] [Diag] no connect btn found | card buttons: "Follow" aria="Follow Anusha Raj"
Erros
[Recruiter Prospector] [Diag] no connect btn found | card buttons: "Follow" aria="Follow Simha kiraankumar"
[Recruiter Prospector] [Diag] no connect btn found | card buttons: none
[Recruiter Prospector] [Diag] no connect btn found | card buttons: "Follow" aria="Follow Anusha Raj"
Contexto
https://www.linkedin.com/search/results/people/?keywords=Tech%20Recruiter%20Information%20Technology&network=%5B%22S%22%2C%22O%22%5D&geoUrn=%5B%22103644278%22%2C%22101165590%22%2C%22102713980%22%2C%22101739942%22%2C%22104738515%22%2C%22102890883%22%2C%22102454443%22%2C%22105015875%22%2C%22106157047%22%5D&spellCorrectionEnabled=true&prioritizeMessage=false
Rastreamento de pilha
content/recruiter-prospector.js:19 (contentLog)
content/recruiter-prospector.js:227 (prospectRecruiters)
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
281
282
283
284
285
286
287
288
289
290
291
292
293
294
295
296
297
298
299
300
301
302
303
304
305
306
307
308
309
310
311
312
313
314
315
316
317
318
319
320
321
322
323
324
325
326
327
328
329
330
331
332
333
334
335
336
337
338
339
340
341
342
343
344
345
346
347
348
349
350
351
352
353
354
355
356
357
358
359
360
361
362
363
364
365
366
367
368
369
370
371
372
373
374
375
376
377
378
379
380
381
382
383
384
385
386
387
388
389
390
391
392
393
394
395
396
397
398
399
400
401
402
403
404
405
406
407
408
409
410
411
412
413
414
415
416
417
418
419
420
421
422
423
424
425
426
427
428
429
430
431
432
433
434
435
436
437
438
439
440
441
442
443
444
445
446
447
448
449
450
451
452
453
454
455
456
457
458
459
460
461
462
463
464
465
466
467
468
469
470
471
472
473
474
475
476
477
478
479
480
481
482
483
484
485
486
487
488
489
490
491
492
493
494
495
496
497
498
499
500
501
502
503
504
505
506
507
508
509
510
511
512
513
514
515
516
517
518
519
520
521
522
523
524
525
526
527
528
529
530
531
532
533
534
535
536
537
538
539
540
541
542
543
544
545
546
547
548
549
550
551
552
553
554
555
556
557
558
559
560
561
562
563
564
565
566
567
568
569
570
571
572
573
574
575
576
577
578
579
580
581
582
583
584
585
586
587
588
589
590
591
592
593
594
595
596
597
598
599
600
601
602
603
604
605
606
607
608
609
610
611
612
613
614
615
616
617
618
619
620
621
622
623
624
625
626
627
628
629
630
631
632
633
634
635
636
637
638
639
640
641
642
643
644
645
646
647
648
649
650
651
652
653
654
655
656
657
658
659
660
661
662
663
664
665
666
667
668
669
670
671
672
673
674
675
676
677
678
679
680
681
682
683
684
685
686
687
688
689
690
691
692
693
694
695
696
697
698
699
700
701
702
703
704
705
706
707
708
709
710
711
712
713
714
715
716
717
718
719
720
721
722
723
724
725
726
727
728
729
730
731
732
733
734
735
736
737
738
739
740
741
742
743
744
745
746
747
748
749
750
751
752
753
754
755
756
757
758
759
760
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
  const entry = { ts: new Date().toISOString(), level, script: 'recruiter-prospector', msg };
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[Recruiter Prospector]', msg);
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push(entry);
    await chrome.storage.local.set({ activityLog: activityLog.slice(-300) });
  } catch (e) { console.warn('[contentLog]', e); }
}

/**
 * Daily cap is passed from the Service Worker via the START message.
 * Fallback to 9 (minimum of the 7-day cycle) if not provided.
 */
let SESSION_CAP = 9;
let VIEW_ONLY_MODE = false; // true when dailyCap=0 — browse profiles for SSI "Localizar as pessoas certas", no connections sent

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
      VIEW_ONLY_MODE = SESSION_CAP === 0;
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

/**
 * Navigates to the next LinkedIn search results page by clicking the native
 * pagination "Next" button. Returns true if navigation succeeded.
 * LinkedIn is a SPA — the URL changes via pushState and the content script
 * stays alive across pagination.
 */
async function goToNextPage() {
  const nextBtn =
    document.querySelector('button[aria-label="Next"]') ||
    document.querySelector('button[aria-label="Próximo"]') ||
    document.querySelector('button[aria-label="Siguiente"]') ||
    document.querySelector('.artdeco-pagination__button--next:not([disabled])') ||
    Array.from(document.querySelectorAll('button')).find(b => {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      const text  = b.textContent.trim().toLowerCase();
      return (label === 'next' || label === 'próximo' || text === 'next' || text === 'próximo') &&
             !b.disabled;
    });

  if (!nextBtn || nextBtn.disabled) return false;

  const prevUrl = window.location.href;
  nextBtn.click();

  // Wait up to 15s for the SPA to update the URL
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (window.location.href !== prevUrl) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function prospectRecruiters() {
  await contentLog(`▶ recruiter-prospector started | ${window.location.href}`);
  await randomWait(5000, 9000); // initial wait for SPA render

  let sent = 0;
  let totalChecked = 0;
  const MAX_PAGES = 10;

  for (let page = 1; page <= MAX_PAGES; page++) {
    if (!VIEW_ONLY_MODE && sent >= SESSION_CAP) break;

    // From page 2 onward: navigate via the Next button
    if (page > 1) {
      await randomWait(3000, 6000); // human-like pause between pages
      const navigated = await goToNextPage();
      if (!navigated) {
        await contentLog(`■ no more pages after page ${page - 1} — stopping pagination`);
        break;
      }
      await contentLog(`▶ page ${page} — waiting for SPA render...`);
      await randomWait(4000, 7000); // wait for LinkedIn SPA to paint new results
    }

    const cards = await waitForElements(getSearchResultCards);
    if (!cards.length) {
      if (page === 1) {
        console.warn('[Recruiter Prospector] No search result cards found — selectors may need updating.');
        await contentLog('✗ recruiter-prospector — no search result cards found (waited 20 s)', 'warn');
        await chrome.storage.local.set({ lastProspecting: { sent: 0, runAt: new Date().toISOString() } });
        return { sent: 0 };
      }
      await contentLog(`✗ page ${page} — no cards found — stopping pagination`, 'warn');
      break;
    }

    await contentLog(`page ${page}/${MAX_PAGES} — ${cards.length} cards found`);
    totalChecked += cards.length;

    for (const card of cards) {
      if (!VIEW_ONLY_MODE && sent >= SESSION_CAP) break;

      const profileId = extractProfileId(card);
      if (!profileId) continue;

      const profileUrl = extractProfileUrl(card) || `/in/${profileId}`;

      // Skip profiles with a locale suffix in the URL — e.g. /en/, /pt/, /es/
      // These are typically Brazilians who set their LinkedIn UI to English.
      // We want genuinely global profiles, not localised ones.
      if (/\/in\/[^/]+\/[a-z]{2}(-[a-zA-Z]{2,4})?\/?($|\?)/.test(profileUrl)) {
        await contentLog(`↷ ${profileUrl} — skipped (locale-suffixed URL, likely BR)`);
        continue;
      }

      // VIEW_ONLY_MODE: scroll each card — signals "Find Right People" to LinkedIn SSI
      if (VIEW_ONLY_MODE) {
        await scrollIntoViewAndPause(card);
        await randomWait(2000, 4500);
        await logProfileLink(profileUrl, profileId, '');
        await contentLog(`👁 ${profileUrl} — viewed (SSI: localizar as pessoas certas)`);
        continue;
      }

      // Log every profile we encounter (for later human review)
      const firstName = extractName(card);
      await logProfileLink(profileUrl, profileId, firstName);

      const locked = await isRecruiterLocked(profileId);
      if (locked) {
        // Scroll into view even when locked — SSI counts profile impressions from search
        await scrollIntoViewAndPause(card);
        await randomWait(1500, 3000);
        console.log(`[Recruiter Prospector] Skipping ${profileId} — within 7-day lock.`);
        await contentLog(`↷ ${profileUrl} — locked (7-day, viewed)`);
        continue;
      }

      // LinkedIn 2026 lazy-renders action buttons only after the card scrolls into view
      // and receives a hover event. Dispatch both pointer and mouse events (LinkedIn uses both).
      await scrollIntoViewAndPause(card);
      await readBeforeActing(card, 2000, 5000);
      card.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
      card.dispatchEvent(new MouseEvent('mouseenter',    { bubbles: true }));
      card.dispatchEvent(new PointerEvent('pointermove',  { bubbles: true, cancelable: true }));
      card.dispatchEvent(new MouseEvent('mouseover',      { bubbles: true, cancelable: true }));
      await waitForButtonsInCard(card, 6000);

      // Try direct Connect button inside the card first
      let connectButton = getConnectButton(card);
      let viaMoreMenu = false;

      if (!connectButton) {
        // Connect may be hidden inside the "More actions" overflow menu inside card
        connectButton = await getConnectButtonViaMore(card);
        if (connectButton) viaMoreMenu = true;
      }

      // LinkedIn 2026: action buttons are rendered in a floating overlay OUTSIDE the card's
      // DOM subtree. After hover, scan the full document for a Connect button whose
      // aria-label contains the profile ID or whose nearest ancestor link matches the URL.
      if (!connectButton) {
        connectButton = getConnectButtonDocument(profileId, profileUrl);
      }

      // Last resort: open More actions at document level and search the dropdown
      if (!connectButton) {
        connectButton = await getConnectButtonViaMoreDocument(profileId, profileUrl);
        if (connectButton) viaMoreMenu = true;
      }

      if (!connectButton) {
        await randomWait(1000, 2500);
        // Diagnostic: log all button texts/aria-labels in this card so we can tune selectors
        const btns = Array.from(card.querySelectorAll('button'))
          .map(b => `"${b.textContent.trim().slice(0,30)}" aria="${(b.getAttribute('aria-label')||'').slice(0,50)}"`)
          .join(' | ');
        await contentLog(`[Diag] no connect btn found | card buttons: ${btns || 'none'}`, 'warn');
        await contentLog(`↷ ${profileUrl} — no connect button (viewed)`);
        continue;
      }

      await humanClick(connectButton);

      // Send connection WITHOUT a note — avoids modal friction and feels more organic
      const connected = await handleConnectionModalNoNote();
      if (!connected) {
        await contentLog(`⚠ connection modal handled but send failed | ${profileUrl}`, 'warn');
        continue;
      }

      await markRecruiterInteracted(profileId, firstName);
      sent++;
      await contentLog(`✓ ${profileUrl} | ${firstName} — connected (${sent}/${SESSION_CAP}) [p${page}]`, 'success');

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
  }

  await chrome.storage.local.set({
    lastProspecting: { sent, runAt: new Date().toISOString() },
  });
  await contentLog(`■ recruiter-prospector DONE | ${sent} sent / ${totalChecked} checked`, 'success');

  return { sent };
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

/**
 * Polls up to maxWait ms for the action button set to fully render inside a card.
 * LinkedIn 2026 lazy-renders buttons after scroll/hover: first "Follow" appears, then
 * "Connect" / "More (…)" appear a beat later. We wait for ≥2 buttons so the overflow
 * menu button is present before we try to open it. Falls back after maxWait.
 */
async function waitForButtonsInCard(card, maxWait = 6000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const btns = Array.from(card.querySelectorAll('button'));
    if (btns.length >= 2) return; // Follow + More/Connect both rendered
    if (btns.some(b => {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      const text  = b.textContent.trim().toLowerCase();
      return /^connect/i.test(label) || /^connect/i.test(text) ||
             /^convidar/i.test(label) || /^conectar/i.test(label);
    })) return; // Connect button appeared directly — no need to wait for More
    await new Promise(r => setTimeout(r, 300));
  }
}

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

  // Strategy 4 (LinkedIn 2025): div-based result containers (LinkedIn migrated away from li in some views)
  const byDivResult = Array.from(document.querySelectorAll(
    'div.search-result, div[class*="search-result"], ' +
    'div.reusable-search__result-container'
  )).filter(el => el.querySelector('a[href*="/in/"]'));
  if (byDivResult.length) { console.log(`[Recruiter Prospector] Found ${byDivResult.length} cards via div-result fallback.`); return byDivResult; }

  // Strategy 5 (LinkedIn 2026): data-attribute based containers used in Chameleon/Voyager redesign
  const byDataAttr = Array.from(document.querySelectorAll(
    '[data-chameleon-result-urn], [data-entity-urn*="fs_miniProfile"], ' +
    '[data-member-id], [data-view-name*="entity-result"]'
  )).filter(el => el.querySelector('a[href*="/in/"]'));
  if (byDataAttr.length) { console.log(`[Recruiter Prospector] Found ${byDataAttr.length} cards via data-attr strategy.`); return byDataAttr; }

  // Strategy 6: walk UP from each profile link to find the closest card-like container
  // (avoids the old "outermost ancestor per profile" bug that returned page-wide containers
  //  containing nav, pagination and ad buttons alongside card buttons)
  const allProfileLinks = Array.from(document.querySelectorAll('a[href*="/in/"]'));
  const seenUrls = new Set();
  const closestContainers = [];
  for (const link of allProfileLinks) {
    const key = link.href.split('?')[0];
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    // Walk up: take the closest <li>, or the closest bounded <div> that is card-sized
    let el = link.parentElement;
    let best = null;
    while (el && el.tagName !== 'BODY') {
      if (el.tagName === 'LI') { best = el; break; }
      if (el.tagName === 'DIV') {
        const rect = el.getBoundingClientRect();
        // Card heuristic: taller than a line but shorter than two viewport heights,
        // and wide enough to be a result item (not a narrow sidebar widget)
        if (rect.height > 60 && rect.height < 500 && rect.width > 300) {
          best = el;
          break;
        }
      }
      el = el.parentElement;
    }
    if (best) closestContainers.push(best);
  }
  if (closestContainers.length) { console.log(`[Recruiter Prospector] Found ${closestContainers.length} cards via closest-container strategy.`); return closestContainers; }

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
  return Array.from(card.querySelectorAll('button')).find(b => {
    const text  = b.textContent.trim().toLowerCase();
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    return text === 'connect' ||
           text === 'conectar' ||
           text === 'conectar-se' ||
           text.startsWith('connect') ||
           text.startsWith('conectar') ||
           /^connect/i.test(label) ||
           /^conectar/i.test(label) ||
           /^convidar/i.test(label) ||
           (/convidar/i.test(label) && /conectar/i.test(label)) ||
           /^invite .+ to connect/i.test(label) ||
           /^convidar .+ para se? conectar/i.test(label);
  }) || null;
}

async function getConnectButtonViaMore(card) {
  // Look for the More button first inside the card, then at document level
  // (LinkedIn 2026 may render action overlays outside the li container)
  const MORE_SELS = [
    'button[aria-label*="More actions"]',
    'button[aria-label*="More options"]',
    'button[aria-label*="Mais ações"]',
    'button[aria-label*="Mais opções"]',
    'button[aria-label*="Mais ação"]',
    // Catch-all patterns for LinkedIn 2026 Chameleon design
    'button.artdeco-dropdown__trigger',
    'button[data-control-name*="overflow"]',
    'button[data-control-name*="more"]',
  ];
  const textMatch = (b) => {
    const t = (b.getAttribute('aria-label') || b.textContent || '').trim().toLowerCase();
    // Use startsWith so "More options for John" also matches
    return t.startsWith('more') || t === '…' || t === '...' ||
           t.startsWith('mais') || t.includes('overflow actions');
  };

  let moreBtn =
    MORE_SELS.reduce((f, s) => f || card.querySelector(s), null) ||
    Array.from(card.querySelectorAll('button')).find(textMatch);

  // Fallback: the More button may live outside the card's DOM subtree in a floating overlay.
  // Use geometric proximity instead of document.querySelector (which returns the wrong card's button).
  if (!moreBtn) {
    const cardRect = card.getBoundingClientRect();
    const candidates = [
      ...MORE_SELS.flatMap(s => Array.from(document.querySelectorAll(s))),
      ...Array.from(document.querySelectorAll('button')).filter(textMatch),
    ];
    moreBtn = candidates.find(b => {
      if (b.disabled) return false;
      const rect = b.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      // Accept the button if it sits within the card's vertical band (±60 px slack)
      return rect.top >= cardRect.top - 60 && rect.bottom <= cardRect.bottom + 60;
    });
  }

  if (!moreBtn) return null;

  await humanClick(moreBtn);
  await randomWait(600, 1400);

  // Poll up to 3s for the dropdown Connect item to appear
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const item =
      document.querySelector('.artdeco-dropdown__content li button[aria-label*="Connect"]') ||
      document.querySelector('.artdeco-dropdown__content li button[aria-label*="Invite"]') ||
      document.querySelector('.artdeco-dropdown__content li button[aria-label*="Conectar"]') ||
      document.querySelector('.artdeco-dropdown__content li button[aria-label*="Convidar"]') ||
      Array.from(document.querySelectorAll(
        '.artdeco-dropdown__content li, .artdeco-dropdown li'
      )).reduce((found, li) => {
        if (found) return found;
        const btn = li.querySelector('button') || li;
        const label = (btn.getAttribute('aria-label') || btn.textContent || '').trim().toLowerCase();
        return (
          label === 'connect'   || label.startsWith('connect ')   || /^invite .+ to connect/i.test(label)  ||
          label === 'conectar'  || label.startsWith('conectar ')  || /^convidar .+ para se? conectar/i.test(label) ||
          label === 'convidar'
        ) ? btn : null;
      }, null);
    if (item) return item;
    await new Promise(r => setTimeout(r, 300));
  }

  // Connect not in dropdown — close it and report
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return null;
}

/**
 * LinkedIn 2026: action buttons are rendered in a floating overlay OUTSIDE the card's DOM
 * subtree. After scrolling a card into view and dispatching hover, the "Connect" button
 * appears somewhere on the page (not inside the card). We search document-wide but verify
 * the button is contextually tied to this profile via its aria-label (contains profileId or
 * profile URL slug) or because it is the only visible Connect button on the page at that moment.
 *
 * @param {string} profileId  - URL slug of the profile, e.g. "john-smith-123"
 * @param {string} profileUrl - full /in/ URL of the profile
 * @returns {HTMLElement|null}
 */
function getConnectButtonDocument(profileId, profileUrl) {
  const slug = profileId ? profileId.toLowerCase() : '';
  const CONNECT_RE = /^(connect|conectar|conectar-se|convidar)\b/i;
  const INVITE_RE  = /^(invite .+ to connect|convidar .+ para se? conectar)/i;

  const allBtns = Array.from(document.querySelectorAll('button'));

  // First pass: prefer buttons whose aria-label explicitly names this profile
  const byLabel = allBtns.find(b => {
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    if (!CONNECT_RE.test(label) && !INVITE_RE.test(label)) return false;
    return slug && label.includes(slug.toLowerCase());
  });
  if (byLabel) return byLabel;

  // Second pass: any visible, enabled Connect button on the page
  // (safe when only one card is active / hovered at a time)
  const visible = allBtns.filter(b => {
    const label = (b.getAttribute('aria-label') || '').toLowerCase();
    const text  = b.textContent.trim().toLowerCase();
    const isConnect = CONNECT_RE.test(label) || CONNECT_RE.test(text) || INVITE_RE.test(label);
    if (!isConnect) return false;
    if (b.disabled) return false;
    const rect = b.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  // Return only if exactly one Connect button is visible (avoids ambiguity)
  if (visible.length === 1) return visible[0];

  return null;
}

/**
 * LinkedIn 2026 document-level More-menu fallback.
 * Clicks the first visible More/overflow button that is NOT inside a nav/header,
 * then waits for a dropdown Connect item. Verifies the dropdown appeared for THIS
 * profile by checking the aria-label contains the profile slug.
 */
async function getConnectButtonViaMoreDocument(profileId, profileUrl) {
  const slug = profileId ? profileId.toLowerCase() : '';

  const MORE_SELS = [
    'button[aria-label*="More actions"]',
    'button[aria-label*="More options"]',
    'button[aria-label*="Mais ações"]',
    'button[aria-label*="Mais opções"]',
  ];
  const textMatch = (b) => {
    const t = (b.getAttribute('aria-label') || b.textContent || '').trim().toLowerCase();
    return t === 'more' || t === 'more actions' || t === 'more options' ||
           t === 'mais' || t === 'mais ações'   || t === 'mais opções'  || t === '…';
  };

  // Find More button that is NOT in the main nav
  const moreBtns = [
    ...MORE_SELS.flatMap(s => Array.from(document.querySelectorAll(s))),
    ...Array.from(document.querySelectorAll('button')).filter(textMatch),
  ].filter(b => {
    if (b.disabled) return false;
    const rect = b.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    // Exclude navbar buttons (top of page)
    if (rect.top < 80) return false;
    return true;
  });

  if (!moreBtns.length) return null;

  // Click the first candidate (should be the one for the hovered card)
  await humanClick(moreBtns[0]);
  await randomWait(600, 1400);

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const dropItems = Array.from(document.querySelectorAll(
      '.artdeco-dropdown__content li, .artdeco-dropdown li'
    ));
    const connectItem = dropItems.find(li => {
      const btn = li.querySelector('button') || li;
      const label = (btn.getAttribute('aria-label') || btn.textContent || '').trim().toLowerCase();
      return /^(connect|invite .+ to connect|conectar|convidar)/i.test(label);
    });
    if (connectItem) {
      const btn = connectItem.querySelector('button') || connectItem;
      // Validate: the aria-label should reference this profile if slug available
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (!slug || label.includes(slug)) return btn;
      // Mismatch — close and skip
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return null;
    }
    await new Promise(r => setTimeout(r, 300));
  }

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return null;
}

async function handleConnectionModal(card, profileId) {
  // Poll for the invite modal to appear (up to 5 s)
  const modal = await new Promise(resolve => {
    const deadline = Date.now() + 5000;
    const tick = setInterval(() => {
      const m =
        document.querySelector('div[data-test-modal-id="send-invite-modal"]') ||
        document.querySelector('.send-invite') ||
        document.querySelector('[data-test-modal]') ||
        document.querySelector('.artdeco-modal[role="dialog"]');
      if (m || Date.now() >= deadline) { clearInterval(tick); resolve(m || null); }
    }, 300);
  });

  if (!modal) {
    // No modal — LinkedIn sent the request directly (no note required)
    return true;
  }

  // Try to click the "Add a note" button inside the modal
  const addNoteBtn =
    modal.querySelector('[aria-label="Add a note"]') ||
    modal.querySelector('button[data-control-name="add-note"]') ||
    Array.from(modal.querySelectorAll('button')).find(
      b => /add\s*a?\s*note/i.test(b.textContent)
    );

  if (addNoteBtn) {
    await humanClick(addNoteBtn);
    await randomWait(800, 1600);

    const noteInput =
      document.querySelector('#custom-message') ||
      document.querySelector('#connect-cta-form__message') ||
      document.querySelector('textarea[name="message"]') ||
      document.querySelector('.connect-button-send-invite__custom-message') ||
      document.querySelector('.artdeco-modal textarea');

    if (noteInput) {
      const firstName = extractName(card);
      const personalizedNote = CONNECTION_NOTE.replace('{firstName}', firstName);
      noteInput.focus();
      // Use execCommand so the character counter and submit-enable logic fires
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, personalizedNote);
      noteInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
      await randomWait(1000, 2000);
    }
  }

  // Find the send / submit button
  const sendButton =
    document.querySelector('[aria-label="Send now"]') ||
    document.querySelector('[aria-label="Send invitation"]') ||
    document.querySelector('button[data-control-name="send-invite-cta-btn"]') ||
    Array.from(document.querySelectorAll('.artdeco-modal button')).find(
      b => !b.disabled && /send/i.test(b.textContent.trim())
    );

  if (sendButton) {
    await humanClick(sendButton);
    await randomWait(1000, 2500);
    return true;
  }

  // Last resort: "Send without a note" so the connection is still attempted
  const sendWithoutNote =
    document.querySelector('[aria-label="Send without a note"]') ||
    Array.from(document.querySelectorAll('button')).find(
      b => /send without/i.test(b.textContent)
    );
  if (sendWithoutNote) {
    await humanClick(sendWithoutNote);
    await randomWait(1000, 2000);
    return true;
  }

  // Could not send — close the modal and skip
  const dismissButton =
    document.querySelector('[aria-label="Dismiss"]') ||
    document.querySelector('.artdeco-modal__dismiss') ||
    document.querySelector('button[data-control-name="overlay.close"]');
  if (dismissButton) await humanClick(dismissButton);
  return false;
}

// ─── No-note connection handler ───────────────────────────────────────────────
/**
 * Handles the post-click connection modal by always sending WITHOUT a note.
 * This avoids the message-compose step and feels less bot-like in terms of
 * volume (LinkedIn flags accounts that always send identical notes).
 * Logs everything for debugging.
 */
async function handleConnectionModalNoNote() {
  // Wait up to 6s for any modal to appear — LinkedIn 2026 modal is slower to paint
  const modal = await new Promise(resolve => {
    const deadline = Date.now() + 6000;
    const tick = setInterval(() => {
      const m =
        // LinkedIn 2026: "Add a note to your invitation?" dialog
        document.querySelector('[data-test-modal-id="send-invite-modal"]') ||
        document.querySelector('[data-test-modal-id="send-connections-modal"]') ||
        document.querySelector('div[aria-label*="Add a note"]') ||
        document.querySelector('div[aria-label*="invitation"]') ||
        // Classic selectors
        document.querySelector('.send-invite') ||
        document.querySelector('[data-test-modal]') ||
        document.querySelector('.artdeco-modal[role="dialog"]') ||
        document.querySelector('div[role="dialog"]');
      if (m || Date.now() >= deadline) { clearInterval(tick); resolve(m || null); }
    }, 300);
  });

  if (!modal) {
    // LinkedIn sent directly — no modal (already connected or 1st degree)
    await contentLog('📤 connection sent directly — no modal appeared');
    return true;
  }

  await contentLog('📋 connection modal appeared — looking for send-without-note button');

  // Priority: "Send without a note" — LinkedIn 2026 uses both aria-label and data-control-name
  const sendWithoutNote =
    modal.querySelector('[aria-label="Send without a note"]') ||
    modal.querySelector('[data-control-name="connect.send_without_note"]') ||
    modal.querySelector('button[data-control-name*="without"]') ||
    Array.from(modal.querySelectorAll('button')).find(
      b => /send without/i.test(b.textContent) ||
           /sem nota/i.test(b.textContent) ||
           /without a note/i.test(b.getAttribute('aria-label') || '')
    );

  if (sendWithoutNote) {
    await humanClick(sendWithoutNote);
    await randomWait(1000, 2500);
    await contentLog('✓ sent without note');
    return true;
  }

  // Fallback: generic send/submit button
  const sendBtn =
    modal.querySelector('[aria-label="Send now"]') ||
    modal.querySelector('[aria-label="Send invitation"]') ||
    modal.querySelector('button[data-control-name="send-invite-cta-btn"]') ||
    Array.from(modal.querySelectorAll('button')).find(
      b => !b.disabled && /^send/i.test(b.textContent.trim())
    );

  if (sendBtn) {
    await humanClick(sendBtn);
    await randomWait(1000, 2500);
    await contentLog('✓ sent via generic send button');
    return true;
  }

  // Could not find any send button — dismiss and log for debugging
  await contentLog('⚠ no send/dismiss button found in modal — dumping modal HTML to log', 'warn');
  await contentLog(`[modal-html] ${modal.innerHTML.slice(0, 600)}`, 'warn');

  const dismissBtn =
    modal.querySelector('[aria-label="Dismiss"]') ||
    modal.querySelector('.artdeco-modal__dismiss') ||
    modal.querySelector('button[data-control-name="overlay.close"]');
  if (dismissBtn) await humanClick(dismissBtn);
  return false;
}

// ─── Profile link logger ──────────────────────────────────────────────────────
async function logProfileLink(profileUrl, profileId, name) {
  try {
    const entry = { ts: new Date().toISOString(), url: profileUrl, profileId, name, context: 'recruiter-search' };
    const { discoveredLinks = [] } = await chrome.storage.local.get('discoveredLinks');
    discoveredLinks.push(entry);
    await chrome.storage.local.set({ discoveredLinks: discoveredLinks.slice(-1000) });
  } catch (e) { console.warn('[Recruiter Prospector][logProfileLink failed]', e); }
}
